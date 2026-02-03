const prisma = require('../config/database');
const pdfService = require('../services/pdf.service');
const storage = require('../storage/storage.service');
const { Redis } = require('@upstash/redis');

const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN
});


async function processQueue() {
    try {
        const job = await redis.rpop('numor-invoice-pdf-queue');
        if (job) {
            console.log('📤 Dequeued PDF job:', job);
        }
        if (!job) {
            // No job → wait 1s, then retry
            return setTimeout(processQueue, 1000);
        }
        const { invoiceId } = job;
        await handleInvoice(invoiceId);

    } catch (err) {
        console.error('Worker error:', err);
    }

    setImmediate(processQueue);
}
processQueue();

async function shutdown() {
    console.log('Shutting down PDF worker...');
    await prisma.$disconnect();
    process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);


async function handleInvoice(invoiceId) {
    await prisma.invoiceBill.update({
        where: { id: BigInt(invoiceId) },
        data: { pdfStatus: 'PROCESSING' }
    });

    const invoice = await prisma.invoiceBill.findUnique({
        where: { id: BigInt(invoiceId) },
        include: { items: true, organization: true , client: true }
    });

    console.log('Invoice payload:', invoice);

    if (!invoice || invoice.pdfStatus === 'READY') return;
    const pdfBuffer = await pdfService.generateInvoicePdf(invoice);

    const path = `invoices/${invoice.orgId}/${invoice.invoiceNumber}.pdf`;
    const pdfKey = await storage.upload(path, pdfBuffer);

    await prisma.invoiceBill.update({
        where: { id: BigInt(invoiceId) },
        data: {
            pdfStatus: 'READY',
            pdfKey
        }
    });

    // 🔥 ADD THIS BLOCK (ONLY THIS)
    await redis.publish(
        'invoice-pdf-events',
        JSON.stringify({
            userId: invoice.customerId.toString(),
            invoiceId: invoice.id.toString(),
            status: 'READY',
            pdfKey
        })
    );

    console.log('📣 Published PDF READY event', invoice.id.toString());
}
