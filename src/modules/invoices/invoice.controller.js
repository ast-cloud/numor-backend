// invoice.controller.js
const invoiceService = require('./invoice.service');

exports.runOCR = async function (req, res, next) {
  try {
    const invoiceId = req.params.id;
    const filePath = req.file.path;

    const result = await invoiceService.processInvoiceOCR(
      invoiceId,
      filePath
    );

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};
