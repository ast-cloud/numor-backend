// Builds the schema description handed to the model when it writes SQL.
//
// It is introspected live, through the chatbot's own read-only connection, and
// filtered by has_column_privilege(). So the description is generated FROM the
// grants: a column the role cannot read is a column the model is never told
// about, with no separate list to keep in sync.
//
// Column documentation comes from Postgres COMMENT ON, which is set in
// prisma/sql/chat-rls-setup.sql. That is where ambiguities like
// "which of the four tax columns is the real one" get settled.

const { getChatPool } = require("../../../../config/chatDatabase");
const chatLogger = require("../../../../utils/chat.logger");

const COLUMNS_SQL = `
  SELECT
    c.relname                                   AS table_name,
    a.attname                                   AS column_name,
    format_type(a.atttypid, a.atttypmod)        AS data_type,
    NOT a.attnotnull                            AS nullable,
    col_description(c.oid, a.attnum)            AS column_comment,
    obj_description(c.oid)                      AS table_comment
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_attribute a ON a.attrelid = c.oid
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'v', 'm')
    AND a.attnum > 0
    AND NOT a.attisdropped
    AND has_column_privilege(c.oid, a.attname, 'SELECT')
  ORDER BY c.relname, a.attnum
`;

const FOREIGN_KEYS_SQL = `
  SELECT
    src.relname   AS table_name,
    srcatt.attname AS column_name,
    tgt.relname   AS foreign_table,
    tgtatt.attname AS foreign_column
  FROM pg_constraint con
  JOIN pg_class src        ON src.oid = con.conrelid
  JOIN pg_class tgt        ON tgt.oid = con.confrelid
  JOIN pg_namespace n      ON n.oid = src.relnamespace
  JOIN pg_attribute srcatt ON srcatt.attrelid = con.conrelid
                          AND srcatt.attnum = con.conkey[1]
  JOIN pg_attribute tgtatt ON tgtatt.attrelid = con.confrelid
                          AND tgtatt.attnum = con.confkey[1]
  WHERE con.contype = 'f'
    AND n.nspname = 'public'
    AND has_table_privilege(src.oid, 'SELECT')
    AND has_table_privilege(tgt.oid, 'SELECT')
  ORDER BY src.relname
`;

let cached = null;

function quoteIfNeeded(name) {
  // Prisma leaves most columns camelCased, which Postgres needs quoted.
  return /^[a-z_][a-z0-9_]*$/.test(name) ? name : `"${name}"`;
}

function render(columnRows, fkRows) {
  const tables = new Map();

  for (const row of columnRows) {
    if (!tables.has(row.table_name)) {
      tables.set(row.table_name, {
        comment: row.table_comment,
        columns: [],
        foreignKeys: [],
      });
    }
    tables.get(row.table_name).columns.push(row);
  }

  for (const fk of fkRows) {
    const table = tables.get(fk.table_name);
    if (table) table.foreignKeys.push(fk);
  }

  const blocks = [];

  for (const [tableName, table] of tables) {
    const lines = [];

    if (table.comment) lines.push(`-- ${table.comment}`);
    lines.push(`TABLE ${tableName} (`);

    for (const col of table.columns) {
      const parts = [`  ${quoteIfNeeded(col.column_name)} ${col.data_type}`];
      if (!col.nullable) parts.push("NOT NULL");

      let line = parts.join(" ");
      if (col.column_comment) line += `  -- ${col.column_comment}`;
      lines.push(line);
    }

    lines.push(")");

    for (const fk of table.foreignKeys) {
      lines.push(
        `  FK ${quoteIfNeeded(fk.column_name)} -> ${fk.foreign_table}.${quoteIfNeeded(fk.foreign_column)}`
      );
    }

    blocks.push(lines.join("\n"));
  }

  return blocks.join("\n\n");
}

/**
 * Returns the rendered schema description, cached for the process lifetime.
 * The schema does not change at runtime, and this runs two catalog queries.
 */
async function getSchemaContext({ refresh = false } = {}) {
  if (cached && !refresh) return cached;

  const pool = getChatPool();
  const [columns, foreignKeys] = await Promise.all([
    pool.query(COLUMNS_SQL),
    pool.query(FOREIGN_KEYS_SQL),
  ]);

  if (columns.rows.length === 0) {
    throw new Error(
      "Chat role can read no columns. Has prisma/sql/chat-rls-setup.sql been run?"
    );
  }

  cached = render(columns.rows, foreignKeys.rows);

  chatLogger.info({
    event: "CHAT_SCHEMA_CONTEXT_BUILT",
    tables: new Set(columns.rows.map((r) => r.table_name)).size,
    columns: columns.rows.length,
    approxTokens: Math.round(cached.length / 4),
  });

  return cached;
}

/** Table names the chat role can actually read - useful for logging/diagnostics. */
async function getReadableTables() {
  const { rows } = await getChatPool().query(
    `SELECT DISTINCT c.relname AS name
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind IN ('r','v','m')
        AND has_table_privilege(c.oid, 'SELECT')
      ORDER BY 1`
  );
  return rows.map((r) => r.name);
}

module.exports = { getSchemaContext, getReadableTables };