const invoicePdfService = require("./qstash.service");

exports.processInvoicePdf = async (req, res) => {
  const { invoiceId } = req.body;

  if (!invoiceId) {
    return res.status(400).json({ error: "invoiceId is required" });
  }

  try {
    await invoicePdfService.process(invoiceId);

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
