const express = require("express");
const ejs = require("ejs");
const bp = require("body-parser");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const expressValidator = require("express-validator");
const inputValidation = require("./input-validation");
const {
  getUsersMessages,
  getMessageById,
  isUser,
  sendMessage,
  register,
  createTables,
} = require("./database");

// TODO: replace it
const JWT_KEY = "JWT_KEY";

const app = express();

app.set("view engine", "ejs");
app.use(express.static(__dirname + "/public"));
app.use(bp.urlencoded({ extended: true }));
app.use(cookieParser());

app.get("/", (req, res) => {
  res.redirect("/inbox");
});

const verifyToken = (req, res, next) => {
  // Check if JWT token exists in cookie
  const token = req.cookies.token;

  try {
    // Verify JWT token
    const decoded = jwt.verify(token, JWT_KEY);
    // Attach user information to the request object
    req.user = decoded;
  } catch (err) {
    res.redirect("/login");
    return;
  }

  next();
};

const unauthorizedOnly = (req, res, next) => {
  try {
    const token = req.cookies.token;
    jwt.verify(token, JWT_KEY);
    res.redirect("/inbox");
  } catch {
    next();
  }
};

app.get("/login", unauthorizedOnly, (req, res) => {
  res.render("login");
});

app.post(
  "/login",
  unauthorizedOnly,
  inputValidation.validate("login"),
  async (req, res) => {
    const errors = expressValidator.validationResult(req);
    const { username, password } = req.body;
    if (!errors.isEmpty()) {
      const message =
        "The following problems occurred: " +
        errors
          .array()
          .map((e) => e.msg)
          .join(", ");

      res.render("login", { message, username, password });
      return;
    }
    const userExists = await isUser(username, password);
    if (!userExists) {
      res.render("login", {
        message: "Wrong credentials!",
        username,
        password,
      });
      return;
    }
    const token = jwt.sign({ username }, JWT_KEY, { expiresIn: 600 });
    res.cookie("token", token, { httpOnly: true });
    res.redirect("/inbox");
  }
);

app.get("/register", unauthorizedOnly, (req, res) => {
  res.render("register");
});

app.post(
  "/register",
  unauthorizedOnly,
  inputValidation.validate("register"),
  async (req, res) => {
    const errors = expressValidator.validationResult(req);
    const { username, password, email } = req.body;
    if (!errors.isEmpty()) {
      const message =
        "The following problems occurred: " +
        errors
          .array()
          .map((e) => e.msg)
          .join(", ");

      res.render("register", { message, username, password, email });
      return;
    }

    try {
      await register(username, password, email);
      res.redirect("/login");
    } catch (e) {
      console.error(e);
      res.render("register");
    }
  }
);

app.get("/inbox", verifyToken, async (req, res) => {
  const username = req.user.username;
  const messages = await getUsersMessages(username);
  res.render("inbox", { messages: messages ?? [] });
});

app.get("/inbox/:id", verifyToken, async (req, res) => {
  const username = req.user.username;
  const message = await getMessageById(username, req.params.id);
  if (message === undefined) {
    res.redirect("/inbox");
  }
  res.render("message-details", { message: message });
});

app.get("/send", verifyToken, (req, res) => {
  res.render("send");
});

app.post(
  "/send",
  verifyToken,
  inputValidation.validate("sendMessage"),
  async (req, res) => {
    const errors = expressValidator.validationResult(req);
    const { username: to, content } = req.body;

    if (!errors.isEmpty()) {
      const message =
        "The following problems occurred: " +
        errors
          .array()
          .map((e) => e.msg)
          .join(", ");

      res.render("send", { message, username: to, content: content });
      return;
    }
    const from = req.user.username;
    try {
      await sendMessage(to, from, content);
    } catch (e) {
      console.log(e);
    }
    res.redirect("/inbox");
  }
);

createTables().then(() => {
  app.listen(3000, () => {
    console.log("Server is running on port 3000");
  });
});
