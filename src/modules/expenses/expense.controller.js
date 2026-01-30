// expense.controller.js
const { ca } = require('zod/locales');
const expenseService = require('./expense.service');

exports.previewExpense = async function (req, res) {
  const filePath = req.file.path;
  const result = await expenseService.previewExpenseAI(filePath);

  res.json({
    success: true,
    data: result,
  });
}

exports.previewOCR = async function (req, res) {
  try {
    const filePath = req.file.path;

    const preview = await expenseService.previewExpenseOCR(filePath);
    res.json({ success: true, data: preview });
  } catch (err) {
    console.log('Error in previewOCR:', err);
    res.status(500).json({ success: false, message: err.message });
  }
}

exports.confirmExpense = async function (req, res) {
  try {
    const payload = req.body;
    const user = req.user; // from auth middleware

    const invoice = await expenseService.saveExpenseFromPreview(user, payload);

    res.json({ success: true, invoice });
  } catch (err) {
    console.error('Error in confirmExpense:', err);
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};

exports.listExpenses = async function(req, res){
  try{
    const {limit, page} = req.query;
    const user = req.user; 
    const expenses = await expenseService.listExpenses(user, Number(page), Number(limit));
    res.json({success: true, data: expenses});
  } catch(err){
    console.error('Error in listExpenses:', err);
    res.status(500).json({success: false, message: err.message});
  }
}

exports.listExpenseProduct = async function(req, res){    
  try{
    const {page, limit} = req.query;
    const products = await expenseService.listExpenseItems(req.params.id, Number(page), Number(limit));
    res.json({success: true, data: products});
  } catch(err){
    console.error('Error in listExpenseProduct:', err);
    res.status(500).json({success: false, message: err.message});
  }
}