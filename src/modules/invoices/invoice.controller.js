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
    const user = req.loggedInUser; // from auth middleware

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
    const { page, limit, startDate, endDate } = req.query;
    const user = req.loggedInUser;
    const invoices = await invoiceService.listInvoices(user, Number(page), Number(limit), startDate, endDate);
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
    const user = req.loggedInUser; // from auth middleware
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
    const user = req.loggedInUser;
    const payload = req.body;

    const sendEmail = req.query.sendEmail === "true";
    const invoice = await invoiceService.confirmAndCreateInvoice(user, payload, sendEmail);

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
  try {
    const invoice = await invoiceService.getInvoice(req.loggedInUser, req.params.id);
    return res.json({
      success: true,
      data: invoice
    });
  } catch (err) {
    console.error('Error in getInvoice:', err);
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
};

exports.getInvoicePdf = async (req, res) => {
  try {
    const result = await invoiceService.getSignedPdfUrl(
      req.loggedInUser,
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
    userId: req.loggedInUser.userId,
    invoiceId: req.params.id
  });
};

exports.deleteInvoice = async (req, res) => {
  try {
    const user = req.loggedInUser;
    const id = req.params.id;

    const result = await invoiceService.deleteInvoice(user, id);

    return res.json({
      success: true,
      data: result
    });
  } catch (err) {
    console.error('Error in deleteInvoice:', err);
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
};

exports.exportInvoices = async (req, res) => {
  try {
    const { startDate, endDate, format = "csv", includeItems } = req.query;

    const includeItemsBool = includeItems === "true";

    const file = await invoiceService.exportInvoices(
      req.loggedInUser,
      startDate,
      endDate,
      format,
      includeItemsBool
    );

    if (format === "excel") {
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        "attachment; filename=invoices.xlsx"
      );
      return res.send(file);
    }

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=invoices.csv"
    );

    return res.send(file);

  } catch (err) {
    console.error("Export Invoice Error:", err);
    res.status(500).json({ error: err.message });
  }
};
