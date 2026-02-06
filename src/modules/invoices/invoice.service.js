const prisma = require('../../config/database');
const ocrService = require('../../services/ocr.service');
const aiService = require('../ai/ai.service');
const invoiceQueue = require('../../queues/invoice.queue');


async function previewInvoiceAI(filePath) {
    const parsed = await aiService.parseInvoiceFromFile(filePath);

    return {
        source: "gemini-vision",
        parsedData: parsed,
        confidence: parsed.confidence || null,
    };
}

async function previewInvoiceOCR(filePath) {
    const rawText = await ocrService.extractText(filePath);
    const parsed = await aiService.parseInvoice(rawText);
    console.log('--- OCR RAW TEXT ---\n', rawText);
    console.log('Parsed Invoice Data:', parsed);
    return {
        source: 'ocr+ai',
        parsedData: parsed,
        confidence: parsed.confidence || null, // optional
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

        // 1️⃣ Create invoice
        const invoice = await tx.invoiceBill.create({
            data: {
                orgId: BigInt(user.orgId),
                customerId: BigInt(user.userId),
                clientId: payload.clientId ? BigInt(payload.clientId) : null,

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

                status: "CONFIRMED",
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
                        unitPrice: item.unitPrice ?? 0,
                        taxRate: item.taxRate ?? 0,
                        totalPrice: item.total ?? 0,
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

async function listInvoiceProducts(invoiceId, page, limit) {
    const offset = (page - 1) * limit;
    return prisma.invoiceBillItem.findMany({
        where: { invoiceId: BigInt(invoiceId) },
        take: limit,
        skip: offset,
    })
}
// async function saveConfirmedInvoice(invoiceId, parsed) {
//     console.log('Saving confirmed invoice data:', parsed);

//     if (!invoiceId) {
//         throw new Error('Invoice ID is required');
//     }

//     if (!parsed?.invoiceNumber) {
//         throw new Error('Invoice number is required to confirm invoice');
//     }

//     return await prisma.$transaction(async (tx) => {

//         // 1️⃣ Ensure invoice exists & is in DRAFT state
//         const existingInvoice = await tx.invoiceBill.findUnique({
//             where: { id: BigInt(invoiceId) },
//             select: { id: true, status: true },
//         });

//         if (!existingInvoice) {
//             throw new Error('Invoice not found');
//         }

//         if (existingInvoice.status !== 'DRAFT') {
//             throw new Error(
//                 `Invoice cannot be confirmed. Current status: ${existingInvoice.status}`
//             );
//         }

//         // 2️⃣ Update invoice
//         const invoice = await tx.invoiceBill.update({
//             where: { id: BigInt(invoiceId) },
//             data: {
//                 invoiceNumber: parsed.invoiceNumber,
//                 issueDate: parsed.invoiceDate
//                     ? new Date(parsed.invoiceDate)
//                     : new Date(),
//                 dueDate: parsed.dueDate
//                     ? new Date(parsed.dueDate)
//                     : new Date(),
//                 subtotal: parsed.subtotal ?? 0,
//                 taxAmount: parsed.taxAmount ?? 0,
//                 totalAmount: parsed.totalAmount,
//                 status: 'CONFIRMED',
//             },
//         });

//         // 3️⃣ Remove old items (safe inside transaction)
//         await tx.invoiceBillItem.deleteMany({
//             where: { invoiceId: invoice.id },
//         });

//         // 4️⃣ Insert new items
//         if (Array.isArray(parsed.items)) {
//             for (const item of parsed.items) {
//                 await tx.invoiceBillItem.create({
//                     data: {
//                         invoiceId: invoice.id,
//                         itemName: item.name,
//                         quantity: item.quantity ?? 1,
//                         unitPrice: item.unitPrice ?? 0,
//                         totalPrice: item.total ?? 0,
//                     },
//                 });
//             }
//         }

//         return invoice;
//     });
// }

async function confirmAndCreateInvoice(user, data) {
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
            status: "SENT",
            confirmedAt: new Date(),
            sentAt: new Date(),
            pdfStatus: "QUEUED",
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
                    unitPrice: item.unitPrice ?? 0,
                    taxRate: item.taxRate ?? 0,
                    totalPrice:
                        (item.quantity ?? 1) *
                        (item.unitPrice ?? 0) +
                        ((item.quantity ?? 1) *
                            (item.unitPrice ?? 0) *
                            (item.taxRate ?? 0)) /
                        100,
                })),
            },
        },
        include: { items: true },
    });

    // 3️⃣ Queue PDF generation
    await invoiceQueue.enqueue({ invoiceId: invoice.id });

    return invoice;
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
        throw new Error('Invoice not found');
    }

    if (invoice.pdfStatus !== 'READY') {
        throw new Error('PDF not ready');
    }

    if (!invoice.pdfKey) {
        throw new Error('PDF not generated');
    }

    const storage = require('../../storage/storage.service');
    return storage.getSignedUrl(invoice.pdfKey);
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



module.exports = {
    previewInvoiceOCR,
    saveInvoiceFromPreview,
    listInvoices,
    listInvoiceProducts,
    previewInvoiceAI,
    confirmAndCreateInvoice,
    getInvoice,
    getSignedPdfUrl,
    openStream,
    pushPdfReady

};
