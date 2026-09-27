const invoicePdfService = require("./qstash.service");
const invoiceQstash = require("../queues/invoice.qstash");
const pdfSweeper = require("./pdf-sweeper.service");

// The HTTP edge of the PDF job.
//
// CRASH POINT - our 200 below never reaches QStash (dropped, or QStash timed out
// while Puppeteer was still running): QStash assumes failure and redelivers. The
// claim inside process() refuses the duplicate, so the retry is a cheap no-op.
//
// A thrown error becomes the 500 here, which is QStash's signal to retry: five
// attempts, then the DLQ posts to /invoice-pdf-failure and the row is marked
// FAILED - re-queueable, so the user's retry can still recover it.
exports.processInvoicePdf = async (req, res) => {
  const { invoiceId, sendEmail } = req.body;

  if (!invoiceId) {
    return res.status(400).json({ error: "invoiceId is required" });
  }

  try {
    await invoicePdfService.process(invoiceId, sendEmail);

    return res.status(200).json({
      success: true,
      invoiceId,
    });
  } catch (err) {
    console.error("PDF processing failed:", err);

    return res.status(500).json({
      error: "PDF generation failed",
    });
  }
};

// Email-only job. Returns 200 even when there is nothing to do, so QStash stops
// redelivering; a genuine send failure is recorded on the invoice, not thrown.
exports.sendInvoiceEmail = async (req, res) => {
  const { invoiceId } = req.body;

  if (!invoiceId) {
    return res.status(400).json({ error: "invoiceId is required" });
  }

  try {
    await invoicePdfService.sendEmail(invoiceId);
    return res.status(200).json({ success: true, invoiceId });
  } catch (err) {
    console.error("Invoice email job failed:", err);
    return res.status(500).json({ error: "Invoice email failed" });
  }
};

exports.processInvoicePdfFailure = async (req, res) => {
  try {
    const result = await invoicePdfService.markInvoiceAsFailedFromDlq(req.body);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error("Failed to process QStash DLQ callback:", err);

    return res.status(500).json({
      success: false,
      error: "DLQ callback processing failed",
    });
  }
};

// Reconciles invoices stuck mid-PDF. Exposed as an endpoint so an external
// scheduler (QStash Schedules, cron) can drive it in addition to - or instead
// of - the in-process timer, which only covers the instance it runs on.
exports.sweepInvoicePdfJobs = async (req, res) => {
  try {
    const result = await pdfSweeper.sweepStuckPdfJobs();

    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error("PDF sweep failed:", err);

    return res.status(500).json({ success: false, error: "PDF sweep failed" });
  }
};
