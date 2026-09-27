const prisma = require('../../config/database');
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


        const subtotal = payload.subtotal ?? 0;
        const discount = payload.discount ?? 0;
        const taxAmount = payload.taxAmount ?? 0;
        const shippingCost = payload.shippingCost ?? 0;

        const totalAmount =
            payload.totalAmount ??
            (subtotal - discount + taxAmount + shippingCost);

        const paidAmount = payload.paidAmount ?? 0;
        const balanceDue = totalAmount - paidAmount;

        const exchangeRate = payload.exchangeRate ?? 1;
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

async function listInvoices(user, page = 1, limit = 10, startDate, endDate) {
    page = Number(page);
    limit = Number(limit);

    if (Number.isNaN(page) || page < 1) page = 1;
    if (Number.isNaN(limit) || limit < 1) limit = 10;

    const offset = (page - 1) * limit;

    // Build dynamic where condition
    const where = {
        orgId: BigInt(user.orgId),
    };
    // Add date filter only if provided
    if (startDate || endDate) {
        where.issueDate = {};

        if (startDate) {
            where.issueDate.gte = new Date(startDate);
        }

        if (endDate) {
            // Optional: make endDate inclusive for whole day
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            where.issueDate.lte = end;
        }
    }
    const invoices = await prisma.invoiceBill.findMany({
        where,
        include: {
            items: true,
            customFields: {
                include: {
                    customField: true,
                },
            },
        },
        orderBy: {
            createdAt: 'desc',
        },
        take: limit,
        skip: offset,
    });

    return markOverdueInvoices(invoices);
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

function generateInvoiceNumber(user) {
    const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    return `INV-${user.userId}-${suffix.toUpperCase()}`;
}

function computeTotals(data) {
    const items = data.items ?? [];

    const subtotal = items.reduce(
        (s, i) => s + (i.quantity ?? 1) * (i.unitPrice ?? 0),
        0
    );

    const taxAmount = items.reduce(
        (s, i) => s + ((i.quantity ?? 1) * (i.unitPrice ?? 0) * (i.taxRate ?? 0)) / 100,
        0
    );

    const discount = data.discount ?? 0;
    const shippingCost = data.shippingCost ?? 0;
    const paidAmount = data.paidAmount ?? 0;
    const exchangeRate = data.exchangeRate ?? 1;
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

// Creates only - never issues. finalizeInvoice() is a separate request made once
// the client holds the id. idempotencyKey covers the gap before that: the unique
// index on (orgId, idempotencyKey) resolves a retry to the row it already made.
async function createInvoice(loggedInUser, data, { idempotencyKey }) {
    const orgId = BigInt(loggedInUser.orgId);
    const totals = computeTotals(data);
    const fields = buildInvoiceFields(loggedInUser, data, totals);

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
        select: INVOICE_STATE,
    });

    if (!invoice) {
        throw new Error("Invoice not found");
    }

    // A job already in flight or finished is left alone - no stacked jobs.
    if (!REQUEUEABLE_PDF_STATUSES.has(invoice.pdfStatus)) {
        return invoice;
    }

    // QUEUED before publishing, never after: the worker can finish while we are
    // still here, and a later write would clobber its READY.
    let queued = await prisma.invoiceBill.update({
        where: { id: invoiceId },
        data: { pdfStatus: "QUEUED", pdfLeaseExpiresAt: null },
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
        await qstashService.publishInvoicePdfJob({ invoiceId, sendEmail });
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
        select: { ...INVOICE_STATE, client: { select: { email: true } } },
    });

    if (!invoice) {
        throw new Error("Invoice not found");
    }

    if (invoice.pdfStatus !== "READY") {
        throw new Error("The invoice PDF is not ready yet");
    }

    if (!invoice.client?.email) {
        throw new Error("This client has no email address on file");
    }

    if (invoice.emailStatus === "PENDING") {
        // Already in flight; queueing another risks two mails.
        return invoice;
    }

    // FAILED, not PENDING: the worker claims by moving FAILED -> PENDING, so
    // every sender takes the same claim path.
    const reset = await prisma.invoiceBill.update({
        where: { id: invoiceId },
        data: { emailStatus: "FAILED", emailError: null },
        select: INVOICE_STATE,
    });

    try {
        // The email-only job, not the PDF one: process() starts by claiming the
        // PDF, and this invoice is already READY, so that job would be discarded
        // before it ever reached the sending code.
        await qstashService.publishInvoiceEmailJob({ invoiceId });
    } catch (err) {
        console.error("QStash publish failed (email retry):", err);
        throw new Error("Could not queue the email. Please try again.");
    }

    return reset;
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
        pdfUrl,
        // Both lifecycles settled - stop polling.
        settled:
            ["READY", "FAILED"].includes(invoice.pdfStatus) &&
            ["NOT_REQUESTED", "SENT", "FAILED"].includes(invoice.emailStatus),
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
            const subtotal = items.reduce(
                (sum, i) => sum + (i.quantity ?? 1) * (i.unitPrice ?? 0),
                0
            );

            const taxAmount = items.reduce(
                (sum, i) =>
                    sum +
                    ((i.quantity ?? 1) *
                        (i.unitPrice ?? 0) *
                        (i.taxRate ?? 0)) /
                    100,
                0
            );

            const discount =
                data.discount ?? existingInvoice.discount ?? 0;

            const shippingCost =
                data.shippingCost ??
                existingInvoice.shippingCost ??
                0;

            const paidAmount =
                data.paidAmount ??
                existingInvoice.paidAmount ??
                0;

            const exchangeRate =
                data.exchangeRate ??
                existingInvoice.exchangeRate ??
                1;

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
