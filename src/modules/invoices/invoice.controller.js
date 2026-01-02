// invoice.controller.js
const { ca } = require('zod/locales');
const invoiceService = require('./invoice.service');


exports.previewInvoice = async function (req, res) {
  const filePath = req.file.path;
  const result = await invoiceService.previewInvoiceAI(filePath);

  res.json({
    success: true,
    data: result,
  });
}


exports.previewOCR = async function (req, res) {
  try {
    const filePath = req.file.path;

    const preview = await invoiceService.previewInvoiceOCR(filePath);

    res.json({ success: true, data: preview });
  } catch (err) {
    console.log('Error in previewOCR:', err);
    res.status(500).json({ success: false, message: err.message });
  }
}

exports.confirmOCR = async function (req, res) {
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

exports.listInvoices = async function(req, res){
  try{
    const {page, limit} = req.query;
    const user = req.user;
    const invoices = await invoiceService.listInvoices(user, Number(page), Number(limit));
    res.json({success: true, data: invoices});
  } catch(err){
    console.error('Error in listInvoices:', err);
    res.status(500).json({success: false, message: err.message});
  }
}

exports.listInvoiceProduct = async function(req, res){    
  try{
    const {page, limit} = req.query;
    const products = await invoiceService.listInvoiceProducts(req.params.id, Number(page), Number(limit));
    res.json({success: true, data: products});
  } catch(err){
    console.error('Error in listInvoiceProduct:', err);
    res.status(500).json({success: false, message: err.message});
  }
}