const prisma = require('../../config/database');
const ocrService = require('../../services/ocr.service');
const aiService = require('../ai/ai.service');

async function processInvoiceOCR(invoiceIdm, filePath) {
    const rawText = ocrService.extractText(filePath);

    const parsed = await aiService.parseInvoice(rawText);

    const invoice = await prisma.invoiceBill.update({
        where: { id: BigInt(invoiceId) },
        data: {
            invoiceNumber: parsed.invoiceNumber,
            issueDate: new Date(parsed.invoiceDate),
            dueDate: new Date(parsed.dueDate),
            subtotal: parsed.subtotal,
            taxAmount: parsed.taxAmount,
            totalAmount: parsed.totalAmount,
            ocrExtracted: true,
        },
    });

    // 4. Save items
    for (const item of parsed.items || []) {
        await prisma.InvoiceBillItem.create({
            data: {
                invoiceId: invoice.id,
                itemName: item.name,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                totalPrice: item.total,
            },
        });
    }

    return invoice;
}

module.exports = { processInvoiceOCR };
