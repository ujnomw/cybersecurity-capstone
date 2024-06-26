const { Pool } = require("pg");
const bcrypt = require("bcrypt");
const fs = require("fs");
const { renderLocalDate } = require("./utils");
require("dotenv").config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

async function query(text, params) {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}

async function createTables() {
  try {
    await query(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        salt VARCHAR(50) NOT NULL,
        password_hash VARCHAR(100) NOT NULL,
        email VARCHAR(100)
    );


      CREATE TABLE IF NOT EXISTS messages (
        message_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        from_id INTEGER REFERENCES users(id),
        to_id INTEGER REFERENCES users(id),
        content_encrypted text,
        send_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

      );
    `);
    console.log("Tables created successfully.");
  } catch (error) {
    console.error("Error creating tables:", error.message);
  }
}

const isUser = async (username, password) => {
  try {
    const queryText =
      "SELECT password_hash, salt FROM users WHERE username = $1";
    const result = await query(queryText, [username]);

    if (result.rows.length === 0) {
      return false;
    }

    const hashedPassword = result.rows[0].password_hash;
    const salt = result.rows[0].salt;

    const hashedInputPassword = await bcrypt.hash(password, salt);

    return hashedPassword === hashedInputPassword;
  } catch (error) {
    console.error("Failed to authenticate user:", error.message);
    return false;
  }
};

const getUsersMessages = async (userName) => {
  try {
    const extensionsResult = await query(
      "SELECT * FROM pg_extension WHERE extname = 'pgcrypto';"
    );

    console.table(extensionsResult.rows);

    const queryText =
      "SELECT messages.message_id AS id, to_user.username AS to, from_user.username AS from, messages.content_encrypted, messages.send_at AS timestamp FROM messages JOIN users to_user ON messages.to_id = to_user.id JOIN users from_user ON messages.from_id = from_user.id WHERE to_user.username = $1 ORDER BY messages.send_at DESC";
    const result = await query(queryText, [userName]);
    return result.rows.map((r) => ({
      ...r,
      timestamp: renderLocalDate(new Date(r.timestamp)),
    }));
  } catch (error) {
    return;
  }
};

const getUsersMessageById = async (userName, messageId) => {
  try {
    const queryText =
      "SELECT messages.message_id AS id, to_user.username AS to, from_user.username AS from, messages.content_encrypted, messages.send_at AS timestamp FROM messages JOIN users to_user ON messages.to_id = to_user.id JOIN users from_user ON messages.from_id = from_user.id WHERE to_user.username = $1 AND messages.message_id = $2;";
    const result = await query(queryText, [userName, messageId]);
    const contentResult = await query(
      "SELECT pgp_sym_decrypt($1, $2) as content",
      [result.rows[0].content_encrypted, ENCRYPTION_KEY]
    );
    const sendDate = new Date(result.rows[0].timestamp);
    return {
      ...result.rows[0],
      textContent: contentResult.rows[0].content,
      timestamp: renderLocalDate(sendDate),
    };
  } catch (error) {
    return;
  }
};

const sendMessage = async (to, from, content) => {
  try {
    const queryText = `
                    WITH to_user_id AS (
                        SELECT id FROM users WHERE username = $1
                    ), from_user_id AS (
                        SELECT id FROM users WHERE username = $2
                    )
                    INSERT INTO messages (to_id, from_id, content_encrypted, send_at)
                    SELECT to_user_id.id, from_user_id.id, pgp_sym_encrypt($3, $4), CURRENT_TIMESTAMP
                    FROM to_user_id, from_user_id;
                  `;
    await query(queryText, [to, from, content, ENCRYPTION_KEY]);
    return true;
  } catch (error) {
    throw error;
  }
};

const register = async (username, password) => {
  try {
    const queryText =
      "INSERT INTO users (username, salt, password_hash) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING";
    const saltRounds = 10;
    const salt = await bcrypt.genSalt(saltRounds);
    const passwordHash = await bcrypt.hash(password, salt);

    await query(queryText, [username, salt, passwordHash]);
  } catch (error) {
    throw error;
  }
};

const isUserExists = async (username) => {
  try {
    const queryText = "SELECT EXISTS (SELECT * FROM users WHERE username = $1)";
    const result = await query(queryText, [username]);
    return result.rows[0].exists;
  } catch (e) {
    console.error("Failed to check user existence:", e);
  }
};

async function fetchTables() {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
    `);
    return result.rows.map((row) => row.table_name);
  } finally {
    client.release();
  }
}

async function fetchTableContent(tableName) {
  const client = await pool.connect();
  try {
    const result = await client.query(`SELECT * FROM ${tableName}`);
    return result.rows;
  } finally {
    client.release();
  }
}

module.exports = {
  getUsersMessages,
  getMessageById: getUsersMessageById,
  isUser,
  sendMessage,
  register,
  createTables,
  fetchTableContent,
  fetchTables,
  isUserExists,
};
