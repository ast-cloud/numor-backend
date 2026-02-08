const { Client } = require("@upstash/qstash");

const qstash = new Client({
  token: process.env.QSTASH_TOKEN,
});

exports.publishInvoicePdfJob = async ({ invoiceId }) => {
  await qstash.publishJSON({
    url: `${process.env.BASE_URL}/api/qstash/process-invoice-pdf`,
    body: {
      invoiceId: invoiceId.toString(),
    },
    retries: 5,     // automatic retries
    delay: 0,       // immediate execution
  });
};
