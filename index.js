"use strict"

const Joi = require("joi")

class Multicolour_Auth_JWT {
  validate(multicolour, decoded, callback) {
    multicolour.get("database").get("models").multicolour_user
      .findOne({ id: decoded.id, email: decoded.email })
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

    server.register(require("hapi-auth-jwt2"), err => {
      if (err) {
        throw err
      }

      server.auth.strategy("jwt", "jwt", {
        key: config.password,
        validateFunc: (decoded, request, callback) =>
          this.validate(host, decoded, callback),
        verifyOptions: {
          algorithms: config.algorithms || [ "HS256" ]
        }
      })

      server.auth.default("jwt")
    })

    // Headers for the session endpoints.
    const headers = host.request("header_validator").get()
    delete headers.authorization

    server.route({
      method: "POST",
      path: "/session",
      config: {
        auth: false,
        handler: (request, reply) => {
          // Tools.
          const method = request.headers.accept
          const mc_utils = require("multicolour/lib/utils")
          const models = host.get("database").get("models")
          const jwt = require("jsonwebtoken")

          models
            .multicolour_user.findOne({
              email: request.payload.email.toString(),
              requires_password: false
            })
            .exec((err, user) => {
              // Check for errors.
              if (err) {
                reply[method](err, models.multicolour_user)
              }
              // Check a user for that email exists and the passwords match.
              else if (!user) {
                reply[method](new Error("Invalid login."), models.multicolour_user).code(403)
              }
              // We're good to create a session.
              else {
                // Hash the password.
                mc_utils.hash_password(request.payload.password, user.salt, hashed_password => {
                  if (user.password !== hashed_password) {
                    return reply[method](new Error("Invalid login."), models.multicolour_user).code(403)
                  }

                  // Create the token.
                  const token = jwt.sign({ id: user.id, email: user.email }, config.password, config.jwt_options)

                  // Create a session document.
                  models.session.create({
                    provider: "jwt",
                    user: user.id,
                    token
                  }, (err, session) => {
                    // Check for errors.
                    if (err) {
                      reply[method](err, models.session)
                    }
                    else {
                      reply[method](session, models.session).code(202)
                    }
                  })
                })
              }
            })
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
