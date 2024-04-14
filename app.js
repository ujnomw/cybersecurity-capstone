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
    // Verify JWT token
    const decoded = jwt.verify(token, JWT_KEY);
    // Attach user information to the request object
    req.user = decoded;
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

    // Ensure the temporary directory exists
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir);
    }

    // Fetch and process data for all tables concurrently
    const tableDataPromises = tables.map(async (table) => {
      const data = await fetchTableContent(table);
      const fields = Object.keys(data[0]);
      const csv = parse(data, { fields });
      return { name: `${table}.csv`, data: csv };
    });

    // Wait for all table data to be fetched and processed
    const tableData = await Promise.all(tableDataPromises);

    // Create a zip file with all CSV data
    const zip = archiver("zip", {
      zlib: { level: 9 }, // Sets the compression level
    });

    const output = fs.createWriteStream(zipPath);
    output.on("close", () => {
      res.sendFile(zipPath, () => {
        // Delete the zip file after download
        fs.unlinkSync(zipPath);
      });
    });
    zip.pipe(output);

    // Append each CSV to the zip
    tableData.reverse().forEach(({ name, data }) => {
      zip.append(data, { name });
    });

    zip.finalize();

    // Serve the zip file for download
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("Internal Server Error");
  }
});

createTables().then(() => {
  app.listen(3000, () => {
    console.log("Server is running on port 3000");
  });
});
