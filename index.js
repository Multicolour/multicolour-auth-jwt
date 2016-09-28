"use strict"

const Joi = require("joi")

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

const ERROR_INVALID_USERNAME = 'Invalid login.';
const ERROR_INVALID_PASSWORD = 'Invalid login.';

class Multicolour_Auth_JWT {
  validate(multicolour, decoded, callback) {
    multicolour.get("database").get("models").multicolour_user
      .findOne({ id: decoded.id, email: decoded.email, username: decoded.username })
      .populateAll()
      .exec((err, user) => {
        if (err) {
          callback(err, false)
        }
        else if (!user) {
          callback(null, false)
        }
        else {
          callback(null, true, user)
        }
      })
  }

  auth(multicolour, identifier, password, callback, identifier_field = 'email') {
    //const method = request.headers.accept
    const mc_utils = require("multicolour/lib/utils")
    const models = multicolour.get("database").get("models")
    const jwt = require("jsonwebtoken")

    const config = multicolour.get("config").get("auth")

    models
      .multicolour_user.findOne({
        [identifier_field]: identifier,
        requires_password: false
      })
      .catch(err => {
        callback(err);
      })
      .then(user => {
        if (!user) {
          return callback(new Error(ERROR_INVALID_USERNAME, 403));
        }
        // We're good to create a session.
        else {
          // Hash the password.
          mc_utils.hash_password(password, user.salt, hashed_password => {

            if (user.password !== hashed_password) {
              return callback(new Error(ERROR_INVALID_USERNAME));
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
                callback(err);
              }
              else {
                multicolour.trigger('auth_session_created', session);
                callback(null, session);
              }
            })
          })
        }
      })
  }

  register(generator) {
    // Get tools.
    const joi = require("joi")

    // Get the host and server.
    const host = generator.request("host")
    const server = generator.request("raw")

    // Get the config.
    const config = host.get("config").get("auth")

    // Register the session model with the hosting Multicolour's Waterline instance.
    host.get("database").get("definitions").session = require("./session-model")

    generator
      .reply("auth_plugin", this)

      // Get the token for use in the routes.
      .reply("auth_config", "jwt")

      // Add another header to validate.
      .request("header_validator")
        .set("authorization", joi.string().required())

    generator.on('auth_login', args => {
      const identifier_field = args.identifier_field || 'email';
      const identifier = args[identifier_field];
      const password = args.password;
      const callback = args.callback ? args.callback : _ => {};

      this.auth(host, identifier, password, callback, identifier_field);
    })

    server.register(require("hapi-auth-jwt2"), err => {
      if (err) {
        throw err
      }

      server.auth.strategy("jwt", "jwt", {
        key: config.password,
        validateFunc: (decoded, request, callback) => {
          // TODO: Redirect when not requesting JSON

          this.validate(host, decoded, callback)
        },
        verifyOptions: {
          algorithms: config.algorithms || [ "HS256" ]
        }
      })

      server.auth.default("jwt")
    })

    // Headers for the session endpoints.
    const headers = host.request("header_validator").get()
    delete headers.authorization;

    server.route({
      method: "POST",
      path: "/session",
      config: {
        auth: false,
        handler: (request, reply) => {
          const models = host.get("database").get("models")
          const method = request.headers.accept;
          const args = {
            email: request.payload.email.toString(),
            password: request.payload.email,
            callback: (err, session) => {
              if (err) {
                return get_decorator_for_apply_value(reply, method)(err, models.multicolour_user).code(err.code || 500)
              }

              get_decorator_for_apply_value(reply, method)(session, models.session).code(202)
            }
          }

          generator.trigger('auth_login', args);
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
