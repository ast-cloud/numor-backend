// invoice.controller.js
const { ca } = require('zod/locales');
const invoiceService = require('./invoice.service');


exports.previewInvoice = async function (req, res) {
  // const filePath = req.file.path;
  const result = await invoiceService.previewInvoiceAI(req.file);

  res.json({
    success: true,
    data: result,
  });
}

exports.confirmAndSaveInvoice = async function (req, res) {
  try {
    const payload = req.body;
    const user = req.user; // from auth middleware

    const invoice = await invoiceService.saveInvoiceFromPreview(user, payload);

    res.json({ success: true, invoice });
  } catch (err) {
    console.error('Error in confirmOCR:', err);
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};

exports.listInvoices = async function (req, res) {
  try {
    const { page, limit } = req.query;
    const user = req.user;
    const invoices = await invoiceService.listInvoices(user, Number(page), Number(limit));
    res.json({ success: true, data: invoices });
  } catch (err) {
    console.error('Error in listInvoices:', err);
    res.status(500).json({ success: false, message: err.message });
  }
}

exports.listInvoiceProduct = async function (req, res) {
  try {
    const { page, limit } = req.query;
    const products = await invoiceService.listInvoiceProducts(req.params.id, Number(page), Number(limit));
    res.json({ success: true, data: products });
  } catch (err) {
    console.error('Error in listInvoiceProduct:', err);
    res.status(500).json({ success: false, message: err.message });
  }
}

exports.confirmAndUpdateInvoice = async function (req, res) {
  try {
    const payload = req.body;
    const user = req.user; // from auth middleware
    const id = BigInt(req.params.id);

    const invoice = await invoiceService.updateInvoice(user, id, payload);

    return res.json({
      success: true,
      data: invoice
    });
  } catch (err) {
    console.error('Error in confirmAndUpdateInvoice:', err);
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
};

exports.confirmAndCreateInvoice = async function (req, res) {
  try {
    const user = req.user;
    const payload = req.body;

    const invoice = await invoiceService.confirmAndCreateInvoice(user, payload);

    return res.status(201).json({
      success: true,
      data: invoice
    });
  } catch (err) {
    console.error('Error in confirmAndCreateInvoice:', err);
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
};


exports.getInvoice = async (req, res) => {
  const invoice = await invoiceService.getInvoice(req.user, req.params.id);
  res.json(invoice);
};

exports.getInvoicePdf = async (req, res) => {
  try {
    const result = await invoiceService.getSignedPdfUrl(
      req.user,
      req.params.id
    );

    // Map status to HTTP status code
    const statusMap = {
      'INVOICE_NOT_FOUND': 404,
      'NOT_STARTED': 202,
      'QUEUED': 202,
      'PROCESSING': 202,
      'READY': 200,
      'FAILED': 500,
      'NOT_GENERATED': 500
    };

    const httpStatus = statusMap[result.status] || 500;
    return res.status(httpStatus).json(result);
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.message
    });
  }
};

exports.streamInvoicePdfStatus = (req, res) => {
  invoiceService.openStream({
    req,
    res,
    userId: req.user.userId,
    invoiceId: req.params.id
  });
};
