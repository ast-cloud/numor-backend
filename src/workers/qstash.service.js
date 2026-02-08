
const prisma = require("../config/database");
const pdfService = require("../services/pdf.service");
const storage = require("../storage/storage.service");

exports.process = async (invoiceId) => {
  const id = BigInt(invoiceId);

  // 🔒 Idempotency guard
  const invoice = await prisma.invoiceBill.findUnique({
    where: { id },
    include: { items: true, organization: true, client: true },
  });

  if (!invoice) {
    throw new Error(`Invoice not found: ${invoiceId}`);
  }

  if (invoice.pdfStatus === "READY") {
    return; // already processed
  }

  await prisma.invoiceBill.update({
    where: { id },
    data: { pdfStatus: "PROCESSING" },
  });

  const pdfBuffer = await pdfService.generateInvoicePdf(invoice);

  const path = `invoices/${invoice.orgId}/${invoice.invoiceNumber}.pdf`;
  const pdfKey = await storage.upload(path, pdfBuffer);

  await prisma.invoiceBill.update({
    where: { id },
    data: {
      pdfStatus: "READY",
      pdfKey,
    },
  });
};



async function handleInvoice(invoiceId) {
  await prisma.invoiceBill.update({
    where: { id: BigInt(invoiceId) },
    data: { pdfStatus: 'PROCESSING' }
  });

  const invoice = await prisma.invoiceBill.findUnique({
    where: { id: BigInt(invoiceId) },
    include: { items: true, organization: true, client: true }
  });

  if (!invoice || invoice.pdfStatus === 'READY') return;

  const pdfBuffer = await pdfService.generateInvoicePdf(invoice);

  const path = `invoices/${invoice.orgId}/${invoice.invoiceNumber}.pdf`;
  const pdfKey = await storage.upload(path, pdfBuffer);

  await prisma.invoiceBill.update({
    where: { id: BigInt(invoiceId) },
    data: { pdfStatus: 'READY', pdfKey }
  });
}
