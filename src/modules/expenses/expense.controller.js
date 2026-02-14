// expense.controller.js
const { ca } = require('zod/locales');
const expenseService = require('./expense.service');

exports.parseExpense = async function (req, res) {
  // const filePath = req.file.path;
  const result = await expenseService.previewExpenseAI(req.file);

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
    const user = req.user;
    const expense = await expenseService.saveExpenseFromPreview(user, payload);
    res.json({ success: true, expense });
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


exports.getExpense = async (req, res) => {
  try {
    const expense = await expenseService.getExpense(req.user, req.params.id);
    return res.json({
      success: true,
      data: expense
    });
  } catch (err) {
    console.error('Error in getexpense:', err);
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
};

exports.listExpenseItems = async function(req, res){    
  try{
    const {page, limit} = req.query;
    const products = await expenseService.listExpenseItems(req.params.id, Number(page), Number(limit));
    res.json({success: true, data: products});
  } catch(err){
    console.error('Error in listExpenseItems:', err);
    res.status(500).json({success: false, message: err.message});
  }
}

exports.updateExpense = async function (req, res) {
  try {
    const payload = req.body;
    const user = req.user;
    const id = BigInt(req.params.id);

    const expense = await expenseService.updateExpense(user, id, payload);

    return res.json({
      success: true,
      data: expense
    });
  } catch (err) {
    console.error('Error in updateExpense:', err);
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
};

exports.deleteExpense = async (req, res) => {
  try {
    const user = req.user;
    const id = req.params.id;

    const result = await expenseService.deleteExpense(user, id);

    return res.json({
      success: true,
      data: result
    });
  } catch (err) {
    console.error('Error in deleteExpense:', err);
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
};
