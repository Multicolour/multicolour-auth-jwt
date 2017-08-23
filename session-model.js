"use strict"

// Limit writes to the user.
const constraint = { user: "auth.credentials.user.id" }

module.exports = {
  identity: "session",

  // Session's details.
  attributes: {
    token: {
      type: "string",
      required: true,
      unique: true
    },
    verifier: "string",
    provider: "string",
    user: {
      model: "multicolour_user"
    },

    /**
     * By default, we don't want any NULL
     * or undefined values in our response.
     * @return {Object} without any undefined or null values.
     */
    toJSON() {
      // Get the object.
      const model = this.toObject()

      // Remove any NULL/undefined values.
      Object.keys(model).forEach(key => {
        if (model[key] === null || typeof model[key] === "undefined") {
          delete model[key]
        }
      })

      // Return the modified object.
      return model
    }
  },

  // Constrain write operations to the session owner.
  constraints: {
    get: constraint,
    patch: constraint,
    put: constraint,
    delete: constraint
  },

  NO_AUTO_GEN_ROUTES: true,
  NO_AUTO_GEN_FRONTEND: true,

  associations: [{
    alias: "user"
  }],

  custom_routes: function custom_session_routes(server, multicolour) {
    const Joi = require("joi")
    const boom = require("boom")

    const headers = multicolour.get("server")
      .request("header_validator")
      .get()

    headers.authorization = Joi.string().required().description("The token issued to you to get a session by.")

    server.route([
      {
        path: "/session",
        method: "GET",
        config: {
          auth: "jwt",
          tags: ["api", "session"],
          validate: {
            headers: Joi.object(headers).unknown(true)
          },
          description: "Validate your token by attempting to retrieve it.",
          handler: (request, reply) => {
            this.findOne({
              token: request.headers.authorization.replace("Bearer ", "")
            })
              .populateAll()
              .then(reply)
              .catch(error => boom.wrap(error))
          }
        }
      },
      {
        path: "/session",
        method: "DELETE",
        config: {
          auth: "jwt",
          tags: ["api", "session"],
          validate: {
            headers: Joi.object(headers).unknown(true)
          },
          description: "Delete your token.",
          handler: (request, reply) => {
            this.destroy({
              token: request.headers.authorization.replace("Bearer ", "")
            })
              .limit(1)
              .then(reply)
              .catch(error => boom.wrap(error))
          }
        }
      }
    ])
  }
}
