const { Client } = require("@upstash/qstash");
const { QSTASH_TOKEN, BASE_URL } = require("../config/env");

const qstash = new Client({
  token: QSTASH_TOKEN,
});

const INVOICE_PROCESS_URL = `${BASE_URL}/api/qstash/process-invoice-pdf`;
const INVOICE_FAILURE_CALLBACK_URL = `${BASE_URL}/api/qstash/invoice-pdf-failure`;

exports.publishInvoicePdfJob = async ({ invoiceId, sendEmail }) => {
  const res = await qstash.publishJSON({
    url: INVOICE_PROCESS_URL,
    body: {
      invoiceId: invoiceId.toString(),
      sendEmail
    },
    failureCallback: INVOICE_FAILURE_CALLBACK_URL,
    retries: 5,     // automatic retries
    delay: 0,       // immediate execution
  });
  return res;
};

exports.publishExpensePdfToStorage = async ({ invoiceId }) => {
  await qstash.publishJSON({
    url: INVOICE_PROCESS_URL,
    body: {
      invoiceId: invoiceId.toString(),
    },
    failureCallback: INVOICE_FAILURE_CALLBACK_URL,
    retries: 5,     // automatic retries
    delay: 0,       // immediate execution
  });
};

exports.deleteDlqMessage = async (dlqId) => {
  await qstash.dlq.delete(dlqId);
};
