const express = require("express");
const ejs = require("ejs");
const bp = require("body-parser");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const expressValidator = require("express-validator");
const inputValidation = require("./input-validation");
const { parse } = require("json2csv");
const fs = require("fs");
const { pipeline } = require("stream");
const archiver = require("archiver");
const path = require("path");
require("dotenv").config();
const {
  getUsersMessages,
  getMessageById,
  isUser,
  sendMessage,
  register,
  createTables,
  fetchTableContent,
  fetchTables,
} = require("./database");

const JWT_KEY = process.env.JWT_KEY;

const app = express();

app.set("view engine", "ejs");
app.use(express.static(__dirname + "/public"));
app.use(bp.urlencoded({ extended: true }));
app.use(cookieParser());

const revokedTokens = new Set();

const verifyToken = (req, res, next) => {
  const token = req.cookies.token;

  try {
    const decoded = jwt.verify(token, JWT_KEY);
    if (revokedTokens.has(decoded.jti)) {
      throw "Already logged out!";
    }
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
    const decoded = jwt.verify(token, JWT_KEY);
    if (revokedTokens.has(decoded.jti)) {
      throw "logged out already!";
    }
    res.redirect("/inbox");
  } catch {
    next();
  }
};

app.get("/logout", verifyToken, (req, res) => {
  try {
    const token = req.cookies.token;

    const decoded = jwt.verify(token, JWT_KEY);
    const jti = decoded.jti;

    revokedTokens.add(jti);
  } catch (e) {
    console.log("failed to log out", e);
  }
  res.redirect("/");
});

app.get("/", (req, res) => {
  res.redirect("/inbox");
});

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
    const jti = Math.random().toString(36).substr(2, 10);
    const token = jwt.sign({ username }, JWT_KEY, {
      expiresIn: 600,
      jwtid: jti,
    });
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
    const { username, password } = req.body;
    if (!errors.isEmpty()) {
      const message =
        "The following problems occurred: " +
        errors
          .array()
          .map((e) => e.msg)
          .join(", ");

      res.render("register", { message, username, password });
      return;
    }

    try {
      await register(username, password);
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
  res.render("inbox", { messages: messages ?? [], currentUser: username });
});

app.get("/inbox/:id", verifyToken, async (req, res) => {
  const username = req.user.username;
  const message = await getMessageById(username, req.params.id);
  if (message === undefined) {
    res.redirect("/inbox");
  }
  res.render("message-details", { message: message, currentUser: username });
});

app.get("/send", verifyToken, (req, res) => {
  const username = req.user.username;
  res.render("send", { currentUser: username });
});

app.post(
  "/send",
  verifyToken,
  inputValidation.validate("sendMessage"),
  async (req, res) => {
    const errors = expressValidator.validationResult(req);
    const { username: to, content } = req.body;
    const from = req.user.username;

    if (!errors.isEmpty()) {
      const message =
        "The following problems occurred: " +
        errors
          .array()
          .map((e) => e.msg)
          .join(", ");

      res.render("send", {
        message,
        username: to,
        content: content,
        currentUser: from,
      });
      return;
    }
    try {
      await sendMessage(to, from, content);
    } catch (e) {
      console.log(e);
    }
    res.redirect("/inbox");
  }
);

function getCurrentTimestamp() {
  const now = new Date();
  const timestamp = now.toISOString().replace(/:/g, "-").replace(/\..+/, "");
  return timestamp;
}

app.get("/dbdump", (req, res) => {
  const token = req.cookies.token;

  try {
    const decoded = jwt.verify(token, JWT_KEY);
    req.user = decoded;
    if (revokedTokens.has(decoded.jti)) {
      throw "Already logged out!";
    }
    const currentUser = req.user.username;
    res.render("dbdump", { currentUser });
  } catch (err) {}
  res.render("dbdump");
});

app.post("/dbdump", async (req, res) => {
  try {
    const tables = await fetchTables();
    const tempDir = path.join(__dirname, "temp");
    const zipFilename = `tables_${getCurrentTimestamp()}.zip`;
    const zipPath = path.join(tempDir, zipFilename);

    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir);
    }

    const tableDataPromises = tables.map(async (table) => {
      const data = await fetchTableContent(table);
      const fields = Object.keys(data[0]);
      const csv = parse(data, { fields });
      return { name: `${table}.csv`, data: csv };
    });

    const tableData = await Promise.all(tableDataPromises);

    const zip = archiver("zip", {
      zlib: { level: 9 },
    });

    const output = fs.createWriteStream(zipPath);
    output.on("close", () => {
      res.sendFile(zipPath, () => {
        fs.unlinkSync(zipPath);
      });
    });
    zip.pipe(output);

    tableData.reverse().forEach(({ name, data }) => {
      zip.append(data, { name });
    });

    zip.finalize();
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("Internal Server Error");
  }
});
const port = process.env.PORT || 3000;
const host = "0.0.0.0";
createTables().then(() => {
  app.listen(port, host, () => {
    console.log("Server is running on port 3000");
  });
});
