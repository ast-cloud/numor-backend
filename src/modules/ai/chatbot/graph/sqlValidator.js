// Decides whether a model-written query is allowed to run.
//
// The query is parsed with libpg-query - Postgres's own parser - and the
// syntax tree is walked against an ALLOWLIST: every node type, every field on
// it, every function, operator, cast target and table has to be named below.
// Anything not named is rejected, including syntax this file has never heard
// of. That direction matters. A blocklist of "dangerous" keywords fails open
// the day someone finds a construct it missed; this fails closed.
//
// Row-level security (prisma/sql/chat-rls-setup.sql) still decides which rows
// a query sees. This file exists because RLS trusts a session setting, so the
// query must not be able to call anything that changes settings or runs a
// string as SQL - which is exactly what the function allowlist guarantees.

const { parse, scan } = require("libpg-query");

const MAX_SQL_LENGTH = 4000;
const MAX_NODES = 3000;

// Nothing here can write, change a setting, read a file, sleep, or execute
// text as SQL. Add to it only when a real question needs the function.
const ALLOWED_FUNCTIONS = new Set([
  // aggregates
  "count", "sum", "avg", "min", "max", "string_agg",
  // window
  "row_number", "rank", "dense_rank", "lag", "lead", "ntile",
  // numbers
  "round", "abs", "ceil", "ceiling", "floor", "trunc", "mod",
  // dates
  "now", "date_trunc", "date_part", "extract", "age", "to_char", "make_date",
  "timezone", "date",
  // text
  "lower", "upper", "initcap", "length", "btrim", "ltrim", "rtrim", "concat",
  "concat_ws", "left", "right", "substring", "substr", "replace", "position",
  "strpos",
]);

// Names as the parser reports them: "integer" arrives as int4, "boolean" as
// bool, "decimal" as numeric, and so on.
const ALLOWED_CAST_TYPES = new Set([
  "date", "timestamp", "timestamptz", "time", "interval",
  "numeric", "int2", "int4", "int8", "float4", "float8",
  "text", "varchar", "bpchar", "bool",
]);

const ALLOWED_OPERATORS = new Set([
  "=", "<>", "!=", "<", ">", "<=", ">=",
  "+", "-", "*", "/", "%", "||",
  "~~", "!~~", "~~*", "!~~*", // LIKE / ILIKE and their negations
  "BETWEEN", "NOT BETWEEN", "BETWEEN SYMMETRIC", "NOT BETWEEN SYMMETRIC",
]);

const ALLOWED_EXPR_KINDS = new Set([
  "AEXPR_OP", "AEXPR_OP_ANY", "AEXPR_OP_ALL", "AEXPR_IN",
  "AEXPR_LIKE", "AEXPR_ILIKE", "AEXPR_NULLIF",
  "AEXPR_DISTINCT", "AEXPR_NOT_DISTINCT",
  "AEXPR_BETWEEN", "AEXPR_NOT_BETWEEN",
  "AEXPR_BETWEEN_SYM", "AEXPR_NOT_BETWEEN_SYM",
]);

// CURRENT_DATE and friends. Deliberately not CURRENT_USER / SESSION_USER.
const ALLOWED_SQL_VALUES = new Set([
  "SVFOP_CURRENT_DATE",
  "SVFOP_CURRENT_TIME", "SVFOP_CURRENT_TIME_N",
  "SVFOP_CURRENT_TIMESTAMP", "SVFOP_CURRENT_TIMESTAMP_N",
  "SVFOP_LOCALTIME", "SVFOP_LOCALTIME_N",
  "SVFOP_LOCALTIMESTAMP", "SVFOP_LOCALTIMESTAMP_N",
]);

class Rejected extends Error {}

const reject = (reason) => {
  throw new Rejected(reason);
};

// Field handlers. Each takes (value, ctx).
const prim = () => {}; // enum, flag, name or source position: nothing to check
const expr = (value, ctx) => visit(value, ctx);

function qualifiedName(list, what) {
  const parts = (list ?? []).map((n) => n?.String?.sval);
  if (parts.some((p) => typeof p !== "string")) reject(`unsupported ${what} name`);
  // The parser itself writes SQL-syntax forms like EXTRACT(...) and
  // "integer" with a pg_catalog prefix. No other schema is accepted.
  if (parts.length === 2 && parts[0] === "pg_catalog") return parts[1];
  if (parts.length === 1) return parts[0];
  return reject(`schema-qualified ${what} "${parts.join(".")}" is not allowed`);
}

function functionName(value) {
  const name = qualifiedName(value, "function");
  if (!ALLOWED_FUNCTIONS.has(name)) {
    reject(
      `function "${name}" is not allowed. Allowed functions: ${[...ALLOWED_FUNCTIONS].join(", ")}`
    );
  }
}

function operatorName(value) {
  const parts = (value ?? []).map((n) => n?.String?.sval);
  if (parts.length !== 1 || !ALLOWED_OPERATORS.has(parts[0])) {
    reject(`operator "${parts.join(".")}" is not allowed`);
  }
}

function castType(value, ctx) {
  for (const key of Object.keys(value)) {
    if (!["names", "typmods", "typemod", "location"].includes(key)) {
      reject("array and set types are not allowed in casts");
    }
  }
  const name = qualifiedName(value.names, "type");
  if (!ALLOWED_CAST_TYPES.has(name)) {
    reject(
      `cast to "${name}" is not allowed. Allowed types: ${[...ALLOWED_CAST_TYPES].join(", ")}`
    );
  }
  visit(value.typmods, ctx); // e.g. the (15,2) in numeric(15,2)
}

function tableName(value, ctx) {
  if (!ctx.allowedTables.has(value) && !ctx.cteNames.has(value)) {
    reject(
      `table "${value}" is not available. Available tables: ${[...ctx.allowedTables].join(", ")}`
    );
  }
}

function alias(value, ctx) {
  for (const key of Object.keys(value)) {
    if (key !== "aliasname" && key !== "colnames") reject("unsupported alias form");
  }
  visit(value.colnames, ctx);
}

// The parser inlines these structs instead of wrapping them in a type tag.
const inlineNode = (type) => (value, ctx) => visitNode(type, value, ctx);

function withClause(value, ctx) {
  for (const key of Object.keys(value)) {
    if (key === "recursive") reject("recursive CTEs are not allowed");
    if (key !== "ctes" && key !== "location") reject("unsupported WITH clause");
  }
  visit(value.ctes, ctx);
}

function cteQuery(value, ctx) {
  // INSERT/UPDATE/DELETE ... RETURNING can hide inside a CTE.
  if (!value?.SelectStmt) reject("a CTE must be a SELECT");
  visit(value, ctx);
}

function distinctClause(value, ctx) {
  // Plain DISTINCT parses as [{}]; DISTINCT ON (...) as a list of expressions.
  for (const item of value) {
    if (item && Object.keys(item).length > 0) visit(item, ctx);
  }
}

// Readable by the chat role, but never to be used in an answer. baseAmount
// looks like a converted total and is not one: no exchange rate is ever
// recorded, so it equals totalAmount in the invoice's own currency, labelled
// INR. Money is totalled per currency instead, never converted. These are
// also left out of the schema description (schemaContext.js).
const HIDDEN_COLUMNS = new Set(["baseAmount", "baseCurrency", "exchangeRate"]);

function columnFields(value) {
  for (const field of value) {
    if (!field?.String && !field?.A_Star) reject("unsupported column reference");
    if (HIDDEN_COLUMNS.has(field?.String?.sval)) {
      reject(
        `column "${field.String.sval}" is not available. Amounts are never converted: total them in their own currency and GROUP BY currency`
      );
    }
  }
}

const oneOf = (allowed, what) => (value) => {
  if (!allowed.has(value)) reject(`${what} "${value}" is not allowed`);
};

// Every node type a query may contain, and every field each may carry.
// A node type or field missing from this table rejects the query.
const NODES = {
  SelectStmt: {
    targetList: expr, fromClause: expr, whereClause: expr,
    groupClause: expr, groupDistinct: prim, havingClause: expr,
    windowClause: expr, sortClause: expr,
    limitOffset: expr, limitCount: expr, limitOption: prim,
    distinctClause,
    withClause,
    // UNION / INTERSECT / EXCEPT
    op: prim, all: prim,
    larg: inlineNode("SelectStmt"), rarg: inlineNode("SelectStmt"),
    // Absent on purpose: intoClause (SELECT INTO), lockingClause (FOR UPDATE),
    // valuesLists (VALUES).
  },
  ResTarget: { val: expr, name: prim, location: prim },
  ColumnRef: { fields: columnFields, location: prim },
  A_Star: {},
  String: { sval: prim },
  Integer: { ival: prim },
  Float: { fval: prim },
  Boolean: { boolval: prim },
  A_Const: {
    sval: prim, ival: prim, fval: prim, boolval: prim, isnull: prim, location: prim,
  },
  A_Expr: {
    kind: oneOf(ALLOWED_EXPR_KINDS, "expression kind"),
    name: operatorName,
    lexpr: expr, rexpr: expr,
    rexpr_list_start: prim, rexpr_list_end: prim, location: prim,
  },
  A_ArrayExpr: { elements: expr, list_start: prim, list_end: prim, location: prim },
  List: { items: expr },
  BoolExpr: { boolop: prim, args: expr, location: prim },
  NullTest: { arg: expr, nulltesttype: prim, location: prim },
  BooleanTest: { arg: expr, booltesttype: prim, location: prim },
  CaseExpr: { arg: expr, args: expr, defresult: expr, location: prim },
  CaseWhen: { expr, result: expr, location: prim },
  CoalesceExpr: { args: expr, location: prim },
  MinMaxExpr: { op: prim, args: expr, location: prim },
  SQLValueFunction: {
    op: oneOf(ALLOWED_SQL_VALUES, "keyword"), typmod: prim, location: prim,
  },
  FuncCall: {
    funcname: functionName,
    args: expr, agg_order: expr, agg_filter: expr,
    over: inlineNode("WindowDef"),
    agg_star: prim, agg_distinct: prim, funcformat: prim, location: prim,
  },
  WindowDef: {
    name: prim, refname: prim,
    partitionClause: expr, orderClause: expr,
    frameOptions: prim, startOffset: expr, endOffset: expr, location: prim,
  },
  SortBy: { node: expr, sortby_dir: prim, sortby_nulls: prim, location: prim },
  GroupingSet: { kind: prim, content: expr, location: prim },
  TypeCast: { arg: expr, typeName: castType, location: prim },
  SubLink: {
    subLinkType: prim, subselect: expr, testexpr: expr,
    operName: operatorName, location: prim,
  },
  RangeVar: {
    relname: tableName,
    schemaname: oneOf(new Set(["public"]), "schema"),
    alias,
    inh: prim, relpersistence: prim, location: prim,
  },
  RangeSubselect: { subquery: expr, alias, lateral: prim },
  JoinExpr: {
    jointype: prim, isNatural: prim,
    larg: expr, rarg: expr, quals: expr, usingClause: expr, alias,
  },
  CommonTableExpr: {
    ctename: prim, ctematerialized: prim, aliascolnames: expr,
    ctequery: cteQuery, location: prim,
  },
};

function visitNode(type, body, ctx) {
  const spec = NODES[type];
  if (!spec) reject(`${type} is not allowed in chat queries`);
  if (++ctx.nodes > MAX_NODES) reject("query is too complex");

  for (const [field, value] of Object.entries(body ?? {})) {
    const handler = spec[field];
    if (!handler) reject(`${type}.${field} is not allowed in chat queries`);
    handler(value, ctx);
  }
}

function visit(value, ctx) {
  if (value === null || value === undefined) return;

  if (Array.isArray(value)) {
    for (const item of value) visit(item, ctx);
    return;
  }

  if (typeof value !== "object") return;

  // Every real node is a single-key wrapper: { NodeType: { ...fields } }.
  const keys = Object.keys(value);
  if (keys.length !== 1 || !/^[A-Z]/.test(keys[0])) {
    reject("unsupported query structure");
  }
  visitNode(keys[0], value[keys[0]], ctx);
}

function collectCteNames(value, names) {
  if (Array.isArray(value)) {
    for (const item of value) collectCteNames(item, names);
  } else if (value && typeof value === "object") {
    if (typeof value.CommonTableExpr?.ctename === "string") {
      names.add(value.CommonTableExpr.ctename);
    }
    for (const child of Object.values(value)) collectCteNames(child, names);
  }
  return names;
}

async function parseSingleStatement(sql) {
  let ast;
  try {
    ast = await parse(sql);
  } catch (err) {
    reject(`syntax error: ${err.message}`);
  }

  const stmts = ast?.stmts ?? [];
  if (stmts.length !== 1) reject("exactly one statement is required");
  return stmts[0];
}

/**
 * Puts double quotes around camelCase column names the model left bare.
 *
 * Postgres folds an unquoted name to lower case, so `ib.totalAmount` is read
 * as `ib.totalamount` and fails: the real column is "totalAmount". The model
 * forgets the quotes often enough, especially after a table alias, and a
 * retry does not reliably fix it - Postgres reports only the first bad column
 * per attempt.
 *
 * Only unquoted identifiers that match a real column once case is ignored,
 * and that contain capitals, are rewritten. Such a name can never have
 * worked unquoted, so this changes nothing that would otherwise run. String
 * literals, comments and quoted names are separate tokens and are left alone.
 * The result still goes through validateChatSql like any other query.
 *
 * @param {string} sql
 * @param {Iterable<string>} columnNames real column names, e.g. from getColumnNames()
 * @returns {Promise<string>}
 */
async function quoteCamelCaseColumns(sql, columnNames) {
  const byLowerCase = new Map();
  for (const name of columnNames) {
    const lower = name.toLowerCase();
    if (name === lower) continue; // works unquoted already
    // Two columns differing only in case: ambiguous, so leave both alone.
    byLowerCase.set(lower, byLowerCase.has(lower) ? null : name);
  }
  if (typeof sql !== "string" || byLowerCase.size === 0) return sql;

  let tokens;
  try {
    ({ tokens } = await scan(sql));
  } catch {
    return sql; // unscannable: let the validator report it
  }

  // Token positions are byte offsets, which differ from string indexes as
  // soon as the query contains a character such as "₹".
  const bytes = Buffer.from(sql, "utf8");
  const pieces = [];
  let last = 0;

  for (const token of tokens) {
    if (token.tokenName !== "IDENT") continue;
    const text = bytes.subarray(token.start, token.end).toString("utf8");
    if (text.startsWith('"')) continue;

    const real = byLowerCase.get(text.toLowerCase());
    if (!real) continue;

    pieces.push(bytes.subarray(last, token.start), Buffer.from(`"${real}"`, "utf8"));
    last = token.end;
  }

  if (pieces.length === 0) return sql;
  pieces.push(bytes.subarray(last));
  return Buffer.concat(pieces).toString("utf8");
}

/**
 * Validate one model-written query.
 *
 * @param {string} sql
 * @param {{ allowedTables: Iterable<string>, maxRows?: number }} opts
 * @returns {Promise<{ ok: true, sql: string } | { ok: false, reason: string }>}
 *   On success, `sql` is the statement to execute: the original wrapped in an
 *   outer LIMIT of maxRows + 1, so a result that hits the cap can be told
 *   apart from one that fits.
 */
async function validateChatSql(sql, { allowedTables, maxRows = 50 }) {
  try {
    if (typeof sql !== "string" || !sql.trim()) reject("empty query");
    if (sql.length > MAX_SQL_LENGTH) reject("query is too long");

    const statement = await parseSingleStatement(sql);
    if (!statement.stmt?.SelectStmt) reject("only SELECT statements are allowed");

    visit(statement.stmt, {
      allowedTables: new Set(allowedTables),
      cteNames: collectCteNames(statement.stmt, new Set()),
      nodes: 0,
    });

    // stmt_location / stmt_len are byte offsets, and exclude a trailing ";".
    const bytes = Buffer.from(sql, "utf8");
    const start = statement.stmt_location ?? 0;
    const end = statement.stmt_len ? start + statement.stmt_len : bytes.length;
    const inner = bytes.subarray(start, end).toString("utf8").trim();

    // The newlines keep a trailing "-- comment" from swallowing the wrapper.
    const wrapped = `SELECT * FROM (\n${inner}\n) AS chat_result LIMIT ${Number(maxRows) + 1}`;

    // The wrapper is built by string concatenation, so prove it is still
    // exactly one SELECT before it goes anywhere near the database.
    const check = await parseSingleStatement(wrapped);
    if (!check.stmt?.SelectStmt?.fromClause?.[0]?.RangeSubselect) {
      reject("query could not be wrapped safely");
    }

    return { ok: true, sql: wrapped };
  } catch (err) {
    if (err instanceof Rejected) return { ok: false, reason: err.message };
    throw err;
  }
}

module.exports = {
  validateChatSql,
  quoteCamelCaseColumns,
  ALLOWED_FUNCTIONS,
  ALLOWED_CAST_TYPES,
  HIDDEN_COLUMNS,
};
