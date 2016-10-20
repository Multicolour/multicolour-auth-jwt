"use strict"

const Joi = require("joi")
const boom = require("boom")

/**
 * Get the decorator assigned to an Accept header
 * value, if no negotiation available default
 * application/json is returned from the interface.
 * @param  {Object} reply_interface to return decorator on.
 * @param  {String} accept_value to try and get a decorator for.
 * @return {Function} decorator on the reply interface.
 */
function get_decorator_for_apply_value(reply_interface, accept_value) {
  // Normalise the passed value.
  const accept = accept_value ? accept_value.toString().toLowerCase() : "application/json"

  // Return the function.
  return reply_interface.hasOwnProperty(accept) ?
    reply_interface[accept].bind(reply_interface) :
    reply_interface["application/json"].bind(reply_interface)
}

class Multicolour_Auth_JWT {
  constructor(host) {
    host.request("host")._enable_user_model()
  }

  /**
   * Validate values against the database and
   * call the callback with the results.
   *
   * @param {Object} decoded values to validate against database.
   * @param {Function} callback to execute with validation results.
   */
  validate(decoded, callback) {
    this.multicolour.get("database").get("models").multicolour_user
      .findOne({ id: decoded.id, email: decoded.email, username: decoded.username })
      .populateAll()
      .exec((err, user) => {
        if (err)
          callback(err, false, {})
        else if (!user)
          callback(null, false)
        else
          callback(null, true, user)
      })
  }

  /**
   * Attempt to authorise a posted payload's claim.
   *
   * @param {String} identifier; the username/email/whatever identifier.
   * @param {String} password to authorise.
   * @param {String} identifier_field; the key in the payload to validate.
   */
  auth(identifier, password, callback, identifier_field) {
    identifier_field = identifier_field || "email"

    const multicolour = this.multicolour
    const mc_utils = require("multicolour/lib/utils")
    const models = multicolour.get("database").get("models")
    const jwt = require("jsonwebtoken")

    const config = multicolour.get("config").get("auth")

    models.multicolour_user
      .findOne({
        [identifier_field]: identifier,
        requires_password: false
      })
      .then(user => {
        if (!user) {
          return callback(boom.unauthorized())
        }
        // We're good to create a session.
        else {
          // Hash the password.
          mc_utils.hash_password(password, user.salt, hashed_password => {

            if (user.password !== hashed_password) {
              return callback(boom.unauthorized())
            }

            // Create the token.
            const token = jwt.sign({
              id: user.id,
              email: user.email,
              username: user.username
            }, config.password, config.jwt_options)

            // Create a session document.
            models.session.create({
              provider: "jwt",
              user: user.id,
              token
            }, (err, session) => {
              // Check for errors.
              if (err) {
                callback(err)
              }
              else {
                multicolour.trigger("auth_session_created", session)
                callback(null, session)
              }
            })
          })
        }
      })
      .catch(callback)
  }

  register(generator) {
    // Get tools.
    const joi = require("joi")

    // Get the host and server.
    this.multicolour = generator.request("host")
    const server = generator.request("raw")

    // Get the config.
    const config = this.multicolour.get("config").get("auth")

    // Register the session model with the hosting Multicolour's Waterline instance.
    this.multicolour._enable_user_model()
    this.multicolour.get("database").register_new_model(require.resolve("./session-model"))

    generator
      .reply("auth_plugin", this)

      // Get the token for use in the routes.
      .reply("auth_config", "jwt")

      // Add another header to validate.
      .request("header_validator")
        .set("authorization", joi.string().required())

    generator.on("auth_login", args => {
      const identifier_field = args.identifier_field || "email"
      const identifier = args[identifier_field]
      const password = args.password
      const callback = args.callback ? args.callback : () => {}

      this.auth(identifier, password, callback, identifier_field)
    })

    server.register(require("hapi-auth-jwt2"), err => {
      if (err) {
        throw err
      }

      server.auth.strategy("jwt", "jwt", {
        key: config.password,
        validateFunc: (decoded, request, callback) =>
          this.validate(decoded, callback),
        verifyOptions: {
          algorithms: config.algorithms || [ "HS256" ]
        }
      })

      server.auth.default("jwt")
    })

    // Headers for the session endpoints.
    const headers = this.multicolour.request("header_validator").get()
    delete headers.authorization

    server.route({
      method: "POST",
      path: "/session",
      config: {
        auth: false,
        handler: (request, reply) => {
          const method = request.headers.accept
          const models = this.multicolour.get("database").get("models")

          const args = {
            email: request.payload.email.toString(),
            password: request.payload.password,
            callback: (err, session) => {
              // Check for errors.
              if (err)
                reply(boom.wrap(err))
              else
                get_decorator_for_apply_value(reply, method)(session, models.session).code(202)
            }
          }

          generator.trigger("auth_login", args)
        },
        validate: {
          headers: Joi.object(headers).unknown(true),
          payload: {
            email: Joi.string().required(),
            password: Joi.string().required()
          }
        },
        description: "Create a new session",
        notes: "Create a new session",
        tags: ["api", "auth", "jwt"]
      }
    })
  }
}

module.exports = Multicolour_Auth_JWT
