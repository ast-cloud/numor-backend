#!/usr/bin/env node
/**
 * Verifies the chatbot's read-only database layer before anything is built on
 * top of it.
 *
 *   node scripts/verify-chat-db.js
 *   node scripts/verify-chat-db.js --ask "how much revenue did we bill last month?"
 *
 * The plain run is a security test suite: it proves that row-level security
 * actually isolates tenants, that blocked tables and columns really are
 * blocked, and that the role cannot write. Every check must pass before the
 * graph is wired up - if RLS is not working, nothing above it is safe.
 *
 * The --ask flag additionally does one real question -> SQL -> result round
 * trip, which is a preview of what the planner node will do.
 *
 * Prerequisites:
 *   1. Run prisma/sql/chat-rls-setup.sql as the database owner
 *   2. Set CHAT_DATABASE_URL to the numor_chat_ro connection string
 */

const prisma = require("../src/config/database");
const { runChatQuery, closeChatPool } = require("../src/config/chatDatabase");
const { getSchemaContext, getReadableTables } = require("../src/modules/ai/chatbot/graph/schemaContext");
const { CHAT_DATABASE_URL, GOOGLE_API_KEY } = require("../src/config/env");

const results = [];

function record(name, passed, detail) {
  results.push({ name, passed, detail });
  const mark = passed ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
  console.log(`  ${mark}  ${name}`);
  if (detail) console.log(`        ${detail}`);
}

/** Runs a query that is EXPECTED to be rejected by Postgres. */
async function expectDenied(name, orgId, sql, expectedPattern) {
  try {
    await runChatQuery(orgId, sql);
    record(name, false, "query succeeded but should have been denied");
  } catch (err) {
    const denied = expectedPattern.test(err.message);
    record(name, denied, denied ? undefined : `unexpected error: ${err.message}`);
  }
}

async function findTestOrgs() {
  const rows = await prisma.$queryRaw`
    SELECT "orgId"::text AS org_id, COUNT(*)::int AS invoice_count
    FROM invoice_bills
    GROUP BY "orgId"
    ORDER BY COUNT(*) DESC
    LIMIT 2
  `;
  return rows.map((r) => ({ orgId: r.org_id, invoiceCount: r.invoice_count }));
}

async function main() {
  console.log("\n=== Numor chat DB verification ===\n");

  if (!CHAT_DATABASE_URL) {
    console.error(
      "CHAT_DATABASE_URL is not set.\n" +
        "Run prisma/sql/chat-rls-setup.sql, then add the numor_chat_ro " +
        "connection string to your .env.\n"
    );
    process.exit(1);
  }

  // ---- Find real orgs to test against, using the OWNER connection ----------
  const orgs = await findTestOrgs();
  if (orgs.length === 0) {
    console.error("No invoices in the database - cannot verify tenant isolation.");
    process.exit(1);
  }

  const orgA = orgs[0];
  const orgB = orgs[1] ?? null;

  console.log(`Test org A: ${orgA.orgId} (${orgA.invoiceCount} invoices)`);
  console.log(
    orgB
      ? `Test org B: ${orgB.orgId} (${orgB.invoiceCount} invoices)\n`
      : "Test org B: none - only one org has invoices, cross-tenant checks limited\n"
  );

  // ---- 1. Fail closed when no org id is set -------------------------------
  console.log("Row-level security");
  {
    // Bypasses runChatQuery deliberately so that set_config is never called.
    const { getChatPool } = require("../src/config/chatDatabase");
    const client = await getChatPool().connect();
    try {
      await client.query("BEGIN READ ONLY");
      const { rows } = await client.query("SELECT COUNT(*)::int AS n FROM invoice_bills");
      record(
        "no org id set -> zero rows visible (fails closed)",
        rows[0].n === 0,
        rows[0].n === 0 ? undefined : `saw ${rows[0].n} rows with no tenant set`
      );
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  }

  // ---- 2. Org A sees only org A -------------------------------------------
  {
    const { rows } = await runChatQuery(
      orgA.orgId,
      'SELECT COUNT(*)::int AS n, COUNT(DISTINCT "orgId")::int AS orgs FROM invoice_bills'
    );
    const ok = rows[0].n === orgA.invoiceCount && rows[0].orgs === 1;
    record(
      "org A sees exactly its own invoices",
      ok,
      ok ? undefined : `expected ${orgA.invoiceCount} rows / 1 org, got ${rows[0].n} / ${rows[0].orgs}`
    );
  }

  // ---- 3. The aggregate-leak query from the design discussion --------------
  // This is the query a naive SQL validator would wave through: it contains a
  // correct tenant filter, yet tries to derive another org's totals.
  if (orgB) {
    const { rows } = await runChatQuery(
      orgA.orgId,
      `SELECT
         (SELECT COALESCE(SUM("totalAmount"), 0) FROM invoice_bills) AS everyone,
         (SELECT COALESCE(SUM("totalAmount"), 0) FROM invoice_bills
           WHERE "orgId" = ${orgA.orgId}) AS mine`
    );
    const leaked = Number(rows[0].everyone) !== Number(rows[0].mine);
    record(
      "aggregate-leak query returns only org A's totals",
      !leaked,
      leaked ? `LEAK: everyone=${rows[0].everyone} mine=${rows[0].mine}` : undefined
    );
  }

  // ---- 4. Blind extraction via EXISTS -------------------------------------
  if (orgB) {
    const { rows } = await runChatQuery(
      orgA.orgId,
      `SELECT EXISTS (
         SELECT 1 FROM invoice_bills WHERE "orgId" = ${orgB.orgId}
       ) AS other_org_visible`
    );
    record(
      "blind EXISTS probe cannot see org B",
      rows[0].other_org_visible === false,
      rows[0].other_org_visible ? "LEAK: org B rows visible to org A" : undefined
    );
  }

  // ---- 5. Child tables are scoped through their parent ---------------------
  {
    const { rows } = await runChatQuery(
      orgA.orgId,
      `SELECT COUNT(*)::int AS n
         FROM invoice_bill_items i
         WHERE NOT EXISTS (
           SELECT 1 FROM invoice_bills b WHERE b.id = i."invoiceId"
         )`
    );
    record(
      "invoice_bill_items exposes no rows from other orgs' invoices",
      rows[0].n === 0,
      rows[0].n === 0 ? undefined : `LEAK: ${rows[0].n} orphan items visible`
    );
  }

  // ---- 6. Blocked columns and tables --------------------------------------
  console.log("\nGrants");
  await expectDenied(
    "users.passwordHash is unreadable",
    orgA.orgId,
    'SELECT "passwordHash" FROM users LIMIT 1',
    /permission denied|does not exist/i
  );
  await expectDenied(
    "user_invitations is unreadable",
    orgA.orgId,
    "SELECT token FROM user_invitations LIMIT 1",
    /permission denied|does not exist/i
  );
  await expectDenied(
    "checkpoint tables (everyone's chat history) are unreadable",
    orgA.orgId,
    "SELECT * FROM checkpoints LIMIT 1",
    /permission denied|does not exist/i
  );
  await expectDenied(
    "writes are rejected",
    orgA.orgId,
    "UPDATE invoice_bills SET status = 'PAID'",
    /read-only|permission denied/i
  );

  // ---- 7. Schema context ---------------------------------------------------
  console.log("\nSchema context");
  {
    const [context, tables] = await Promise.all([getSchemaContext(), getReadableTables()]);
    const hasRenamedColumn = context.includes("createdByUserId");
    const hasNoOldColumn = !context.includes("customerId");
    const hasComments = context.includes("EXCLUDE DRAFT");

    record(`readable tables: ${tables.join(", ")}`, tables.length > 0);
    record(
      `schema context built (~${Math.round(context.length / 4)} tokens)`,
      context.length > 0
    );
    record("uses createdByUserId, not customerId", hasRenamedColumn && hasNoOldColumn);
    record("column documentation is present", hasComments,
      hasComments ? undefined : "COMMENT ON statements may not have run");
  }

  // ---- 8. Optional: one real question -> SQL -> answer --------------------
  const askIndex = process.argv.indexOf("--ask");
  if (askIndex !== -1 && process.argv[askIndex + 1]) {
    const question = process.argv[askIndex + 1];
    console.log(`\nSQL round trip\n  Question: ${question}`);

    if (!GOOGLE_API_KEY) {
      console.log("  SKIPPED - GOOGLE_API_KEY not set");
    } else {
      const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
      const model = new ChatGoogleGenerativeAI({
        model: "gemini-2.5-flash",
        temperature: 0,
      });

      const schema = await getSchemaContext();
      const reply = await model.invoke([
        {
          role: "system",
          content:
            "You write PostgreSQL SELECT queries for a finance app. Return ONLY " +
            "the SQL, no markdown fences, no explanation. Do not add tenant " +
            "filters - row-level security applies them automatically.\n\n" +
            `Schema:\n${schema}`,
        },
        { role: "user", content: question },
      ]);

      const sql = String(reply.content).replace(/```sql?|```/g, "").trim();
      console.log(`\n  Generated SQL:\n${sql.split("\n").map((l) => "    " + l).join("\n")}\n`);

      try {
        const { rows, rowCount } = await runChatQuery(orgA.orgId, sql);
        console.log(`  Returned ${rowCount} row(s):`);
        console.log(JSON.stringify(rows.slice(0, 5), null, 2).split("\n").map((l) => "    " + l).join("\n"));
        record("generated SQL executed successfully", true);
      } catch (err) {
        record("generated SQL executed successfully", false, err.message);
      }
    }
  }

  // ---- Summary -------------------------------------------------------------
  const failed = results.filter((r) => !r.passed);
  console.log(`\n${"=".repeat(40)}`);
  if (failed.length === 0) {
    console.log(`\x1b[32mAll ${results.length} checks passed.\x1b[0m`);
    console.log("Tenant isolation is enforced by the database. Safe to build the graph.\n");
  } else {
    console.log(`\x1b[31m${failed.length} of ${results.length} checks FAILED:\x1b[0m`);
    for (const f of failed) console.log(`  - ${f.name}`);
    console.log("\nDo NOT wire up the graph until these pass.\n");
  }

  await closeChatPool();
  await prisma.$disconnect();
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("\nVerification crashed:", err.message);
  console.error(err.stack);
  await closeChatPool().catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
