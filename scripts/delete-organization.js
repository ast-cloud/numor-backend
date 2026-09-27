/**
 * Permanently delete one organization and everything belonging to it.
 *
 *   node scripts/delete-organization.js <orgId>              # dry run (default)
 *   node scripts/delete-organization.js <orgId> --confirm    # actually delete
 *
 * Against ENVIRONMENT=production the --confirm flag alone is not enough; you
 * must also pass --production. That is deliberate friction, not ceremony.
 *
 * THIS IS IRREVERSIBLE. There is no undo, no soft-delete, and no backup taken
 * by this script. Run the dry run first and read the inventory.
 *
 * Order of operations matters. The database row is deleted BEFORE the storage
 * objects, because the DB is the only place the storage keys are recorded -
 * deleting files first and then failing the DB delete would leave rows pointing
 * at objects that no longer exist. To make the reverse ordering safe, every key
 * is written to a manifest file on disk before anything is touched, so a crash
 * part-way leaves a retryable record instead of orphaned files nobody can find.
 */

const fs = require("fs");
const path = require("path");

const prisma = require("../src/config/database");
const storage = require("../src/storage/storage.service");
const { ENVIRONMENT } = require("../src/config/env");

// Tables whose rows must disappear when their parent goes. Any FK among these
// that is still RESTRICT / NO ACTION will abort the delete part-way, so we
// check up front rather than discovering it mid-transaction.
const CASCADE_TABLES = [
  "users",
  "clients",
  "invoice_bills",
  "invoice_bill_items",
  "invoice_custom_field_values",
  "expense_bills",
  "expense_bill_items",
  "kpi_snapshots",
  "custom_field_definitions",
  "user_invitations",
  "ca_profiles",
  "ca_profiles_pending",
  "ca_documents",
  "ca_documents_pending",
  "ca_bookings",
  "ca_payments",
  "ca_reviews",
  "ca_slots",
  "ca_analytics_snapshots",
];

async function assertCascadesInPlace() {
  const blocking = await prisma.$queryRaw`
    SELECT c.conrelid::regclass::text AS child_table,
           c.confrelid::regclass::text AS parent_table,
           c.conname                  AS constraint_name
    FROM pg_constraint c
    WHERE c.contype = 'f'
      AND c.confdeltype IN ('a', 'r')
      AND c.conrelid::regclass::text = ANY(${CASCADE_TABLES})
      AND c.confrelid::regclass::text = ANY(${CASCADE_TABLES})
  `;

  if (blocking.length > 0) {
    const lines = blocking
      .map((r) => `  - ${r.child_table} -> ${r.parent_table} (${r.constraint_name})`)
      .join("\n");

    throw new Error(
      "These foreign keys still block deletion (RESTRICT / NO ACTION):\n" +
        lines +
        "\n\nThe onDelete rules in schema.prisma have not been migrated into this " +
        "database yet. Run the migration first - deleting now would fail part-way."
    );
  }
}

async function collectInventory(orgId) {
  const caProfileWhere = { caProfile: { user: { orgId } } };

  const [
    organization,
    users,
    invoices,
    expenses,
    clients,
    kpiSnapshots,
    customFields,
    invitations,
    caProfiles,
    caDocuments,
    caPendingDocuments,
  ] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId } }),
    prisma.user.findMany({
      where: { orgId },
      select: { id: true, email: true, profilePhotoKey: true },
    }),
    prisma.invoiceBill.findMany({ where: { orgId }, select: { pdfKey: true } }),
    prisma.expenseBill.findMany({ where: { orgId }, select: { receiptUrl: true } }),
    prisma.client.count({ where: { orgId } }),
    prisma.kpiSnapshot.count({ where: { orgId } }),
    prisma.customFieldDefinition.count({ where: { orgId } }),
    prisma.userInvitation.count({ where: { organizationId: orgId } }),
    prisma.cAProfile.count({ where: { user: { orgId } } }),
    prisma.cADocument.findMany({ where: caProfileWhere, select: { fileKey: true } }),
    prisma.cADocumentPending.findMany({
      where: { pendingProfile: caProfileWhere },
      select: { fileKey: true },
    }),
  ]);

  // receiptUrl is a storage key despite the name - see expense.service.js:102,
  // which assigns the upload key straight into it.
  const storageKeys = [
    ...invoices.map((i) => i.pdfKey),
    ...expenses.map((e) => e.receiptUrl),
    ...users.map((u) => u.profilePhotoKey),
    ...caDocuments.map((d) => d.fileKey),
    ...caPendingDocuments.map((d) => d.fileKey),
  ].filter(Boolean);

  return {
    organization,
    counts: {
      users: users.length,
      invoices: invoices.length,
      expenses: expenses.length,
      clients,
      kpiSnapshots,
      customFields,
      invitations,
      caProfiles,
      caDocuments: caDocuments.length + caPendingDocuments.length,
    },
    storageKeys,
  };
}

function writeManifest(orgId, inventory) {
  const dir = path.join(__dirname, "..", ".deleted-orgs");
  fs.mkdirSync(dir, { recursive: true });

  const file = path.join(dir, `org-${orgId}-${Date.now()}.json`);
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        orgId: orgId.toString(),
        organizationName: inventory.organization.name,
        organizationEmail: inventory.organization.email,
        deletedAt: new Date().toISOString(),
        environment: ENVIRONMENT,
        counts: inventory.counts,
        storageKeys: inventory.storageKeys,
      },
      null,
      2
    )
  );

  return file;
}

async function main() {
  const [rawId, ...flags] = process.argv.slice(2);

  if (!rawId) {
    throw new Error(
      "Usage: node scripts/delete-organization.js <orgId> [--confirm] [--production]"
    );
  }

  let orgId;
  try {
    orgId = BigInt(rawId);
  } catch {
    throw new Error(`"${rawId}" is not a valid organization id`);
  }

  const confirmed = flags.includes("--confirm");
  const productionAcknowledged = flags.includes("--production");

  if (confirmed && ENVIRONMENT === "production" && !productionAcknowledged) {
    throw new Error(
      "Refusing to delete against ENVIRONMENT=production without --production."
    );
  }

  await assertCascadesInPlace();

  const inventory = await collectInventory(orgId);

  if (!inventory.organization) {
    console.log(`No organization with id ${orgId}. Nothing to do.`);
    return;
  }

  const { organization, counts, storageKeys } = inventory;

  console.log(`\nOrganization ${orgId}: ${organization.name} <${organization.email}>`);
  console.log(`Environment: ${ENVIRONMENT}\n`);
  console.log("Rows that will be deleted by the cascade:");
  for (const [label, count] of Object.entries(counts)) {
    console.log(`  ${label.padEnd(16)} ${count}`);
  }
  console.log(`\nStorage objects to remove: ${storageKeys.length}`);

  if (!confirmed) {
    console.log("\nDry run. Nothing was deleted. Re-run with --confirm to proceed.");
    return;
  }

  const manifest = writeManifest(orgId, inventory);
  console.log(`\nManifest written to ${manifest}`);

  // The cascade does the relational work; this single delete is the whole
  // teardown as far as Postgres is concerned.
  await prisma.organization.delete({ where: { id: orgId } });
  console.log(`Deleted organization row ${orgId} (cascade applied).`);

  if (storageKeys.length > 0) {
    const { requested, removed } = await storage.removeMany(storageKeys);
    console.log(`Removed ${removed}/${requested} storage objects.`);
  }

  console.log("\nDone.");
  console.log(
    "NOT removed: LangGraph chatbot history in checkpoints / checkpoint_blobs /\n" +
      "checkpoint_writes. Those rows are keyed by `session-<sessionId>` with no\n" +
      "org or user reference, so they cannot be located from an org id."
  );
}

main()
  .catch((error) => {
    console.error(`\n${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
