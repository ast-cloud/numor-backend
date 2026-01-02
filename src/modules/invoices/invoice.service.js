const prisma = require('../../config/database');
const ocrService = require('../../services/ocr.service');
const aiService = require('../ai/ai.service');

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

async function listInvoices(user) {
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
    });
}

async function listInvoiceProducts(invoiceId) {
    return prisma.invoiceBillItem.findMany({
        where: { invoiceId: BigInt(invoiceId) }
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


module.exports = {
    previewInvoiceOCR,
    saveInvoiceFromPreview,
    listInvoices,
    listInvoiceProducts,
    previewInvoiceAI
};
