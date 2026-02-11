const prisma = require('../../config/database');
const ocrService = require('../../services/ocr.service');
const aiService = require('../ai/ai.service');
const invoiceQueue = require('../../queues/invoice.queue');
const qstashService = require("../../queues/invoice.qstash");
const { is } = require('zod/locales');

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
                        userId: BigInt(user.userId),
                        name: payload.buyer.name,
                        email: payload.buyer.email,
                        phone: payload.buyer.phone,
                        streetAddress: payload.buyer.address?.street,
                        city: payload.buyer.address?.city,
                        state: payload.buyer.address?.state,
                        zipCode: payload.buyer.address?.zipCode,
                        country: payload.buyer.address?.country,
                        companyType: payload.buyer.companyType,
                        gstin: payload.buyer.gstin,
                        taxId: payload.buyer.taxId,
                        taxSystem: payload.buyer.taxSystem ?? "NONE",
                        isActive: true,
                    },
                })
                : null;

        // 1️⃣ Create invoice
        const invoice = await tx.invoiceBill.create({
            data: {
                orgId: BigInt(user.orgId),
                customerId: BigInt(user.userId),
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

        return invoice;
    });
}

async function listInvoices(user, page = 1, limit = 10) {
    page = Number(page);
    limit = Number(limit);

    if (Number.isNaN(page) || page < 1) page = 1;
    if (Number.isNaN(limit) || limit < 1) limit = 10;

    const offset = (page - 1) * limit;
    return prisma.invoiceBill.findMany({
        where: {
            customerId: BigInt(user.userId),
        },
        include: {
            items: true,
        },
        orderBy: {
            createdAt: 'desc',
        },
        take: limit,
        skip: offset,
    });
}

async function listInvoiceProducts(invoiceId, page=1, limit=10) {
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

async function confirmAndCreateInvoice(user, data) {
    const isDraft = data.status === 'DRAFT';
    const invoiceId = data.id;
    // 1️⃣ Calculate totals safely
    const subtotal = data.items.reduce(
        (s, i) => s + (i.quantity ?? 1) * (i.unitPrice ?? 0),
        0
    );

    const taxAmount = data.items.reduce(
        (s, i) =>
            s +
            ((i.quantity ?? 1) *
                (i.unitPrice ?? 0) *
                (i.taxRate ?? 0)) /
            100,
        0
    );
    const effectiveTax = subtotal ? Number(((taxAmount / subtotal) * 100).toFixed(2)) : 0;

    const discount = data.discount ?? 0;
    const shippingCost = data.shippingCost ?? 0;

    const totalAmount =
        subtotal - discount + taxAmount + shippingCost;

    const paidAmount = data.paidAmount ?? 0;
    const balanceDue = totalAmount - paidAmount;

    const exchangeRate = data.exchangeRate ?? 1;
    const baseAmount = totalAmount * exchangeRate;

    if (invoiceId) {
        const existing = await prisma.invoiceBill.findFirst({
            where: {
                id: BigInt(invoiceId),
                orgId: BigInt(user.orgId),
            },
        });
        // console.log('Existing invoice:', existing);
        if (!existing) {
            throw new Error("Invoice not found");
        }

        const updated = await prisma.invoiceBill.update({
            where: { id: BigInt(invoiceId) },
            data: {
                // Amounts
                subtotal,
                discount,
                taxAmount,
                shippingCost,
                totalAmount,
                paidAmount,
                balanceDue,
                effectiveTax,

                // Status logic
                status: data.status,
                pdfStatus:
                    !isDraft && existing.pdfStatus === "NOT_STARTED"
                        ? "QUEUED"
                        : existing.pdfStatus,

                confirmedAt: !isDraft && !existing.confirmedAt
                    ? new Date()
                    : existing.confirmedAt,

                sentAt: !isDraft && !existing.sentAt
                    ? new Date()
                    : existing.sentAt,

                // Update everything else as usual
                notes: data.notes,
                paymentTerms: data.paymentTerms,
                taxSummary: data.taxSummary,
                bankDetails: data.bankDetails,

                // Replace items safely
                items: {
                    deleteMany: {},
                    create: (data.items ?? []).map((item) => ({
                        itemName: item.name,
                        description: item.description,
                        quantity: item.quantity ?? 1,
                        unitType: item.unitType ?? "UNIT",
                        unitPrice: item.unitPrice ?? 0,
                        taxRate: item.taxRate ?? 0,
                        // totalPrice:
                        //     (item.quantity ?? 1) *
                        //     (item.unitPrice ?? 0) +
                        //     ((item.quantity ?? 1) *
                        //         (item.unitPrice ?? 0) *
                        //         (item.taxRate ?? 0)) / 100,
                        "totalPrice": item.itemTotal ?? 0,
                    })),
                },
            },
            include: { items: true },
        });

        // 3️⃣ Queue PDF only once
        if (!isDraft && existing.pdfStatus === "NOT_STARTED") {
            await qstashService.publishInvoicePdfJob({
                invoiceId: updated.id,
            });
        }

        return updated;
    }

    // 2️⃣ Create CONFIRMED + SENT invoice
    const invoice = await prisma.invoiceBill.create({
        data: {
            // 🔑 Core relations
            orgId: BigInt(user.orgId),
            customerId: BigInt(user.userId),
            clientId: data.clientId ? BigInt(data.clientId) : null,

            // 📄 Invoice identity
            invoiceNumber:
                data.invoiceNumber ??
                `INV-${user.userId}-${(
                    Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
                ).toUpperCase()}`,
            invoiceType: data.invoiceType ?? "TAX",

            issueDate: data.issueDate ? new Date(data.issueDate) : new Date(),
            dueDate: data.dueDate ? new Date(data.dueDate) : new Date(),
            paymentTerms: data.paymentTerms ?? "Due on receipt",

            // 💱 Currency
            currency: data.currency ?? "USD",
            exchangeRate,
            baseCurrency: data.baseCurrency ?? "INR",
            baseAmount,

            // 💰 Amounts
            subtotal,
            discount,
            taxAmount,
            shippingCost,
            totalAmount,
            paidAmount,
            balanceDue,
            effectiveTax,

            // 📌 Status
            status: data.status ?? "UNPAID",
            confirmedAt: new Date(),
            sentAt: new Date(),
            pdfStatus: isDraft ? "NOT_STARTED" : "QUEUED",
            category: data.category ?? "OTHER",

            // 🧾 Seller snapshot
            sellerName: data.seller?.name,
            sellerEmail: data.seller?.email,
            sellerPhone: data.seller?.phone,
            sellerStreetAddress: data.seller?.streetAddress,
            sellerCity: data.seller?.city,
            sellerState: data.seller?.state,
            sellerZipCode: data.seller?.zipCode,
            sellerCountry: data.seller?.country,
            sellerTaxId: data.seller?.taxId,
            iecCode: data.seller?.iecCode,
            lutFiled: data.seller?.lutFiled ?? false,

            // 🧮 Tax & compliance
            taxType: data.taxType ?? "NONE",
            placeOfSupply: data.placeOfSupply,
            reverseCharge: data.reverseCharge ?? false,
            reverseReason: data.reverseReason,
            sacCode: data.sacCode,
            taxSummary: data.taxSummary,

            // 🚚 Shipping / trade
            shipToName: data.shipTo?.name,
            shipToAddress: data.shipTo?.address,
            countryOfOrigin: data.countryOfOrigin,
            countryOfDestination: data.countryOfDestination,
            incoterms: data.incoterms,

            // 💳 Payment
            bankDetails: data.bankDetails,
            paymentLink: data.paymentLink,
            bankAddress: data.bankAddress,

            // ⚖️ Legal
            jurisdiction: data.jurisdiction,
            lateFeePolicy: data.lateFeePolicy,
            notes: data.notes,

            // 📦 Items (EXPLICIT mapping)
            items: {
                create: data.items.map((item) => ({
                    itemName: item.name,
                    description: item.description,
                    quantity: item.quantity ?? 1,
                    unitType: item.unitType ?? "UNIT",
                    unitPrice: item.unitPrice ?? 0,
                    taxRate: item.taxRate ?? 0,
                    // totalPrice:
                    //     (item.quantity ?? 1) *
                    //     (item.unitPrice ?? 0) +
                    //     ((item.quantity ?? 1) *
                    //         (item.unitPrice ?? 0) *
                    //         (item.taxRate ?? 0)) /
                    //     100,
                    "totalPrice": item.itemTotal ?? 0,
                })),
            },
        },
        include: { items: true },
    });
    console.log('Created invoice with ID:', invoice.id);

    // 3️⃣ Queue PDF generation
    // await invoiceQueue.enqueue({ invoiceId: invoice.id });

    // 3️⃣ Trigger PDF generation (async, reliable)
    // await qstashService.publishInvoicePdfJob({
    //     invoiceId: invoice.id,
    // });
    if (!isDraft) {
        await qstashService.publishInvoicePdfJob({
            invoiceId: invoice.id,
        });
    }

    return invoice;
}

async function updateInvoice(user, id, data) {
    try {
        // 1️⃣ Calculate totals (same logic as create)
        const subtotal = (data.items ?? []).reduce(
            (s, i) => s + (i.quantity ?? 1) * (i.unitPrice ?? 0),
            0
        );

        const taxAmount = (data.items ?? []).reduce(
            (s, i) =>
                s +
                ((i.quantity ?? 1) *
                    (i.unitPrice ?? 0) *
                    (i.taxRate ?? 0)) /
                100,
            0
        );

        const effectiveTax = subtotal
            ? Number(((taxAmount / subtotal) * 100).toFixed(2))
            : 0;

        const discount = data.discount ?? 0;
        const shippingCost = data.shippingCost ?? 0;

        const totalAmount =
            subtotal - discount + taxAmount + shippingCost;

        const paidAmount = data.paidAmount ?? 0;
        const balanceDue = totalAmount - paidAmount;

        const exchangeRate = data.exchangeRate ?? 1;
        const baseAmount = totalAmount * exchangeRate;

        // 2️⃣ Update invoice with recalculated values
        const invoice = await prisma.invoiceBill.update({
            where: {
                id: BigInt(id),
                orgId: BigInt(user.orgId),
            },
            data: {
                clientId: data.clientId
                    ? BigInt(data.clientId)
                    : undefined,

                invoiceNumber: data.invoiceNumber,
                invoiceType: data.invoiceType,

                issueDate: data.issueDate
                    ? new Date(data.issueDate)
                    : undefined,
                dueDate: data.dueDate
                    ? new Date(data.dueDate)
                    : undefined,
                paymentTerms: data.paymentTerms,

                currency: data.currency,
                exchangeRate,
                baseCurrency: data.baseCurrency,
                baseAmount,

                subtotal,
                discount,
                taxAmount,
                shippingCost,
                totalAmount,
                paidAmount,
                balanceDue,
                effectiveTax,

                status: data.status,
                category: data.category,

                // Seller snapshot
                sellerName: data.seller?.name,
                sellerEmail: data.seller?.email,
                sellerPhone: data.seller?.phone,
                sellerStreetAddress: data.seller?.streetAddress,
                sellerCity: data.seller?.city,
                sellerState: data.seller?.state,
                sellerZipCode: data.seller?.zipCode,
                sellerCountry: data.seller?.country,
                sellerTaxId: data.seller?.taxId,
                iecCode: data.seller?.iecCode,
                lutFiled: data.seller?.lutFiled,

                // Tax & compliance
                taxType: data.taxType,
                placeOfSupply: data.placeOfSupply,
                reverseCharge: data.reverseCharge,
                reverseReason: data.reverseReason,
                sacCode: data.sacCode,
                taxSummary: data.taxSummary,

                // Shipping
                shipToName: data.shipTo?.name,
                shipToAddress: data.shipTo?.address,
                countryOfOrigin: data.countryOfOrigin,
                countryOfDestination: data.countryOfDestination,
                incoterms: data.incoterms,

                // Payment
                bankDetails: data.bankDetails,
                paymentLink: data.paymentLink,
                bankAddress: data.bankAddress,

                // Legal
                jurisdiction: data.jurisdiction,
                lateFeePolicy: data.lateFeePolicy,
                notes: data.notes,

                updatedAt: new Date(),

                // 🔥 Replace items safely
                items: data.items
                    ? {
                        deleteMany: {},
                        create: data.items.map((item) => ({
                            itemName: item.name,
                            description: item.description,
                            quantity: item.quantity ?? 1,
                            unitType: item.unitType ?? "UNIT",
                            unitPrice: item.unitPrice ?? 0,
                            taxRate: item.taxRate ?? 0,
                            // totalPrice:
                            //     (item.quantity ?? 1) *
                            //     (item.unitPrice ?? 0) +
                            //     ((item.quantity ?? 1) *
                            //         (item.unitPrice ?? 0) *
                            //         (item.taxRate ?? 0)) /
                            //     100,
                            "totalPrice": item.itemTotal ?? 0,

                        })),
                    }
                    : undefined,
            },
            include: { items: true },
        });

        return invoice;
    } catch (err) {
        console.error("Update invoice failed:", err);
        throw err;
    }
}


async function getInvoice(user, id) {
    return prisma.invoiceBill.findFirstOrThrow({
        where: { id: BigInt(id), orgId: user.orgId },
        include: { items: true }
    });
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

const clients = new Map();
// key: `${userId}:${invoiceId}` → res

async function openStream({ req, res, userId, invoiceId }) {
    const key = `${userId}:${invoiceId}`;

    res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });
    //Calling res.flushHeaders() initiates the response but does not signal the end of the data transfer. You can continue to use res.write() to send data chunks. The connection stays open until res.end() is called.
    res.flushHeaders();

    clients.set(key, res);

    req.on('close', () => {
        clients.delete(key);
    });
};

async function pushPdfReady({ userId, invoiceId, signedUrl }) {
    const key = `${userId}:${invoiceId}`;
    const client = clients.get(key);

    if (!client) return;

    client.write(`event: pdf-ready\n`);
    client.write(
        `data: ${JSON.stringify({ status: 'READY', signedUrl })}\n\n`
    );

    client.end();
    clients.delete(key);
};

async function deleteInvoice(user, id) {
    const invoice = await prisma.invoiceBill.findFirst({
        where: { id: BigInt(id), orgId: user.orgId }
    });

    if (!invoice) {
        throw new Error('Invoice not found');
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

module.exports = {
    saveInvoiceFromPreview,
    listInvoices,
    listInvoiceProducts,
    previewInvoiceAI,
    confirmAndCreateInvoice,
    getInvoice,
    getSignedPdfUrl,
    openStream,
    pushPdfReady,
    updateInvoice,
    deleteInvoice
};
