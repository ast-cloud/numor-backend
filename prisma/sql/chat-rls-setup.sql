-- ============================================================================
-- Numor chatbot: read-only role + row-level security
--
-- RUN THIS ONCE, AS THE DATABASE OWNER (Supabase SQL editor, or psql as the
-- same user your DATABASE_URL uses).
--
-- Before running: replace CHANGE_ME_STRONG_PASSWORD below, then put the
-- resulting connection string in CHAT_DATABASE_URL in your .env:
--   postgresql://numor_chat_ro:<password>@<host>:<port>/<db>
--
-- This script is idempotent - safe to re-run after adding tables/columns.
--
-- IMPORTANT: we use ENABLE ROW LEVEL SECURITY, not FORCE. Plain ENABLE exempts
-- the table owner, which is the role your main app connects as - so every
-- existing module keeps working untouched. Only numor_chat_ro is policed.
-- Do NOT add FORCE unless you want to rewrite the rest of the app.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. The role
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'numor_chat_ro') THEN
    CREATE ROLE numor_chat_ro LOGIN PASSWORD 'CHANGE_ME_STRONG_PASSWORD';
  END IF;
END
$$;

-- Belt and braces: even if a grant slips through, this role can never write.
ALTER ROLE numor_chat_ro SET default_transaction_read_only = on;
ALTER ROLE numor_chat_ro SET statement_timeout = '8s';
ALTER ROLE numor_chat_ro SET idle_in_transaction_session_timeout = '15s';

-- Start from nothing.
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM numor_chat_ro;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM numor_chat_ro;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM numor_chat_ro;
GRANT  USAGE ON SCHEMA public TO numor_chat_ro;

-- Tables created in future must not be auto-granted.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM numor_chat_ro;


-- ---------------------------------------------------------------------------
-- 2. Grants - the ONLY tables and columns the chatbot can ever see.
--    Anything not listed here is invisible: users.passwordHash,
--    users.resetPasswordToken, user_invitations.token, the checkpoint_*
--    tables holding everyone's chat history, ca_payments, etc.
--
--    The schema description sent to the model is generated FROM these grants
--    (see schemaContext.js), so the two can never drift apart.
-- ---------------------------------------------------------------------------
GRANT SELECT ON invoice_bills       TO numor_chat_ro;
GRANT SELECT ON invoice_bill_items  TO numor_chat_ro;
GRANT SELECT ON expense_bills       TO numor_chat_ro;
GRANT SELECT ON expense_bill_items  TO numor_chat_ro;
GRANT SELECT ON clients             TO numor_chat_ro;

-- Deliberately column-scoped.
GRANT SELECT (id, name, email, "orgId")            ON users         TO numor_chat_ro;
GRANT SELECT (id, name, city, state, country)      ON organizations TO numor_chat_ro;


-- ---------------------------------------------------------------------------
-- 3. Row-level security
--
--    current_setting('app.current_org_id', true) returns NULL when unset,
--    rather than raising. NULL makes the predicate NULL, which hides the row.
--    So a bug that forgets to set the org id yields zero rows, never a leak.
-- ---------------------------------------------------------------------------

-- Tables that carry orgId directly ------------------------------------------
ALTER TABLE invoice_bills ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chat_ro_tenant ON invoice_bills;
CREATE POLICY chat_ro_tenant ON invoice_bills
  FOR SELECT TO numor_chat_ro
  USING ("orgId" = current_setting('app.current_org_id', true)::bigint);

ALTER TABLE expense_bills ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chat_ro_tenant ON expense_bills;
CREATE POLICY chat_ro_tenant ON expense_bills
  FOR SELECT TO numor_chat_ro
  USING ("orgId" = current_setting('app.current_org_id', true)::bigint);

-- clients.orgId is nullable; NULL fails the comparison, so orphan client rows
-- stay hidden. That is the behaviour we want.
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chat_ro_tenant ON clients;
CREATE POLICY chat_ro_tenant ON clients
  FOR SELECT TO numor_chat_ro
  USING ("orgId" = current_setting('app.current_org_id', true)::bigint);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chat_ro_tenant ON users;
CREATE POLICY chat_ro_tenant ON users
  FOR SELECT TO numor_chat_ro
  USING ("orgId" = current_setting('app.current_org_id', true)::bigint);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chat_ro_tenant ON organizations;
CREATE POLICY chat_ro_tenant ON organizations
  FOR SELECT TO numor_chat_ro
  USING (id = current_setting('app.current_org_id', true)::bigint);

-- Child tables have no orgId of their own - only a parent FK. The tenancy
-- filter therefore has to travel through the parent, and here the DATABASE
-- enforces that join rather than trusting the generated SQL to include it.
ALTER TABLE invoice_bill_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chat_ro_tenant ON invoice_bill_items;
CREATE POLICY chat_ro_tenant ON invoice_bill_items
  FOR SELECT TO numor_chat_ro
  USING (EXISTS (
    SELECT 1 FROM invoice_bills b
    WHERE b.id = invoice_bill_items."invoiceId"
      AND b."orgId" = current_setting('app.current_org_id', true)::bigint
  ));

ALTER TABLE expense_bill_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chat_ro_tenant ON expense_bill_items;
CREATE POLICY chat_ro_tenant ON expense_bill_items
  FOR SELECT TO numor_chat_ro
  USING (EXISTS (
    SELECT 1 FROM expense_bills e
    WHERE e.id = expense_bill_items."expenseId"
      AND e."orgId" = current_setting('app.current_org_id', true)::bigint
  ));

-- Keeps the parent lookup in those two policies an index-only scan.
CREATE INDEX IF NOT EXISTS idx_invoice_bills_id_org ON invoice_bills (id, "orgId");
CREATE INDEX IF NOT EXISTS idx_expense_bills_id_org ON expense_bills (id, "orgId");


-- ---------------------------------------------------------------------------
-- 4. Column documentation
--
--    These comments are read back out of the catalog and handed to the model
--    as the schema description. Putting them here rather than in a separate
--    file means they live with the schema and cannot drift out of sync.
--
--    This is where the tax/revenue ambiguity gets settled once and for all.
-- ---------------------------------------------------------------------------
COMMENT ON TABLE  invoice_bills IS
  'Invoices this organisation has issued to its clients. One row per invoice.';

COMMENT ON COLUMN invoice_bills."baseAmount" IS
  'Invoice total converted to the organisation base currency. USE THIS for every SUM, AVG or comparison across invoices.';
COMMENT ON COLUMN invoice_bills."totalAmount" IS
  'Invoice total in the invoice own currency. NEVER sum this across rows - different rows may be in different currencies.';
COMMENT ON COLUMN invoice_bills."taxAmount" IS
  'Authoritative tax charged on this invoice. USE THIS for "tax collected". Do NOT recompute tax from invoice_bill_items.taxRate - that ignores invoice-level discount and gives a different, wrong number.';
COMMENT ON COLUMN invoice_bills."effectiveTax" IS
  'Legacy/derived field. Do not use. Use taxAmount instead.';
COMMENT ON COLUMN invoice_bills."taxSummary" IS
  'JSON breakdown for PDF rendering only. Do not query for totals - use taxAmount.';
COMMENT ON COLUMN invoice_bills.status IS
  'Payment state: one of DRAFT, UNPAID, PAID, OVERDUE. EXCLUDE DRAFT from any revenue figure - drafts are not real income. Whether the invoice was delivered is recorded separately by sentAt.';
COMMENT ON COLUMN invoice_bills."paidAmount" IS
  'Amount actually received against this invoice, in the invoice own currency.';
COMMENT ON COLUMN invoice_bills."balanceDue" IS
  'Amount still owed on this invoice. Sum for "outstanding" / "unpaid" totals.';
COMMENT ON COLUMN invoice_bills."issueDate" IS
  'Date the invoice was issued. Use this for period filters and monthly grouping unless the user clearly means payment date.';
COMMENT ON COLUMN invoice_bills."createdById" IS
  'The Numor user who created the invoice (FK users.id). Not the client being billed - that is clientId.';
COMMENT ON COLUMN invoice_bills."updatedById" IS
  'The Numor user who last modified the invoice (FK users.id). NULL if never modified since creation.';
COMMENT ON COLUMN invoice_bills."clientId" IS
  'The client being billed (FK clients.id). Join to clients for the client name.';

COMMENT ON TABLE  invoice_bill_items IS
  'Line items on an invoice. One row per line. Use for product/service level questions such as best selling items or quantities.';
COMMENT ON COLUMN invoice_bill_items."taxRate" IS
  'Tax percentage for this line only. Do NOT use to compute total tax collected - see invoice_bills.taxAmount.';
COMMENT ON COLUMN invoice_bill_items."totalPrice" IS
  'Line total before invoice-level discount and shipping, in the parent invoice currency.';

COMMENT ON TABLE  expense_bills IS
  'Expenses recorded by this organisation. One row per expense bill. Many are OCR-scanned receipts.';
COMMENT ON COLUMN expense_bills."totalAmount" IS
  'Expense total. Sum for total spend.';
COMMENT ON COLUMN expense_bills."totalTax" IS
  'Tax paid on this expense. Use for input tax / tax paid questions.';
COMMENT ON COLUMN expense_bills."expenseDate" IS
  'Date the expense was incurred. Use for period filters and monthly grouping.';
COMMENT ON COLUMN expense_bills."createdById" IS
  'The Numor user who recorded the expense (FK users.id). NULL if that user has since been deleted.';
COMMENT ON COLUMN expense_bills."updatedById" IS
  'The Numor user who last modified the expense (FK users.id). NULL if never modified since creation.';
COMMENT ON COLUMN expense_bills.merchant IS
  'Merchant name, often OCR-extracted so spelling may vary. Prefer ILIKE over = when matching.';
COMMENT ON COLUMN expense_bills."ocrConfidence" IS
  'Confidence of OCR extraction, 0 to 1. Low values mean the amounts may be unreliable.';

COMMENT ON TABLE  clients IS
  'Customers this organisation invoices. Join invoice_bills.clientId to clients.id for client names.';
COMMENT ON TABLE  users IS
  'Numor users in this organisation. Only id, name, email and orgId are readable.';


-- ---------------------------------------------------------------------------
-- 5. Verify
--
--    Run these as numor_chat_ro to confirm the setup is live. The first must
--    return 0 rows (no org id set = nothing visible). The second must return
--    only that org's rows.
--
--      SELECT count(*) FROM invoice_bills;                        -- expect 0
--      SELECT set_config('app.current_org_id', '<orgId>', false);
--      SELECT count(*) FROM invoice_bills;                        -- expect >0
--      SELECT "passwordHash" FROM users LIMIT 1;                  -- expect permission denied
-- ---------------------------------------------------------------------------
