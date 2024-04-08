const express = require("express");
const ejs = require("ejs");
const bp = require("body-parser");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const {
  getUsersMessages,
  getMessageById,
  isUser,
  sendMessage,
  register,
} = require("./database");

const JWT_KEY = "JWT_KEY";

const app = express();

app.set("view engine", "ejs");
app.use(bp.urlencoded({ extended: true }));
app.use(cookieParser());

app.get("/", (req, res) => {
  res.render("test-page");
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

app.post("/login", unauthorizedOnly, (req, res) => {
  const { username, password } = req.body;
  // TODO: validate input
  if (!isUser(username, password)) {
    res.render("login", {
      message: "Wrong credentials!",
      username,
      password,
    });
    return;
  }
  const token = jwt.sign({ username }, JWT_KEY, { expiresIn: "1h" });
  res.cookie("token", token, { httpOnly: true });
  res.redirect("/inbox");
});

app.get("/register", unauthorizedOnly, (req, res) => {
  res.render("register");
});

app.post("/register", unauthorizedOnly, async (req, res) => {
  const { username, password, email } = req.body;

  try {
    // TODO: validate input
    await register(username, password, email);
    res.redirect("/login");
  } catch (e) {
    res.render("register");
  }
});

app.get("/inbox", verifyToken, (req, res) => {
  const username = req.user.username;
  const messages = getUsersMessages(username);
  res.render("inbox", { messages: messages });
});

app.get("/inbox/:id", verifyToken, (req, res) => {
  const username = req.user.username;
  const message = getMessageById(username, req.params.id);
  if (message === undefined) {
    res.redirect("/inbox");
  }
  res.render("message-details", { message: message });
});

app.get("/send", verifyToken, (req, res) => {
  res.render("send");
});

app.post("/send", verifyToken, async (req, res) => {
  const { username: to, content } = req.body;
  const from = req.user.username;
  // TODO: validate input
  try {
    await sendMessage(to, from, content);
  } catch (e) {
    console.log(e);
  }
  res.redirect("/inbox");
});

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
