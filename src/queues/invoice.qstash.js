const { Client } = require("@upstash/qstash");
const { QSTASH_TOKEN, BASE_URL } = require("../config/env");

const qstash = new Client({
  token: QSTASH_TOKEN,
});

const INVOICE_PROCESS_URL = `${BASE_URL}/api/qstash/process-invoice-pdf`;
const INVOICE_EMAIL_URL = `${BASE_URL}/api/qstash/send-invoice-email`;
const INVOICE_FAILURE_CALLBACK_URL = `${BASE_URL}/api/qstash/invoice-pdf-failure`;

// CRASH POINT - a network failure here throws to the caller. finalizeInvoice
// catches it and marks the invoice FAILED rather than leaving it QUEUED with no
// job, so the next finalize retries it instead of finding a dead end.
// No sendEmail in the payload: the worker reads invoice.emailRequested instead,
// so a retry published from anywhere keeps the user's original intent.
exports.publishInvoicePdfJob = async ({ invoiceId }) => {
  const res = await qstash.publishJSON({
    url: INVOICE_PROCESS_URL,
    body: {
      invoiceId: invoiceId.toString()
    },
    failureCallback: INVOICE_FAILURE_CALLBACK_URL,
    retries: 5,     // automatic retries
    delay: 0,       // immediate execution
  });
  return res;
};

// Email-only job, for an invoice whose PDF already exists. The PDF job cannot be
// reused here: it begins by claiming the PDF, and a READY invoice is not
// claimable, so the job would be dropped before reaching the email step.
exports.publishInvoiceEmailJob = async ({ invoiceId }) => {
  return qstash.publishJSON({
    url: INVOICE_EMAIL_URL,
    body: { invoiceId: invoiceId.toString() },
    failureCallback: INVOICE_FAILURE_CALLBACK_URL,
    retries: 3,
    delay: 0,
  });
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
