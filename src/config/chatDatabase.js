// Read-only database access for the AI chatbot.
//
// This is a SEPARATE connection pool on a SEPARATE Postgres role
// (numor_chat_ro) from the application's main Prisma client. It must never be
// merged with src/config/database.js - the whole point is that queries written
// by the language model run as a role that can only SELECT, and that Postgres
// row-level security decides which rows it sees.
//
// See prisma/sql/chat-rls-setup.sql for the role, grants and RLS policies.

const { Pool, types: pgTypes } = require("pg");
const { CHAT_DATABASE_URL } = require("./env");
const { pgSslFor } = require("./pgSsl");

// Postgres returns numeric (oid 1700) and int8 (oid 20) as strings, to avoid
// silent precision loss. That is the right default for an ORM, but here every
// value goes into arithmetic and then into a prompt, so we parse them to
// numbers up front.
//
// These parsers are scoped to THIS pool. Setting them via pg.types.setTypeParser
// would be global and would change how the main app's Prisma client decodes
// results, which we very much do not want.
const poolTypes = {
  getTypeParser: (oid, format) => {
    if (oid === 1700) return (v) => (v === null ? null : Number.parseFloat(v));
    if (oid === 20) return (v) => (v === null ? null : Number(v));
    return pgTypes.getTypeParser(oid, format);
  },
};

let pool = null;

function getChatPool() {
  if (!CHAT_DATABASE_URL) {
    throw new Error(
      "CHAT_DATABASE_URL is not set. Run prisma/sql/chat-rls-setup.sql and add " +
        "the numor_chat_ro connection string to your environment."
    );
  }

  if (!pool) {
    pool = new Pool({
      connectionString: CHAT_DATABASE_URL,
      ssl: pgSslFor(CHAT_DATABASE_URL),
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      types: poolTypes,
    });

    pool.on("error", (err) => {
      // A pooled client erroring while idle must not take the process down.
      // eslint-disable-next-line no-console
      console.error("[chatDatabase] idle client error:", err.message);
    });
  }

  return pool;
}

/**
 * Run a generated SELECT as the read-only role, scoped to one organisation.
 *
 * The org id is applied with set_config(..., is_local = true), so it lives only
 * for the duration of this transaction. That detail is load-bearing: with a
 * plain SET, the value would stick to the pooled connection and the next
 * request handed that connection would inherit the previous user's org. Every
 * query MUST therefore go through a transaction, even a single SELECT.
 *
 * @param {string|number|bigint} orgId  organisation id, from the signed JWT
 * @param {string} sql                  a single SELECT statement
 * @param {{ maxRows?: number, timeoutMs?: number }} [opts]
 */
async function runChatQuery(orgId, sql, opts = {}) {
  const { maxRows = 500, timeoutMs = 8000 } = opts;

  // orgId originates from the JWT, but this value is interpolated into a
  // session setting rather than bound, so refuse anything that is not digits.
  const org = String(orgId);
  if (!/^\d+$/.test(org)) {
    throw new Error("Invalid organisation id for chat query");
  }

  const client = await getChatPool().connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query(`SET LOCAL statement_timeout = ${Number(timeoutMs)}`);
    await client.query("SELECT set_config('app.current_org_id', $1, true)", [org]);

    const result = await client.query(sql);
    const rows = result.rows ?? [];

    return {
      rows: rows.slice(0, maxRows),
      rowCount: rows.length,
      truncated: rows.length > maxRows,
      fields: (result.fields ?? []).map((f) => f.name),
    };
  } finally {
    // Always roll back: nothing here should ever commit, and this releases the
    // transaction-local org id.
    try {
      await client.query("ROLLBACK");
    } catch {
      /* connection already gone */
    }
    client.release();
  }
}

/**
 * EXPLAIN a query without running it. Not wired into the graph yet - this is
 * the hook the cost gate will use once validation is added.
 */
async function explainChatQuery(orgId, sql) {
  const { rows } = await runChatQuery(orgId, `EXPLAIN (FORMAT JSON) ${sql}`, {
    maxRows: 1,
  });
  return rows[0]?.["QUERY PLAN"]?.[0]?.Plan ?? null;
}

async function closeChatPool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = { runChatQuery, explainChatQuery, getChatPool, closeChatPool };
