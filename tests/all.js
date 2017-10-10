"use strict"

const tape = require("tape")
const Multicolour = require("multicolour")

const plugin = require("../index")

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
  test.plan(4)

  // Create a multicolour instance.
  const multicolour = Multicolour
    .new_from_config_file_path(`${test_content_path}/config.js`)
    .scan()

  test.doesNotThrow(() => {
    multicolour.use(require("multicolour-server-hapi"))
      .get("server")
      .use(plugin)
  }, "Registers without error.")

  multicolour.get("database").start().then(() => {
    const models = multicolour.get("database").get("models")

    models.multicolour_user
      .create(USER)
      .catch(error => { throw error })
      .then(() => {
        multicolour.get("server").request("auth_plugin")
          .validate(USER, (err, authed, user) => {
            test.equals(err, null, "no error during user validation")
            test.equals(authed, true, "authed is true")
            test.ok(user, "user validated is 👌🏻")
          })
      })
  })
})
