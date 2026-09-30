const prisma = require('../../config/database');
const { clientForDisplay } = require("../../utils/clientSnapshot");
const aiService = require('../ai/ai.service');
const qstashService = require("../../queues/invoice.qstash");
const { is } = require('zod/locales');
const storage = require('../../storage/storage.service');
const { Parser } = require("json2csv");
const ExcelJS = require("exceljs");

// pdfStatus values finalize may (re)queue from. QUEUED/PROCESSING are excluded -
// a job is already in flight; READY has nothing left to do.
const REQUEUEABLE_PDF_STATUSES = new Set(["NOT_STARTED", "FAILED"]);

function isExcelFile(mimetype, filename) {
    if (mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
        mimetype === "application/vnd.ms-excel") {
        return true;
    }
    if (typeof filename === 'string' &&
        (filename.endsWith('.xlsx') || filename.endsWith('.xls'))) {
        return true;
    }
    return false;
}

function isCsvFile(mimetype, filename) {
    return (
        mimetype === 'text/csv' ||
        mimetype === 'application/csv' ||
        (typeof filename === 'string' && filename.endsWith('.csv'))
    );
}

// Only an issued, unpaid invoice can fall overdue.
const OVERDUE_ELIGIBLE_STATUSES = ["UNPAID"];

// Flips any already-fetched invoices past their due date to OVERDUE.
// Skips the write entirely when nothing in the batch actually needs it.
async function markOverdueInvoices(invoices) {
    const list = Array.isArray(invoices) ? invoices : [invoices];
    const now = new Date();

    const overdueIds = list
        .filter((inv) => inv && OVERDUE_ELIGIBLE_STATUSES.includes(inv.status) && inv.dueDate < now)
        .map((inv) => inv.id);

    if (overdueIds.length) {
        await prisma.invoiceBill.updateMany({
            where: { id: { in: overdueIds } },
            data: { status: "OVERDUE" },
        });

        const overdueIdSet = new Set(overdueIds.map(String));
        list.forEach((inv) => {
            if (inv && overdueIdSet.has(String(inv.id))) {
                inv.status = "OVERDUE";
            }
        });
    }

    return invoices;
}

function normalizeCustomFields(customFields) {
    if (!Array.isArray(customFields)) return [];

    // Keyed by name so a payload carrying the same field twice collapses to one
    // entry instead of failing on the (invoiceId, customFieldId) unique index.
    // Last one wins - it is the value the user edited most recently.
    const byName = new Map();

    const parsed = customFields
        .map((entry) => {
            if (!entry || typeof entry !== "object") return null;

            if (typeof entry.name === "string") {
                const name = entry.name.trim();
                if (!name) return null;
                return {
                    name,
                    value: entry.value == null ? "" : String(entry.value),
                };
            }

            const [name, value] = Object.entries(entry)[0] || [];
            if (!name || typeof name !== "string" || !name.trim()) return null;

            return {
                name: name.trim(),
                value: value == null ? "" : String(value),
            };
        })
        .filter(Boolean);

    for (const field of parsed) byName.set(field.name, field);

    return [...byName.values()];
}

async function saveInvoiceCustomFields(tx, orgId, invoiceId, customFields) {
    const normalized = normalizeCustomFields(customFields);
    if (!normalized.length) return;

    for (const field of normalized) {
        const definition = await tx.customFieldDefinition.findUnique({
            where: {
                orgId_name: {
                    orgId: BigInt(orgId),
                    name: field.name,
                },
            },
        });

        if (!definition) {
            throw new Error(`Custom field "${field.name}" is not defined in settings.`);
        }

        await tx.invoiceCustomFieldValue.create({
            data: {
                invoiceId: BigInt(invoiceId),
                customFieldId: definition.id,
                orgId: BigInt(orgId),
                value: field.value,
            },
        });
    }
}

async function previewInvoiceAI(file) {
    const { path, mimetype, originalname } = file;
    //Excel 
    if (isExcelFile(mimetype, originalname)) {
        const parsed = await aiService.parseInvoiceFromExcel(path);
        return {
            source: "gemini-vision-excel",
            parsedData: parsed,
            confidence: parsed.confidence || null,
        };
    }

    if (isCsvFile(mimetype, originalname)) {
        const parsed = await aiService.parseInvoiceFromCsv(path);
        return {
            source: "gemini-vision-csv",
            parsedData: parsed,
            confidence: parsed.confidence || null,
        };
    }


    //Pdf and Image
    const parsed = await aiService.parseInvoiceFromFile(path);

    return {
        source: "gemini-vision",
        parsedData: parsed,
        confidence: parsed.confidence || null,
    };
}

// STEP 2: SAVE CONFIRMED DATA
async function saveInvoiceFromPreview(user, payload) {
    return await prisma.$transaction(async (tx) => {


        const subtotal = toNumber(payload.subtotal);
        const discount = toNumber(payload.discount);
        const taxAmount = toNumber(payload.taxAmount);
        const shippingCost = toNumber(payload.shippingCost);

        const totalAmount =
            payload.totalAmount !== undefined && payload.totalAmount !== null
                ? toNumber(payload.totalAmount)
                : subtotal - discount + taxAmount + shippingCost;

        const paidAmount = toNumber(payload.paidAmount);
        const balanceDue = totalAmount - paidAmount;

        const exchangeRate = toNumber(payload.exchangeRate, 1);
        const baseAmount = totalAmount * exchangeRate;
        const client =
            payload.buyer
                ? await tx.client.create({
                    data: {
                        orgId: BigInt(user.orgId),
                        name: payload.buyer.name,
                        email: payload.buyer.email,
                        phone: payload.buyer.phone,
                        streetAddress: payload.buyer.address?.street,
                        city: payload.buyer.address?.city,
                        state: payload.buyer.address?.state,
                        zipCode: payload.buyer.address?.zipCode,
                        country: payload.buyer.address?.country,
                        companyType: payload.buyer.companyType,
                        taxId: payload.buyer.taxId ?? payload.buyer.gstin,
                        taxSystem: payload.buyer.taxSystem ?? "NONE",
                        isActive: true,
                    },
                })
                : null;

        // 1️⃣ Create invoice
        const invoice = await tx.invoiceBill.create({
            data: {
                orgId: BigInt(user.orgId),
                createdById: BigInt(user.userId),
                clientId: client ? client.id : null,

                invoiceNumber:
                    payload.invoiceNumber ??
                    `INV-${user.userId}-${(
                        Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
                    ).toUpperCase()}`,

                invoiceType: payload.invoiceType ?? "TAX",
                issueDate: payload.invoiceDate ? new Date(payload.invoiceDate) : new Date(),
                dueDate: payload.dueDate ? new Date(payload.dueDate) : new Date(),
                paymentTerms: payload.paymentTerms ?? "Due on receipt",

                currency: payload.currency ?? "USD",
                exchangeRate,
                baseCurrency: payload.baseCurrency ?? "INR",
                baseAmount,

                subtotal,
                discount,
                taxAmount,
                shippingCost,
                totalAmount,

                paidAmount,
                balanceDue,

                status: payload.status ?? "UNPAID",
                category: payload.category ?? "OTHER",
                confirmedAt: new Date(),

                // 🧾 Seller snapshot (important for legal/history)
                sellerName: payload.seller?.name,
                sellerEmail: payload.seller?.email,
                sellerPhone: payload.seller?.phone,
                sellerStreetAddress: payload.seller?.streetAddress,
                sellerCity: payload.seller?.city,
                sellerState: payload.seller?.state,
                sellerZipCode: payload.seller?.zipCode,
                sellerCountry: payload.seller?.country,
                sellerTaxId: payload.seller?.taxId,
                iecCode: payload.seller?.iecCode,
                lutFiled: payload.seller?.lutFiled ?? false,

                // 🧮 Tax & compliance
                taxType: payload.taxType ?? "NONE",
                placeOfSupply: payload.placeOfSupply,
                reverseCharge: payload.reverseCharge ?? false,
                reverseReason: payload.reverseReason,
                sacCode: payload.sacCode,
                taxSummary: payload.taxSummary,

                // 🚚 Shipping / trade
                shipToName: payload.shipTo?.name,
                shipToAddress: payload.shipTo?.address,
                countryOfOrigin: payload.countryOfOrigin,
                countryOfDestination: payload.countryOfDestination,
                incoterms: payload.incoterms,

                // 💳 Payment
                bankDetails: payload.bankDetails,
                paymentLink: payload.paymentLink,
                bankAddress: payload.bankAddress,

                // ⚖️ Legal
                jurisdiction: payload.jurisdiction,
                lateFeePolicy: payload.lateFeePolicy,
                notes: payload.notes,
            },
        });

        // 2️⃣ Create invoice items
        if (Array.isArray(payload.items)) {
            for (const item of payload.items) {
                await tx.invoiceBillItem.create({
                    data: {
                        invoiceId: invoice.id,
                        itemName: item.name,
                        description: item.description,
                        quantity: item.quantity ?? 1,
                        unitType: item.unitType ?? "UNIT",
                        unitPrice: item.unitPrice ?? 0,
                        taxRate: item.taxRate ?? 0,
                        totalPrice: item.itemTotal ?? 0,
                    },
                });
            }
        }

        await saveInvoiceCustomFields(tx, user.orgId, invoice.id, payload.customFields);

        return invoice;
    });
}

// The tabs the invoice list offers, as where-clauses.
//
// "all" and "draft" are exact complements: a draft nobody has issued yet sits on
// the Draft tab, while a draft whose PDF is generating or failed is still
// mid-flight and belongs with the active ones. pdfStatus tells them apart.
const LIST_TABS = {
    all: { NOT: { AND: [{ status: "DRAFT" }, { pdfStatus: "NOT_STARTED" }] } },
    draft: { AND: [{ status: "DRAFT" }, { pdfStatus: "NOT_STARTED" }] },
    unpaid: { status: "UNPAID" },
    paid: { status: "PAID" },
    overdue: { status: "OVERDUE" },
};

const LIST_SORTS = {
    due_date_desc: { dueDate: "desc" },
    due_date_asc: { dueDate: "asc" },
    issue_date_desc: { issueDate: "desc" },
    issue_date_asc: { issueDate: "asc" },
    amount_desc: { totalAmount: "desc" },
    amount_asc: { totalAmount: "asc" },
    client_desc: { clientName: "desc" },
    client_asc: { clientName: "asc" },
};

/**
 * Everything the list is filtered by, minus paging. Shared by the page query,
 * the tab counts and the summary totals, so the three can never disagree about
 * what they are describing.
 */
function buildListWhere(user, { search, tab, startDate, endDate, dateField, clientIds } = {}) {
    const where = { orgId: BigInt(user.orgId) };

    // Filters on the id, not the snapshot name: two clients may share a name,
    // and the picker the user chose from is a list of ids.
    if (clientIds?.length) {
        where.clientId = { in: clientIds.map((id) => BigInt(id)) };
    }

    if (tab && LIST_TABS[tab]) {
        Object.assign(where, LIST_TABS[tab]);
    }

    if (startDate || endDate) {
        // Which date the range applies to is up to the caller: the list screen
        // filters on when payment is due, exports on when the invoice was raised.
        const field = dateField === "dueDate" ? "dueDate" : "issueDate";
        where[field] = {};

        if (startDate) where[field].gte = new Date(startDate);

        if (endDate) {
            // Inclusive of the whole end day.
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            where[field].lte = end;
        }
    }

    const term = (search ?? "").trim();
    if (term) {
        // clientName is the snapshot on the invoice, which is what the list
        // displays. The relation is searched too, so a row written before the
        // snapshot column existed is still findable.
        where.OR = [
            { invoiceNumber: { contains: term, mode: "insensitive" } },
            { clientName: { contains: term, mode: "insensitive" } },
            { client: { is: { name: { contains: term, mode: "insensitive" } } } },
        ];
    }

    return where;
}

async function listInvoices(user, options = {}) {
    const { search, tab, sort, startDate, endDate, dateField, clientIds } = options;

    const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 200);
    const offset = Math.max(Number(options.offset) || 0, 0);

    const where = buildListWhere(user, { search, tab, startDate, endDate, dateField, clientIds });
    const orderBy = LIST_SORTS[sort] ?? { createdAt: "desc" };

    const [invoices, total] = await Promise.all([
        prisma.invoiceBill.findMany({
            where,
            include: {
                items: true,
                customFields: { include: { customField: true } },
            },
            // A second key, because dueDate and totalAmount are not unique. Without
            // it two rows that tie can swap places between queries, and one of them
            // is then shown on two pages while the other is never shown at all.
            orderBy: [orderBy, { id: "desc" }],
            take: limit,
            skip: offset,
        }),
        prisma.invoiceBill.count({ where }),
    ]);

    await markOverdueInvoices(invoices);

    const summary = await buildListSummary(user, { search, tab, startDate, endDate, dateField, clientIds });

    return { invoices, pagination: { total, limit, offset }, ...summary };
}

/**
 * The numbers the list screen shows outside the rows: a count per tab, and the
 * money totals for the tab being viewed.
 *
 * These describe the whole filtered set, not the page. Deriving them on the
 * client would have quietly reduced them to "the twenty rows you can see" the
 * moment paging arrived.
 */
async function buildListSummary(user, { search, tab, startDate, endDate, dateField, clientIds }) {
    // Counts deliberately ignore the tab: every tab shows its own count at once.
    const countWhere = buildListWhere(user, { search, startDate, endDate, dateField, clientIds });

    // Totals describe the tab being viewed, drafts excluded - an invoice nobody
    // has issued is not income. AND rather than a spread, because the tab clause
    // may itself set status and would be overwritten.
    const totalsWhere = {
        AND: [
            buildListWhere(user, { search, tab, startDate, endDate, dateField, clientIds }),
            { status: { not: "DRAFT" } },
        ],
    };

    const [grouped, byCurrency, topClientRows, invoiceCount] = await Promise.all([
        prisma.invoiceBill.groupBy({
            by: ["status", "pdfStatus"],
            where: countWhere,
            _count: { _all: true },
        }),
        prisma.invoiceBill.groupBy({
            by: ["currency", "status"],
            where: totalsWhere,
            _sum: { totalAmount: true },
        }),
        prisma.invoiceBill.groupBy({
            by: ["clientName"],
            where: totalsWhere,
            _sum: { totalAmount: true },
            orderBy: { _sum: { totalAmount: "desc" } },
            take: 1,
        }),
        prisma.invoiceBill.count({ where: totalsWhere }),
    ]);

    const counts = { all: 0, unpaid: 0, paid: 0, overdue: 0, draft: 0 };
    for (const row of grouped) {
        const n = row._count._all;
        const unissuedDraft = row.status === "DRAFT" && row.pdfStatus === "NOT_STARTED";

        // all and draft partition the set; the status tabs overlap with all.
        if (unissuedDraft) counts.draft += n;
        else counts.all += n;

        if (row.status === "UNPAID") counts.unpaid += n;
        if (row.status === "PAID") counts.paid += n;
        if (row.status === "OVERDUE") counts.overdue += n;
    }

    const currencies = new Map();
    for (const row of byCurrency) {
        const bucket = currencies.get(row.currency) ?? { currency: row.currency, total: 0, paid: 0, unpaid: 0 };
        const amount = toNumber(row._sum.totalAmount);

        bucket.total += amount;
        if (row.status === "PAID") bucket.paid += amount;
        // Outstanding is everything issued and not yet settled.
        if (row.status === "UNPAID" || row.status === "OVERDUE") bucket.unpaid += amount;

        currencies.set(row.currency, bucket);
    }

    const top = topClientRows[0];

    return {
        counts,
        totals: {
            invoiceCount,
            byCurrency: [...currencies.values()].sort((a, b) => b.total - a.total),
            topClient: top?.clientName
                ? { name: top.clientName, amount: toNumber(top._sum.totalAmount) }
                : null,
        },
    };
}

async function listInvoiceProducts(invoiceId, page = 1, limit = 10) {
    page = Number(page);
    limit = Number(limit);

    if (Number.isNaN(page) || page < 1) page = 1;
    if (Number.isNaN(limit) || limit < 1) limit = 10;
    const offset = (page - 1) * limit;
    return prisma.invoiceBillItem.findMany({
        where: { invoiceId: BigInt(invoiceId) },
        take: limit,
        skip: offset,
    })
}

// Shared builders. Create and update once kept separate copies of this mapping
// and drifted - the update path silently ignored a dozen fields.

/**
 * Money as a number, whatever it arrives as.
 *
 * Two sources hand us non-numbers. Prisma returns Decimal objects, whose
 * valueOf() is a string, and unvalidated payloads carry strings straight from
 * JSON. Either one turns a + into concatenation: 21000 + Decimal(0) is the
 * string "210000", which is then stored as the total. Subtraction and
 * multiplication coerce numerically and hide the problem, so only the additions
 * were ever wrong.
 */
function toNumber(value, fallback = 0) {
    if (value === null || value === undefined) return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function generateInvoiceNumber(user) {
    const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    return `INV-${user.userId}-${suffix.toUpperCase()}`;
}

function computeTotals(data) {
    const items = data.items ?? [];

    const subtotal = items.reduce(
        (s, i) => s + toNumber(i.quantity, 1) * toNumber(i.unitPrice),
        0
    );

    const taxAmount = items.reduce(
        (s, i) => s + (toNumber(i.quantity, 1) * toNumber(i.unitPrice) * toNumber(i.taxRate)) / 100,
        0
    );

    const discount = toNumber(data.discount);
    const shippingCost = toNumber(data.shippingCost);
    const paidAmount = toNumber(data.paidAmount);
    const exchangeRate = toNumber(data.exchangeRate, 1);
    const totalAmount = subtotal - discount + taxAmount + shippingCost;

    return {
        subtotal,
        taxAmount,
        discount,
        shippingCost,
        paidAmount,
        exchangeRate,
        totalAmount,
        balanceDue: totalAmount - paidAmount,
        baseAmount: totalAmount * exchangeRate,
        effectiveTax: subtotal ? Number(((taxAmount / subtotal) * 100).toFixed(2)) : 0,
    };
}

function buildItemsCreate(items) {
    return (items ?? []).map((item) => ({
        itemName: item.name,
        description: item.description,
        quantity: item.quantity ?? 1,
        unitType: item.unitType ?? "UNIT",
        unitPrice: item.unitPrice ?? 0,
        taxRate: item.taxRate ?? 0,
        totalPrice: item.itemTotal ?? (item.quantity ?? 1) * (item.unitPrice ?? 0),
    }));
}

// The columns that hold the billed party on the invoice itself.
const CLIENT_SNAPSHOT_SELECT = {
    name: true,
    email: true,
    phone: true,
    streetAddress: true,
    city: true,
    state: true,
    zipCode: true,
    country: true,
    taxId: true,
    taxSystem: true,
    companyType: true,
};

/**
 * The client as the invoice should remember it. Null client means null columns,
 * which is what detaching one has to write - leaving the old name behind would
 * be worse than losing it.
 */
function buildClientSnapshot(client) {
    return {
        clientName: client?.name ?? null,
        clientEmail: client?.email ?? null,
        clientPhone: client?.phone ?? null,
        clientStreetAddress: client?.streetAddress ?? null,
        clientCity: client?.city ?? null,
        clientState: client?.state ?? null,
        clientZipCode: client?.zipCode ?? null,
        clientCountry: client?.country ?? null,
        clientTaxId: client?.taxId ?? null,
        clientTaxSystem: client?.taxSystem ?? null,
        clientCompanyType: client?.companyType ?? null,
    };
}

/** Loads a client for snapshotting, org-scoped so one tenant cannot copy another. */
async function loadClientForSnapshot(db, orgId, clientId) {
    if (!clientId) return null;

    return db.client.findFirst({
        where: { id: BigInt(clientId), orgId: BigInt(orgId) },
        select: CLIENT_SNAPSHOT_SELECT,
    });
}

// Every scalar column a create writes. Updates go through updateInvoice(),
// which patches only the keys the caller actually sent.
function buildInvoiceFields(user, data, totals) {
    return {
        orgId: BigInt(user.orgId),
        createdById: BigInt(user.userId),
        clientId: data.clientId ? BigInt(data.clientId) : null,

        invoiceNumber: data.invoiceNumber ?? generateInvoiceNumber(user),
        invoiceType: data.invoiceType ?? "TAX",

        issueDate: data.issueDate ? new Date(data.issueDate) : new Date(),
        dueDate: data.dueDate ? new Date(data.dueDate) : new Date(),
        paymentTerms: data.paymentTerms ?? "Due on receipt",

        currency: data.currency ?? "USD",
        baseCurrency: data.baseCurrency ?? "INR",
        ...totals,

        category: data.category ?? "OTHER",

        sellerName: data.seller?.name,
        sellerEmail: data.seller?.email,
        sellerPhone: data.seller?.phone,
        sellerStreetAddress: data.seller?.streetAddress,
        sellerCity: data.seller?.city,
        sellerState: data.seller?.state,
        sellerZipCode: data.seller?.zipCode,
        sellerCountry: data.seller?.country,
        sellerTaxId: data.seller?.taxId,
        sellerTaxSystem: data.seller?.taxSystem,
        iecCode: data.seller?.iecCode,
        lutFiled: data.seller?.lutFiled ?? false,

        taxType: data.taxType ?? "NONE",
        placeOfSupply: data.placeOfSupply,
        reverseCharge: data.reverseCharge ?? false,
        reverseReason: data.reverseReason,
        sacCode: data.sacCode,
        taxSummary: data.taxSummary,

        shipToName: data.shipTo?.name,
        shipToAddress: data.shipTo?.address,
        countryOfOrigin: data.countryOfOrigin,
        countryOfDestination: data.countryOfDestination,
        incoterms: data.incoterms,

        bankDetails: data.bankDetails,
        paymentLink: data.paymentLink,
        bankAddress: data.bankAddress,

        jurisdiction: data.jurisdiction,
        lateFeePolicy: data.lateFeePolicy,
        notes: data.notes,
    };
}

// What a mutation returns. Every caller of finalize / resend / payment-status
// discards the body, so loading items and custom fields back out is wasted work.
const INVOICE_STATE = { id: true, status: true, pdfStatus: true, emailStatus: true };

function readInvoiceState(invoiceId) {
    return prisma.invoiceBill.findUniqueOrThrow({
        where: { id: BigInt(invoiceId) },
        select: INVOICE_STATE,
    });
}

// Creates only - never issues. finalizeInvoice() is a separate request made once
// the client holds the id. idempotencyKey covers the gap before that: the unique
// index on (orgId, idempotencyKey) resolves a retry to the row it already made.
async function createInvoice(loggedInUser, data, { idempotencyKey }) {
    const orgId = BigInt(loggedInUser.orgId);
    const totals = computeTotals(data);

    // Copied at write time, not read time: the invoice must keep who it billed
    // even after that client is edited or deleted.
    const client = await loadClientForSnapshot(prisma, loggedInUser.orgId, data.clientId);

    const fields = {
        ...buildInvoiceFields(loggedInUser, data, totals),
        ...buildClientSnapshot(client),
    };

    // Identity must survive a retry: buildInvoiceFields generates a fresh
    // invoiceNumber when the payload omits one, which would renumber on update.
    const { invoiceNumber, orgId: _orgId, createdById, ...updatableFields } = fields;

    // Only drafts may be rewritten - an issued invoice's PDF may already be with
    // the client. Also covers "already emailed", which happens after DRAFT.
    const prior = await prisma.invoiceBill.findUnique({
        where: { orgId_idempotencyKey: { orgId, idempotencyKey } },
        select: INVOICE_STATE,
    });

    if (prior && prior.status !== "DRAFT") {
        return prior;
    }

    const writeInvoice = () =>
        prisma.$transaction(async (tx) => {
            const invoice = await tx.invoiceBill.upsert({
                where: { orgId_idempotencyKey: { orgId, idempotencyKey } },
                create: {
                    ...fields,
                    idempotencyKey,
                    status: "DRAFT",
                    pdfStatus: "NOT_STARTED",
                    items: { create: buildItemsCreate(data.items) },
                },
                // A retry may carry edits, so the newer payload wins. Resetting
                // pdfStatus re-renders from it; clearing the lease fences out any
                // worker still rendering the old data.
                update: {
                    ...updatableFields,
                    pdfStatus: "NOT_STARTED",
                    pdfLeaseExpiresAt: null,
                    items: { deleteMany: {}, create: buildItemsCreate(data.items) },
                },
                select: INVOICE_STATE,
            });

            await tx.invoiceCustomFieldValue.deleteMany({ where: { invoiceId: invoice.id } });
            await saveInvoiceCustomFields(tx, loggedInUser.orgId, invoice.id, data.customFields);

            return invoice;
        });

    try {
        return await writeInvoice();
    } catch (err) {
        // Prisma only compiles upsert to a native ON CONFLICT for simple
        // queries; nested item writes can make it read-then-write, which two
        // concurrent requests can both lose. The constraint still catches it.
        const isDuplicateKey =
            err.code === "P2002" &&
            String(err.meta?.target ?? "").includes("idempotencyKey");

        if (!isDuplicateKey) throw err;

        return writeInvoice();
    }
}

// Queues PDF generation. Idempotent - it is both "confirm" and "retry".
// Deliberately leaves the invoice in DRAFT: the worker promotes it to UNPAID when
// the document actually exists, which also keeps a failed invoice editable.
async function finalizeInvoice(loggedInUser, id, { sendEmail = false } = {}) {
    const invoiceId = BigInt(id);

    const invoice = await prisma.invoiceBill.findFirst({
        where: { id: invoiceId, orgId: BigInt(loggedInUser.orgId) },
        select: { ...INVOICE_STATE, _count: { select: { items: true } } },
    });

    if (!invoice) {
        throw new Error("Invoice not found");
    }

    // A draft may be saved empty, but an issued invoice may not: it would bill the
    // client for nothing. Checked here rather than at create, because this is the
    // step that turns a draft into a real document.
    if (invoice._count.items === 0) {
        throw new Error("Add at least one item before creating the invoice.");
    }

    // A job already in flight or finished is left alone - no stacked jobs.
    if (!REQUEUEABLE_PDF_STATUSES.has(invoice.pdfStatus)) {
        // _count is for the guard above, not for the caller: hand back the same
        // shape every other exit returns.
        const { _count, ...state } = invoice;
        return state;
    }

    // QUEUED before publishing, never after: the worker can finish while we are
    // still here, and a later write would clobber its READY.
    let queued = await prisma.invoiceBill.update({
        where: { id: invoiceId },
        data: {
            pdfStatus: "QUEUED",
            pdfLeaseExpiresAt: null,
            // undefined leaves it alone, so the flag only ever turns on: a retry
            // that forgets to ask for email cannot cancel the original request.
            emailRequested: sendEmail || undefined,
        },
        select: INVOICE_STATE,
    });

    // If we crash between the write above and the publish below, the invoice says
    // QUEUED but no job exists. Nothing the user does fixes this: a retry is
    // refused, because we cannot tell "the publish never landed" from "a job is
    // queued and about to arrive", and guessing wrong would run it twice. The
    // sweeper picks it up after 10 minutes, when elapsed time makes it certain.
    //
    // This gap exists because no transaction can span Postgres and QStash.
    try {
        await qstashService.publishInvoicePdfJob({ invoiceId });
    } catch (err) {
        console.error("QStash publish failed:", err);

        // Nothing will pick this up. FAILED is re-queueable; QUEUED is not.
        queued = await prisma.invoiceBill.update({
            where: { id: invoiceId },
            data: { pdfStatus: "FAILED" },
            select: INVOICE_STATE,
        });
    }

    // CRASH POINT - response lost after publishing: the job still runs, and a
    // retry hits the guard above and no-ops.
    return queued;
}

// The one place at-most-once may be overridden - a human is asserting the mail
// never arrived. Nothing automatic re-sends.
async function resendInvoiceEmail(loggedInUser, id) {
    const invoiceId = BigInt(id);

    const invoice = await prisma.invoiceBill.findFirst({
        where: { id: invoiceId, orgId: BigInt(loggedInUser.orgId) },
        select: { ...INVOICE_STATE, clientEmail: true, client: { select: { email: true } } },
    });

    if (!invoice) {
        throw new Error("Invoice not found");
    }

    if (invoice.pdfStatus !== "READY") {
        throw new Error("The invoice PDF is not ready yet");
    }

    if (!clientForDisplay(invoice).email) {
        throw new Error("This client has no email address on file");
    }

    // Take the claim here rather than leaving it to the worker. PENDING means "a
    // send is underway", which is true from the moment the button is clicked, so
    // the caller gets an honest status straight away.
    //
    // This used to park the row at FAILED as a placeholder until the worker
    // claimed it a second later - which showed the user "Email sending failed"
    // for a send that was about to succeed.
    //
    // Conditional, so it doubles as the lock: two quick clicks, or a PDF job
    // already emailing, leave only one sender holding PENDING.
    const claimed = await prisma.invoiceBill.updateMany({
        where: { id: invoiceId, emailStatus: { not: "PENDING" } },
        data: { emailStatus: "PENDING", emailError: null, emailRequested: true },
    });

    if (claimed.count === 0) {
        // Someone else is already sending; a second job would risk two mails.
        return readInvoiceState(invoiceId);
    }

    try {
        // The email-only job, not the PDF one: process() starts by claiming the
        // PDF, and this invoice is already READY, so that job would be discarded
        // before it ever reached the sending code.
        await qstashService.publishInvoiceEmailJob({ invoiceId });
    } catch (err) {
        console.error("QStash publish failed (email retry):", err);

        // Nothing will pick the claim up, so hand it back rather than leaving the
        // invoice stuck on "Sending..." until the sweeper times it out.
        await prisma.invoiceBill.update({
            where: { id: invoiceId },
            data: { emailStatus: "FAILED", emailError: "Could not queue the email" },
        });

        throw new Error("Could not queue the email. Please try again.");
    }

    return readInvoiceState(invoiceId);
}

// Cheap enough to poll per row. getInvoice() loads items and custom fields.
async function getInvoiceStatus(loggedInUser, id) {
    const invoice = await prisma.invoiceBill.findFirst({
        where: { id: BigInt(id), orgId: BigInt(loggedInUser.orgId) },
        select: {
            id: true,
            status: true,
            pdfStatus: true,
            pdfKey: true,
            emailStatus: true,
            emailError: true,
            emailSentAt: true,
            emailRequested: true,
        },
    });

    if (!invoice) {
        throw new Error("Invoice not found");
    }

    let pdfUrl = null;
    if (invoice.pdfStatus === "READY" && invoice.pdfKey) {
        try {
            pdfUrl = await storage.getSignedUrl(invoice.pdfKey);
        } catch (error) {
            console.warn("Could not sign invoice PDF URL:", error.message);
        }
    }

    return {
        id: invoice.id.toString(),
        status: invoice.status,
        pdfStatus: invoice.pdfStatus,
        emailStatus: invoice.emailStatus,
        emailError: invoice.emailError,
        emailSentAt: invoice.emailSentAt,
        emailRequested: invoice.emailRequested,
        pdfUrl,
        // Both lifecycles settled - stop polling.
        //
        // NOT_REQUESTED is only terminal when no email was asked for. When one
        // was, it means the worker has not claimed the send yet - the client
        // must keep polling or it never learns the mail went out.
        settled:
            ["READY", "FAILED"].includes(invoice.pdfStatus) &&
            (invoice.emailRequested
                ? ["SENT", "FAILED"].includes(invoice.emailStatus)
                : ["NOT_REQUESTED", "SENT", "FAILED"].includes(invoice.emailStatus)),
    };
}

// Separate from updateInvoice(): marking PAID is a different intent from editing.
// Copies an invoice's contents into a fresh draft. Everything about the
// original's lifecycle is left behind - number, PDF, email, payments - so the
// copy starts as if it had just been filled in by hand.
async function cloneInvoiceAsDraft(loggedInUser, id, { idempotencyKey }) {
    const orgId = BigInt(loggedInUser.orgId);

    // Same guard as createInvoice: a retry of one clone must not make a second.
    const prior = await prisma.invoiceBill.findUnique({
        where: { orgId_idempotencyKey: { orgId, idempotencyKey } },
        select: INVOICE_STATE,
    });

    if (prior) {
        return prior;
    }

    const source = await prisma.invoiceBill.findFirst({
        where: { id: BigInt(id), orgId },
        include: { items: true, customFields: true },
    });

    if (!source) {
        throw new Error("Invoice not found");
    }

    // Everything named here belongs to the original and must not be copied;
    // whatever remains in `content` is the invoice's actual contents. Listing the
    // exclusions rather than the inclusions means a column added later is copied
    // by default, which is the safer way round for a clone.
    const {
        id: _id,
        invoiceNumber: _invoiceNumber,
        idempotencyKey: _idempotencyKey,
        status: _status,
        pdfStatus: _pdfStatus,
        pdfKey: _pdfKey,
        pdfLeaseExpiresAt: _pdfLeaseExpiresAt,
        pdfAttempts: _pdfAttempts,
        emailStatus: _emailStatus,
        emailSentAt: _emailSentAt,
        emailError: _emailError,
        confirmedAt: _confirmedAt,
        sentAt: _sentAt,
        paidAt: _paidAt,
        paidAmount: _paidAmount,
        balanceDue: _balanceDue,
        createdAt: _createdAt,
        updatedAt: _updatedAt,
        createdById: _createdById,
        updatedById: _updatedById,
        items,
        customFields,
        ...content
    } = source;

    return prisma.$transaction(async (tx) => {
        const clone = await tx.invoiceBill.create({
            data: {
                ...content,
                createdById: BigInt(loggedInUser.userId),
                invoiceNumber: generateInvoiceNumber(loggedInUser),
                idempotencyKey,
                status: "DRAFT",
                pdfStatus: "NOT_STARTED",
                // A copy owes its full amount, however much the original was paid.
                paidAmount: 0,
                balanceDue: source.totalAmount,
                items: {
                    create: items.map((item) => ({
                        itemName: item.itemName,
                        description: item.description,
                        quantity: item.quantity,
                        unitType: item.unitType,
                        unitPrice: item.unitPrice,
                        taxRate: item.taxRate,
                        totalPrice: item.totalPrice,
                    })),
                },
            },
            select: INVOICE_STATE,
        });

        if (customFields.length) {
            await tx.invoiceCustomFieldValue.createMany({
                data: customFields.map((cf) => ({
                    invoiceId: clone.id,
                    customFieldId: cf.customFieldId,
                    orgId,
                    value: cf.value,
                })),
            });
        }

        return clone;
    });
}

async function setPaymentStatus(user, id, status) {
    const invoiceId = BigInt(id);

    const existing = await prisma.invoiceBill.findFirst({
        where: { id: invoiceId, orgId: BigInt(user.orgId) },
        select: { id: true },
    });

    if (!existing) {
        throw new Error("Invoice not found");
    }

    return prisma.invoiceBill.update({
        where: { id: invoiceId },
        data: {
            status,
            paidAt: status === "PAID" ? new Date() : null,
            updatedById: BigInt(user.userId),
        },
        select: INVOICE_STATE,
    });
}

async function updateInvoice(user, id, data) {
    return await prisma.$transaction(async (tx) => {
        const invoiceId = BigInt(id);

        // --------------------------------------------------
        // 1️⃣ Fetch Existing Invoice
        // --------------------------------------------------
        const existingInvoice = await tx.invoiceBill.findFirst({
            where: {
                id: invoiceId,
                orgId: BigInt(user.orgId),
            },
            include: { items: true },
        });

        if (!existingInvoice) {
            throw new Error("Invoice not found");
        }

        // Only drafts are editable. Once the PDF exists the invoice is issued and
        // may be with the client. A failed render stays DRAFT so it can be fixed.
        if (existingInvoice.status !== "DRAFT") {
            throw new Error("Only draft invoices can be edited");
        }

        // Lease fencing would handle the race, but a silently restarted PDF is
        // confusing - refuse instead.
        if (["QUEUED", "PROCESSING"].includes(existingInvoice.pdfStatus)) {
            throw new Error("This invoice is being generated - try again in a moment");
        }

        const updateData = {};

        // 2️⃣ Attach the client. Attaching only - creating or rewriting one
        // belongs to the clients module.

        if (data.clientId !== undefined) {
            updateData.clientId = data.clientId === null ? null : BigInt(data.clientId);

            // Re-snapshot alongside the pointer. Only when clientId is sent: an
            // edit that does not mention the client must not refresh the billing
            // details from a client record that has changed since.
            const client = await loadClientForSnapshot(tx, user.orgId, data.clientId);
            Object.assign(updateData, buildClientSnapshot(client));
        }

        // --------------------------------------------------
        // 3️⃣ Map All Direct Invoice Fields
        // --------------------------------------------------

        // "status" is absent deliberately - it belongs to setPaymentStatus() and
        // finalizeInvoice(). An edit must not be able to mark an invoice PAID.
        const directFields = [
            "invoiceNumber",
            "invoiceType",
            "paymentTerms",
            "category",
            "currency",
            "baseCurrency",
            "taxType",
            "placeOfSupply",
            "reverseCharge",
            "reverseReason",
            "sacCode",
            "taxSummary",
            "countryOfOrigin",
            "countryOfDestination",
            "incoterms",
            "bankDetails",
            "paymentLink",
            "bankAddress",
            "jurisdiction",
            "lateFeePolicy",
            "notes",
        ];

        directFields.forEach((field) => {
            if (data[field] !== undefined) {
                updateData[field] = data[field];
            }
        });

        if (data.issueDate)
            updateData.issueDate = new Date(data.issueDate);

        if (data.dueDate)
            updateData.dueDate = new Date(data.dueDate);

        // --------------------------------------------------
        // 4️⃣ Seller Snapshot Fields
        // --------------------------------------------------

        if (data.seller) {
            const sellerMap = {
                name: "sellerName",
                email: "sellerEmail",
                phone: "sellerPhone",
                streetAddress: "sellerStreetAddress",
                city: "sellerCity",
                state: "sellerState",
                zipCode: "sellerZipCode",
                country: "sellerCountry",
                taxId: "sellerTaxId",
                iecCode: "iecCode",
                lutFiled: "lutFiled",
            };

            Object.entries(sellerMap).forEach(([inputKey, dbKey]) => {
                if (data.seller[inputKey] !== undefined) {
                    updateData[dbKey] = data.seller[inputKey];
                }
            });
        }

        // --------------------------------------------------
        // 5️⃣ Shipping Fields
        // --------------------------------------------------

        if (data.shipTo) {
            if (data.shipTo.name !== undefined)
                updateData.shipToName = data.shipTo.name;

            if (data.shipTo.address !== undefined)
                updateData.shipToAddress = data.shipTo.address;
        }

        // --------------------------------------------------
        // 6️⃣ Handle Items
        // --------------------------------------------------

        let items = existingInvoice.items;

        if (Array.isArray(data.items)) {
            items = data.items;

            updateData.items = {
                deleteMany: {},
                create: data.items.map((item) => ({
                    itemName: item.name,
                    description: item.description,
                    quantity: item.quantity ?? 1,
                    unitType: item.unitType ?? "UNIT",
                    unitPrice: item.unitPrice ?? 0,
                    taxRate: item.taxRate ?? 0,
                    totalPrice:
                        item.itemTotal ??
                        (item.quantity ?? 1) * (item.unitPrice ?? 0),
                })),
            };
        }

        // --------------------------------------------------
        // 7️⃣ Smart Recalculation
        // --------------------------------------------------

        const shouldRecalculate =
            data.items ||
            data.discount !== undefined ||
            data.shippingCost !== undefined ||
            data.paidAmount !== undefined ||
            data.exchangeRate !== undefined;

        if (shouldRecalculate) {
            // Every value here is coerced: the fallbacks come straight from the
            // database as Prisma Decimals, and one of those on the right of a +
            // concatenates instead of adding.
            const subtotal = items.reduce(
                (sum, i) => sum + toNumber(i.quantity, 1) * toNumber(i.unitPrice),
                0
            );

            const taxAmount = items.reduce(
                (sum, i) =>
                    sum +
                    (toNumber(i.quantity, 1) *
                        toNumber(i.unitPrice) *
                        toNumber(i.taxRate)) /
                    100,
                0
            );

            const discount = toNumber(data.discount ?? existingInvoice.discount);

            const shippingCost = toNumber(
                data.shippingCost ?? existingInvoice.shippingCost
            );

            const paidAmount = toNumber(
                data.paidAmount ?? existingInvoice.paidAmount
            );

            const exchangeRate = toNumber(
                data.exchangeRate ?? existingInvoice.exchangeRate,
                1
            );

            const totalAmount =
                subtotal - discount + taxAmount + shippingCost;

            const balanceDue = totalAmount - paidAmount;
            const baseAmount = totalAmount * exchangeRate;

            Object.assign(updateData, {
                subtotal,
                taxAmount,
                discount,
                shippingCost,
                totalAmount,
                paidAmount,
                balanceDue,
                exchangeRate,
                baseAmount,
                // Recalculated with the rest. Left out, it kept whatever create
                // stored - zero for a draft saved before any items existed - and
                // the PDF then printed "Tax (0%)" over a real tax amount.
                effectiveTax: subtotal
                    ? Number(((taxAmount / subtotal) * 100).toFixed(2))
                    : 0,
            });
        }

        updateData.updatedAt = new Date();
        updateData.updatedById = BigInt(user.userId);

        // --------------------------------------------------
        // 8️⃣ Final Update
        // --------------------------------------------------

        const updatedInvoice = await tx.invoiceBill.update({
            where: { id: invoiceId },
            data: updateData,
            include: {
                items: true,
                customFields: {
                    include: {
                        customField: true,
                    },
                },
            },
        });

        if (data.customFields !== undefined) {
            await tx.invoiceCustomFieldValue.deleteMany({
                where: { invoiceId },
            });
            await saveInvoiceCustomFields(tx, user.orgId, invoiceId, data.customFields);
        }

        if (data.customFields !== undefined) {
            return tx.invoiceBill.findFirstOrThrow({
                where: { id: invoiceId },
                include: {
                    items: true,
                    customFields: {
                        include: {
                            customField: true,
                        },
                    },
                },
            });
        }

        return updatedInvoice;
    });
}

async function getInvoice(user, id) {
    const invoice = await prisma.invoiceBill.findFirstOrThrow({
        where: { id: BigInt(id), orgId: user.orgId },
        include: {
            items: true,
            customFields: {
                include: {
                    customField: true,
                },
            },
        }
    });
    await markOverdueInvoices(invoice);
    return {
        ...invoice,
        // Built from the columns on the invoice, not the relation - which this
        // query never loaded, and which is null once the client is deleted.
        client: clientForDisplay(invoice),
        // definitionId is what the dialog matches its checkboxes on. Without it
        // a saved field renders unticked, the user ticks it again, and the
        // invoice ends up with the same field twice.
        customFields: (invoice.customFields ?? []).map(cf => ({
            definitionId: cf.customFieldId.toString(),
            name: cf.customField.name,
            value: cf.value
        }))
    };
};

async function getSignedPdfUrl(user, id) {
    const invoice = await prisma.invoiceBill.findFirst({
        where: {
            id: BigInt(id),
            orgId: user.orgId
        }
    });

    if (!invoice) {
        return {
            success: false,
            status: 'INVOICE_NOT_FOUND',
            message: 'Invoice not found'
        };
    }

    if (invoice.pdfStatus === 'NOT_STARTED') {
        return {
            success: false,
            status: 'NOT_STARTED',
            message: 'PDF generation not started yet'
        };
    }

    if (invoice.pdfStatus === 'QUEUED') {
        return {
            success: false,
            status: 'QUEUED',
            message: 'PDF is queued for processing'
        };
    }

    if (invoice.pdfStatus === 'PROCESSING') {
        return {
            success: false,
            status: 'PROCESSING',
            message: 'PDF is currently being generated'
        };
    }

    if (invoice.pdfStatus === 'FAILED') {
        return {
            success: false,
            status: 'FAILED',
            message: 'PDF generation failed'
        };
    }

    if (!invoice.pdfKey) {
        return {
            success: false,
            status: 'NOT_GENERATED',
            message: 'PDF not generated'
        };
    }

    const storage = require('../../storage/storage.service');
    const url = await storage.getSignedUrl(invoice.pdfKey);
    return {
        success: true,
        status: 'READY',
        url
    };
}

const PDF_TERMINAL_STATUSES = new Set(['READY', 'FAILED']);
const STREAM_POLL_MS = 2000;
// Closed rather than left hanging if the PDF never settles.
const STREAM_MAX_MS = 5 * 60 * 1000;

// SSE stream of pdfStatus. Polls the database itself rather than waiting to be
// notified, so it is stateless - a process-local Map broke as soon as a second
// instance existed, since the stream and the webhook could land on different ones.
async function openStream({ req, res, orgId, invoiceId }) {
    res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        // Stops nginx buffering the stream into uselessness.
        'X-Accel-Buffering': 'no'
    });
    // Starts the response without ending it.
    res.flushHeaders();

    let closed = false;
    req.on('close', () => { closed = true; });

    const startedAt = Date.now();
    let lastStatus = null;

    while (!closed) {
        const invoice = await prisma.invoiceBill.findFirst({
            where: { id: BigInt(invoiceId), orgId: BigInt(orgId) },
            select: { pdfStatus: true }
        });

        if (!invoice) {
            res.write(`event: error\ndata: ${JSON.stringify({ message: 'Invoice not found' })}\n\n`);
            break;
        }

        // First pass emits before any wait, so a PDF that finished before the
        // connection opened is not missed.
        if (invoice.pdfStatus !== lastStatus) {
            lastStatus = invoice.pdfStatus;
            res.write(`data: ${JSON.stringify({ status: invoice.pdfStatus })}\n\n`);
        }

        if (PDF_TERMINAL_STATUSES.has(invoice.pdfStatus)) break;

        if (Date.now() - startedAt > STREAM_MAX_MS) {
            res.write(`event: timeout\ndata: ${JSON.stringify({ status: invoice.pdfStatus })}\n\n`);
            break;
        }

        // Keep-alive for proxies that cull idle connections.
        res.write(': ping\n\n');
        await new Promise((r) => setTimeout(r, STREAM_POLL_MS));
    }

    if (!closed) res.end();
};

async function deleteInvoice(user, id) {
    const invoice = await prisma.invoiceBill.findFirst({
        where: { id: BigInt(id), orgId: user.orgId }
    });

    if (!invoice) {
        throw new Error('Invoice not found');
    }

    if (invoice.pdfKey) {
        try {
            await storage.remove(invoice.pdfKey);
        } catch (err) {
            console.error("Failed to delete file:", err.message);
        }
    }

    // Delete invoice items first (due to foreign key constraint)
    await prisma.invoiceBillItem.deleteMany({
        where: { invoiceId: BigInt(id) }
    });

    // Delete the invoice
    const deletedInvoice = await prisma.invoiceBill.delete({
        where: { id: BigInt(id) }
    });

    return {
        success: true,
        message: 'Invoice deleted successfully',
        id: deletedInvoice.id
    };
}

async function exportInvoices(
    user,
    startDate,
    endDate,
    format,
    includeItems
) {
    const where = {
        orgId: BigInt(user.orgId),
    };

    if (startDate || endDate) {
        where.issueDate = {};

        if (startDate) {
            where.issueDate.gte = new Date(startDate);
        }

        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            where.issueDate.lte = end;
        }
    }
    const invoices = await prisma.invoiceBill.findMany({
        where,
        include: {
            items: includeItems,
        },
        orderBy: {
            createdAt: "desc",
        },
    });

    let rows = [];

    invoices.forEach(inv => {

        const baseData = {
            invoiceId: inv.id.toString(),
            invoiceNumber: inv.invoiceNumber,
            issueDate: inv.issueDate,
            dueDate: inv.dueDate,
            status: inv.status,
            category: inv.category,

            currency: inv.currency,
            totalAmount: inv.totalAmount,
            taxAmount: inv.taxAmount,
            discount: inv.discount,
            shippingCost: inv.shippingCost,

            paidAmount: inv.paidAmount,
            balanceDue: inv.balanceDue,

            sellerName: inv.sellerName,
            sellerEmail: inv.sellerEmail,

            placeOfSupply: inv.placeOfSupply,
            taxType: inv.taxType,
        };

        // WITH ITEMS (flattened)
        if (includeItems && inv.items?.length) {

            inv.items.forEach(item => {
                rows.push({
                    ...baseData,

                    itemName: item.itemName,
                    description: item.description,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    taxRate: item.taxRate,
                    totalPrice: item.totalPrice,
                    unitType: item.unitType,
                });
            });

        } else {
            // WITHOUT ITEMS
            rows.push(baseData);
        }
    });
    if (format === "csv") {
        const parser = new Parser();
        return parser.parse(rows);
    }
    if (format === "excel") {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Invoices");

        const headers = Object.keys(rows[0] || {});

        sheet.columns = headers.map(h => ({
            header: h,
            key: h,
            width: 20,
        }));

        rows.forEach(r => sheet.addRow(r));

        return await workbook.xlsx.writeBuffer();
    }

    throw new Error("Invalid format");
};

module.exports = {
    saveInvoiceFromPreview,
    listInvoices,
    listInvoiceProducts,
    previewInvoiceAI,
    createInvoice,
    cloneInvoiceAsDraft,
    finalizeInvoice,
    resendInvoiceEmail,
    getInvoiceStatus,
    setPaymentStatus,
    getInvoice,
    getSignedPdfUrl,
    openStream,
    updateInvoice,
    deleteInvoice,
    exportInvoices
};
