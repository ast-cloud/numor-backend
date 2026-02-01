const { Redis } = require('@upstash/redis');
const invoiceSseService = require('../modules/invoices/invoice.service');
const storage = require('../storage/storage.service');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
});

async function startInvoiceStatusListener() {
  await redis.subscribe('invoice-pdf-events', async (msg) => {
    const event = JSON.parse(msg);

    if (event.status !== 'READY') return;

    const signedUrl = await storage.getSignedUrl(event.pdfKey);

    invoiceSseService.pushPdfReady({
      userId: event.userId,
      invoiceId: event.invoiceId,
      signedUrl
    });
  });
}

module.exports = startInvoiceStatusListener;
