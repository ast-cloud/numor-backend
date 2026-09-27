const prisma = require("../config/database");
const qstashService = require("../queues/invoice.qstash");

// Past this, a QUEUED row is assumed to have lost its job - the process died
// between writing QUEUED and publishing.
const STALE_QUEUED_MS = 10 * 60 * 1000;

// Past this a job needs a human, not another retry.
const MAX_PDF_ATTEMPTS = 5;

// Cap per pass, so a backlog cannot stall the loop.
const BATCH = 25;

/**
 * Reconciles invoices stuck mid-PDF.
 *
 * No transaction spans Postgres and QStash, so a crash between them is always
 * possible. Every non-terminal state carries a deadline and this owns anything
 * past it. Conditional updates throughout, so concurrent sweepers are safe.
 */
async function sweepStuckPdfJobs() {
  const now = new Date();
  const result = { reclaimed: 0, republished: 0, exhausted: 0, emailsFailed: 0 };

  // 1. Worker died, lease lapsed. FAILED is re-queueable; PROCESSING is not.
  const expired = await prisma.invoiceBill.updateMany({
    where: { pdfStatus: "PROCESSING", pdfLeaseExpiresAt: { lt: now } },
    data: { pdfStatus: "FAILED", pdfLeaseExpiresAt: null },
  });
  result.reclaimed = expired.count;

  // 2. Give up on jobs that keep failing.
  const exhausted = await prisma.invoiceBill.updateMany({
    where: {
      pdfStatus: { in: ["QUEUED", "FAILED"] },
      pdfAttempts: { gte: MAX_PDF_ATTEMPTS },
    },
    data: { pdfStatus: "FAILED", pdfLeaseExpiresAt: null },
  });
  result.exhausted = exhausted.count;

  // 3. Send claimed but never finished. FAILED lets the row offer a retry
  //    instead of showing "Sharing with Client" forever. Never auto-re-sent.
  const stuckEmails = await prisma.invoiceBill.updateMany({
    where: {
      emailStatus: "PENDING",
      updatedAt: { lt: new Date(now.getTime() - STALE_QUEUED_MS) },
    },
    data: { emailStatus: "FAILED", emailError: "Sending was interrupted" },
  });
  result.emailsFailed = stuckEmails.count;

  // 4. QUEUED with nothing coming - the publish never landed.
  const stale = await prisma.invoiceBill.findMany({
    where: {
      pdfStatus: "QUEUED",
      updatedAt: { lt: new Date(now.getTime() - STALE_QUEUED_MS) },
      pdfAttempts: { lt: MAX_PDF_ATTEMPTS },
    },
    select: { id: true },
    take: BATCH,
  });

  for (const { id } of stale) {
    try {
      await qstashService.publishInvoicePdfJob({ invoiceId: id, sendEmail: false });

      // Touches updatedAt, so the next pass leaves this row alone for now.
      await prisma.invoiceBill.updateMany({
        where: { id, pdfStatus: "QUEUED" },
        data: { pdfAttempts: { increment: 1 } },
      });

      result.republished += 1;
    } catch (err) {
      // Leave it QUEUED; the next pass retries.
      console.error(`Sweeper could not republish invoice ${id}:`, err.message);
    }
  }

  if (result.reclaimed || result.republished || result.exhausted || result.emailsFailed) {
    console.log("PDF sweeper:", result);
  }

  return result;
}

// Each pass is independently safe, so a missed or overlapping tick costs nothing.
function startPdfSweeper({ intervalMs = 5 * 60 * 1000 } = {}) {
  const tick = async () => {
    try {
      await sweepStuckPdfJobs();
    } catch (err) {
      console.error("PDF sweeper pass failed:", err.message);
    }
  };

  const timer = setInterval(tick, intervalMs);
  // Never hold the process open for this.
  if (typeof timer.unref === "function") timer.unref();

  console.log(`🧹 PDF sweeper running every ${Math.round(intervalMs / 1000)}s`);
  return timer;
}

module.exports = { sweepStuckPdfJobs, startPdfSweeper };
