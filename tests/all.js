"use strict"

const tape = require("tape")
const Multicolour = require("multicolour")

const plugin = new (require("../index"))()

// Where we keep the test content.
const test_content_path = "./tests/test_content"

const USER = {
  id: 1,
  username: "multicolour",
  password: "password",
  email: "hello@newworld.codes",
  name: "Multicolour"
}

tape("Multicolour Hapi Auth JWT.", test => {
  // Create a multicolour instance.
  const multicolour = Multicolour
    .new_from_config_file_path(`${test_content_path}/config.js`)
    .scan()


  multicolour.get("database").start(() => {
    test.plan(3)
    const models = multicolour.get("database").get("models")

    models.multicolour_user
      .create(USER)
      .catch(error => { throw error })
      .then(() => {
        plugin.validate(multicolour, USER, (err, authed, user) => {
          test.equals(err, null, "no error during user validation")
          test.equals(authed, true, "authed is true")
          test.ok(user, "user validated is 👌🏻")
        })
      })
  })
})
