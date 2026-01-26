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

        // 1️⃣ Create invoice
        const invoice = await tx.invoiceBill.create({
            data: {
                orgId: BigInt(user.orgId),
                customerId: BigInt(user.userId), // assuming self-billing
                clientId: payload.clientId ? BigInt(payload.clientId) : null,
                invoiceNumber: payload.invoiceNumber || `INV-${user.orgId}-${new Date().getFullYear()}-${Date.now()}`,
                issueDate: payload.invoiceDate
                    ? new Date(payload.invoiceDate)
                    : new Date(),
                dueDate: payload.dueDate
                    ? new Date(payload.dueDate)
                    : new Date(),
                subtotal: payload.subtotal ?? 0,
                taxAmount: payload.taxAmount ?? 0,
                totalAmount: payload.totalAmount,
                status: 'CONFIRMED',
                category: payload.category || 'OTHER'
            },
        });

        // 2️⃣ Create items
        if (Array.isArray(payload.items)) {
            for (const item of payload.items) {
                await tx.invoiceBillItem.create({
                    data: {
                        invoiceId: invoice.id,
                        itemName: item.name,
                        quantity: item.quantity ?? 1,
                        unitPrice: item.unitPrice ?? 0,
                        totalPrice: item.total ?? 0,
                    },
                });
            }
        }

        return invoice;
    });
}

async function listInvoices(user, page=1, limit=10) {
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
    // 1) Calculate totals
    const subtotal = data.items.reduce(
        (s, i) => s + i.quantity * i.unitPrice,
        0
    );

    const taxAmount = data.items.reduce(
        (s, i) => s + (i.quantity * i.unitPrice * i.taxRate) / 100,
        0
    );

    const totalAmount = subtotal + taxAmount;

    // 2) Create directly as SENT (or whatever your "confirmed" status is)
    console.log("user in jwt token is", user.userId, "and orgId is", user.orgId);
    const invoice = await prisma.invoiceBill.create({
        data: {
            orgId: user.orgId,
            customerId: user.userId,
            ...data,
            subtotal,
            taxAmount,
            totalAmount,
            balanceDue: totalAmount,
            status: 'SENT',          // <— previously probably 'DRAFT'
            confirmedAt: new Date(), // <— confirmation timestamp
            pdfStatus: 'QUEUED',     // <— directly queue PDF generation
            items: {
                create: data.items
            }
        },
        include: { items: true }
    });

    // 3) Queue PDF generation
    await invoiceQueue.enqueue({ invoiceId: invoice.id });

    return invoice;
};


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


module.exports = {
    previewInvoiceOCR,
    saveInvoiceFromPreview,
    listInvoices,
    listInvoiceProducts,
    previewInvoiceAI,
    confirmAndCreateInvoice,
    getInvoice,
    getSignedPdfUrl

};
