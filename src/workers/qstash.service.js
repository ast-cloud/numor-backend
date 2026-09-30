
const prisma = require("../config/database");
const pdfService = require("../services/pdf.service");
const storage = require("../storage/storage.service");
const emailService = require('../services/email.service');
const dayjs = require("dayjs");
const { clientForDisplay } = require("../utils/clientSnapshot");
const fs = require("fs");
const path = require("path");
const Handlebars = require("handlebars");

// Compiled once. The file never changes at runtime, and every invoice email
// renders from it.
//
// Comments are stripped first. They are notes for us, and the recipient of the
// mail can read the source; they also count towards the ~102KB at which Gmail
// clips a message. Conditional comments are left alone - those are markup.
const invoiceEmailTemplate = Handlebars.compile(
  fs
    .readFileSync(path.join(__dirname, "../templates/invoice-email.html"), "utf-8")
    .replace(/<!--(?!\[if)[\s\S]*?-->/g, "")
);

// Referenced from the template as <img src="cid:...">. An inline attachment,
// not a link: storage signed URLs expire in 15 minutes and are served as
// downloads, so a linked logo would be a broken image in the inbox by the time
// anyone opened it.
const LOGO_CID = "seller-logo";
const WALLET_CID = "icon-wallet";
const CALENDAR_CID = "icon-calendar";

// The two label icons, read once at startup. They ship as PNG rather than inline
// SVG because Gmail strips <svg> outright, and rather than emoji because those
// render differently on every platform.
const ICON_ATTACHMENTS = [
  { cid: WALLET_CID, file: "icon-wallet.png" },
  { cid: CALENDAR_CID, file: "icon-calendar.png" },
].map(({ cid, file }) => ({
  filename: file,
  content: fs
    .readFileSync(path.join(__dirname, "../templates/assets", file))
    .toString("base64"),
  contentId: cid,
}));

/** The org logo as an attachment, or null when there is none to send. */
async function loadLogoAttachment(organization) {
  if (!organization?.logoUrl) return null;

  try {
    const bytes = await storage.download(organization.logoUrl);
    const filename = path.basename(organization.logoUrl) || "logo.png";

    return {
      filename,
      content: Buffer.from(bytes).toString("base64"),
      contentId: LOGO_CID,
    };
  } catch (error) {
    // The email is worth more than the logo: fall back to the monogram.
    console.warn("Could not attach organization logo:", error.message);
    return null;
  }
}

// How long a worker may hold a job before the sweeper assumes it died.
// Must be longer than a cold Puppeteer launch plus PDF generation.
const PDF_LEASE_MS = 5 * 60 * 1000;

// Statuses a job can be picked up from. PROCESSING is missing on purpose: a
// PROCESSING row is only claimable once its lease has expired (see below).
const CLAIMABLE_PDF_STATUSES = ["NOT_STARTED", "QUEUED", "FAILED"];

exports.process = async (invoiceId) => {
  const id = BigInt(invoiceId);

  // If we crash before the claim below, nothing has changed in the database and
  // QStash simply delivers the job again.

  // Claim the job: mark it PROCESSING and record a lease (a deadline by which we
  // promise to finish). Doing it in one updateMany means only one worker can win
  // - the others get count 0. A read-then-write would let two deliveries both
  // pass the check and run the job twice.
  //
  // We also save the lease value, because the final write only applies if the row
  // still has this exact lease. That is how we detect that someone changed the
  // invoice while we were rendering.
  const pdfLease = new Date(Date.now() + PDF_LEASE_MS);

  const claim = await prisma.invoiceBill.updateMany({
    where: {
      id,
      OR: [
        { pdfStatus: { in: CLAIMABLE_PDF_STATUSES } },
        { pdfStatus: "PROCESSING", pdfLeaseExpiresAt: { lt: new Date() } },
      ],
    },
    data: {
      pdfStatus: "PROCESSING",
      pdfLeaseExpiresAt: pdfLease,
      pdfAttempts: { increment: 1 },
    },
  });

  if (claim.count === 0) {
    // The job is already done, or another worker is on it. Return normally
    // instead of throwing, so QStash treats it as handled and stops retrying.
    return;
  }

  // If we crash from here on, nobody updates the row again. The lease expires,
  // and the sweeper sets the invoice to FAILED so it can be queued again.

  const invoice = await prisma.invoiceBill.findUnique({
    where: { id },
    include: { items: true, organization: true, client: true, createdBy: true, customFields: { include: { customField: true } } },
  });

  if (!invoice) {
    throw new Error(`Invoice not found: ${invoiceId}`);
  }

  let organizationLogoUrl = "";
  if (invoice.organization?.logoUrl) {
    try {
      organizationLogoUrl = await storage.getSignedUrl(invoice.organization.logoUrl);
    } catch (error) {
      console.warn("Could not sign organization logo URL:", error.message);
    }
  }

  const pdfBuffer = await pdfService.generateInvoicePdf({
    ...invoice,
    organizationLogoUrl,
  });

  const path = `invoices/${invoice.orgId}/${invoice.invoiceNumber}.pdf`;
  const pdfKey = await storage.upload(path, pdfBuffer);

  // If we crash after uploading but before saving below, the file is left in
  // storage unused. That is harmless: the filename is built from the invoice
  // number, so the next run writes over it.

  // Save the PDF now, before sending any email, so that a failed email never
  // loses a PDF we already made.
  //
  // The lease check in `where` is important: if someone edited this invoice while
  // we were rendering, they cleared the lease, so this update matches no rows and
  // our out-of-date PDF is thrown away instead of being saved.
  //
  // This is also the moment the invoice counts as issued, so it moves from DRAFT
  // to UNPAID here.
  const committed = await prisma.invoiceBill.updateMany({
    where: { id, pdfLeaseExpiresAt: pdfLease },
    data: {
      pdfStatus: "READY",
      pdfKey,
      pdfLeaseExpiresAt: null,
      status: invoice.status === "DRAFT" ? "UNPAID" : invoice.status,
      confirmedAt: invoice.confirmedAt ?? new Date(),
    },
  });

  if (committed.count === 0) {
    // Our PDF is out of date. Someone else is generating a newer one, so just
    // stop here.
    console.log(`Discarding stale render for invoice ${invoice.invoiceNumber}`);
    return;
  }

  // The intent comes from the invoice, not the job payload, so a retry from the
  // row or the sweeper still emails the client if that is what was asked for.
  if (!invoice.emailRequested) {
    return;
  }

  await deliverInvoiceEmail(invoice, pdfBuffer);
};

// Sends the invoice email and records the outcome.
//
// Shared by two callers: process() above, which already holds the freshly
// rendered PDF, and sendEmail() below, which is the standalone job used when the
// PDF was generated by an earlier run and only the email is outstanding. Keeping
// one copy means the claim and the message body cannot drift apart.
async function deliverInvoiceEmail(invoice, pdfBuffer, { alreadyClaimed = false } = {}) {
  const id = invoice.id;

  // The email goes to the client being billed, not to the Numor user who made
  // the invoice. Read from the snapshot, so a deleted client does not silently
  // turn every resend into "Client has no email address".
  const client = clientForDisplay(invoice);
  const recipientEmail = client.email;

  if (!recipientEmail) {
    await prisma.invoiceBill.updateMany({
      where: { id, emailStatus: { in: ["NOT_REQUESTED", "FAILED"] } },
      data: { emailStatus: "FAILED", emailError: "Client has no email address" },
    });
    console.warn(
      `Skipping invoice email for ${invoice.invoiceNumber}: client has no email address`
    );
    return;
  }

  // Claim the send: only one sender can move it to PENDING. Email needs its own
  // claim because sending is the one action we cannot undo - two workers must
  // never both reach the client.
  //
  // alreadyClaimed means the request that published this job took the claim when
  // the user clicked, so the row is PENDING already. Claiming again would find
  // PENDING, read it as "someone else is sending", and drop the job we were
  // asked to run.
  if (!alreadyClaimed) {
    const emailClaim = await prisma.invoiceBill.updateMany({
      where: { id, emailStatus: { in: ["NOT_REQUESTED", "FAILED"] } },
      data: { emailStatus: "PENDING", emailError: null },
    });

    if (emailClaim.count === 0) {
      console.log(
        `Invoice ${invoice.invoiceNumber} email already sent or in flight - skipping`
      );
      return;
    }
  }

  // If we crash while sending, the row stays PENDING. After 10 minutes the
  // sweeper marks it FAILED and the invoice offers a retry. We never re-send by
  // ourselves, because the first email may well have gone out - only a person
  // can decide it did not arrive.
  try {
    const base64Pdf = Buffer.from(pdfBuffer).toString("base64");

    const clientName = client.name || "there";
    const sellerName = invoice.organization?.name || "your supplier";
    const dueDate = invoice.dueDate
      ? dayjs(invoice.dueDate).format("DD MMM YYYY")
      : null;
    const amount = `${invoice.currency} ${Number(invoice.totalAmount).toFixed(2)}`;

    const subject = `New Invoice from ${sellerName} (${invoice.invoiceNumber})`;

    const contactEmail = invoice.organization?.email || "admin@numor.app";
    const logoAttachment = await loadLogoAttachment(invoice.organization);

    const html = invoiceEmailTemplate({
      clientName,
      sellerName,
      invoiceNumber: invoice.invoiceNumber,
      amount,
      dueDate,
      contactEmail,
      logoCid: logoAttachment ? LOGO_CID : null,
      walletCid: WALLET_CID,
      calendarCid: CALENDAR_CID,
      sellerInitial: sellerName.trim().charAt(0).toUpperCase() || "?",
    });
    // The text alternative for clients that will not render HTML. Same words,
    // no markup - built with real newlines rather than an indented template
    // literal, which would carry its own leading whitespace into the mail.
    const text = [
      `Hi ${clientName},`,
      "",
      `Please find attached invoice #${invoice.invoiceNumber} from ${sellerName}.`,
      "",
      `Amount due: ${amount}`,
      ...(dueDate ? [`Due by: ${dueDate}`] : []),
      "",
      `If you have any questions about this invoice, please write to us at ${contactEmail}.`,
      "",
      "Thanks,",
      sellerName,
    ].join("\n");

    await emailService.sendEmailWithAttachment({
      to: recipientEmail,
      // What the recipient sees in their inbox. The address behind it is still
      // ours - only a verified domain can be signed for.
      fromName: sellerName,
      // Replies should go to the user who made the invoice, not to our shared
      // sending address.
      replyTo: invoice.createdBy?.email || undefined,
      subject,
      html,
      text,
      attachments: [
        {
          filename: `Invoice-${invoice.invoiceNumber}.pdf`,
          content: base64Pdf,
        },
        // Inline, so these render in the body rather than showing up as extra
        // files for the client to open.
        ...(logoAttachment ? [logoAttachment] : []),
        ...ICON_ATTACHMENTS,
      ],
    });

    await prisma.invoiceBill.update({
      where: { id },
      data: { emailStatus: "SENT", emailSentAt: new Date(), emailError: null },
    });

    console.log(`Invoice ${invoice.invoiceNumber} emailed to ${recipientEmail}`);
  } catch (err) {
    console.error("Email sending failed:", {
      message: err.message,
      invoiceId: invoice.id,
    });

    // Record the failure instead of throwing. The PDF is already saved, and
    // throwing would make QStash retry the whole job for something only the
    // email got wrong.
    await prisma.invoiceBill.update({
      where: { id },
      data: { emailStatus: "FAILED", emailError: String(err.message).slice(0, 500) },
    });
  }
}

// Standalone email job: /api/qstash/send-invoice-email.
//
// Separate from process() on purpose. That one starts by claiming the PDF, and a
// READY invoice is not claimable - so a job published there for an email-only
// retry was discarded before it ever reached the sending code. This entry point
// does no PDF work at all; it fetches the stored file and hands it to the same
// delivery function.
exports.sendEmail = async (invoiceId) => {
  const id = BigInt(invoiceId);

  const invoice = await prisma.invoiceBill.findUnique({
    where: { id },
    include: { organization: true, client: true, createdBy: true },
  });

  if (!invoice) {
    throw new Error(`Invoice not found: ${invoiceId}`);
  }

  // Nothing to attach yet. The PDF job will send the email itself once it
  // finishes, so this is a no-op rather than an error.
  if (invoice.pdfStatus !== "READY" || !invoice.pdfKey) {
    console.log(
      `Invoice ${invoice.invoiceNumber} has no PDF yet - leaving the email to the PDF job`
    );
    return;
  }

  const pdfBuffer = await storage.download(invoice.pdfKey);

  // resendInvoiceEmail() claimed this before publishing, so the row is already
  // PENDING and this must not try to claim it again.
  await deliverInvoiceEmail(invoice, pdfBuffer, { alreadyClaimed: true });
};

// QStash sends the bodies base64-encoded when it reports a failure.
// `sourceBody` is the job payload we originally published (it has the invoiceId).
// `body` is our own error response, which does not.
function parsePayloadBody(body) {
  if (!body) return null;

  if (typeof body === "object") {
    return body;
  }

  if (typeof body !== "string") {
    return null;
  }

  // Try plain JSON first, so hitting this endpoint by hand still works.
  try {
    return JSON.parse(body);
  } catch {
    // Not JSON - fall through and try base64.
  }

  try {
    return JSON.parse(Buffer.from(body, "base64").toString("utf-8"));
  } catch {
    return null;
  }
}

exports.markInvoiceAsFailedFromDlq = async (payload) => {

  const parsedSourceBody = parsePayloadBody(payload?.sourceBody);
  const parsedBody = parsePayloadBody(payload?.body);
  console.log("Parsed DLQ payload body:", { parsedSourceBody, parsedBody });

  const invoiceId =
    payload?.invoiceId ??
    parsedSourceBody?.invoiceId ??
    parsedBody?.invoiceId;

  if (!invoiceId) {
    return { updated: false, reason: "invoiceId_not_found" };
  }

  const id = BigInt(invoiceId);

  // Only mark it FAILED if it is still QUEUED or PROCESSING. This callback can
  // arrive late, after a retry has already produced the PDF, and we must not
  // overwrite a finished invoice with FAILED.
  await prisma.invoiceBill.updateMany({
    where: { id, pdfStatus: { in: ["QUEUED", "PROCESSING"] } },
    data: { pdfStatus: "FAILED", pdfLeaseExpiresAt: null },
  });

  return { updated: true, invoiceId: id.toString() };
};
