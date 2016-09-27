"use strict"

module.exports = {
  attributes: {
    name: {
      required: true,
      type: "string"
    },
    age: {
      required: true,
      type: "integer",
      min: 0,
      max: 9000
    },

    user: {
      model: "multicolour_user"
    }
  },

  roles: {
    get: ["user"]
  },

  can_upload_file: true,
  custom_routes: () => {}
}
