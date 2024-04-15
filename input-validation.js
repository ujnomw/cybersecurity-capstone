const { body } = require("express-validator");
const { isUserExists } = require("./database");

exports.validate = (method) => {
  switch (method) {
    case "sendMessage": {
      return [
        body("username", "Receiver username could not be empty")
          .escape()
          .trim()
          .exists()
          .notEmpty()
          .custom((value) => {
            return isUserExists(value).then((exists) => {
              if (!exists) {
                return Promise.reject("Receiver does not exists");
              }
            });
          }),
        body("content", "Message's text should not be empty")
          .escape()
          .trim()
          .exists()
          .notEmpty(),
      ];
    }
    case "login": {
      return [
        body("username")
          .escape()
          .trim()
          .notEmpty()
          .withMessage("Username could not be empty")
          .isAlphanumeric()
          .withMessage("Username should consists only of letters and numbers"),
        body("password").notEmpty().withMessage("Password could not be empty"),
      ];
    }
    case "register": {
      return [
        body("username")
          .escape()
          .trim()
          .notEmpty()
          .withMessage("Username could not be empty")
          .isAlphanumeric()
          .withMessage("Username should consists only of letters and numbers")
          .custom((value) => {
            return isUserExists(value).then((exists) => {
              if (exists) {
                return Promise.reject("Username already in use");
              }
            });
          }),
        body("password")
          .isStrongPassword({
            minLength: 8,
            minLowercase: 1,
            minUppercase: 1,
            minNumbers: 1,
            minSymbols: 0,
            returnScore: false,
            pointsPerUnique: 0,
            pointsPerRepeat: 0,
            pointsForContainingLower: 0,
            pointsForContainingUpper: 0,
            pointsForContainingNumber: 0,
            pointsForContainingSymbol: 0,
          })
          .withMessage(
            "Password must be greater than 8 and contain at least one uppercase letter, one lowercase letter, and one number"
          ),
      ];
    }
  }
};
