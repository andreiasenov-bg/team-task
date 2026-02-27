const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const config = require("./config");

const pool = new Pool({
  connectionString: config.databaseUrl,
});

async function query(text, params = []) {
  return pool.query(text, params);
}

async function withTx(handler) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await handler(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function bootstrapSchema() {
  const sqlPath = path.join(__dirname, "..", "sql", "001_init.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");
  await query(sql);
}

module.exports = {
  pool,
  query,
  withTx,
  bootstrapSchema,
};
