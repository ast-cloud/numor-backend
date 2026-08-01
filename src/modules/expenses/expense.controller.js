// expense.controller.js
const { ca } = require('zod/locales');
const expenseService = require('./expense.service');

exports.parseExpense = async function (req, res) {
  // const filePath = req.file.path;
  try {

  const result = await expenseService.previewExpenseAI(req.file);
  console.log('Parsed Expense Result:', result);
  res.json({
    success: true,
    data: result,
  });
  }
  catch (err) {
    console.log('Error in prase Expense:', err);
    res.status(500).json({ success: false, message: err.message });
  }

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
    const user = req.loggedInUser;
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

exports.listExpenses = async function (req, res) {
  try {
    const { limit, page, startDate, endDate } = req.query;
    const user = req.loggedInUser;
    const expenses = await expenseService.listExpenses(user, Number(page), Number(limit), startDate, endDate);
    res.json({ success: true, data: expenses });
  } catch (err) {
    console.error('Error in listExpenses:', err);
    res.status(500).json({ success: false, message: err.message });
  }
}


exports.getExpense = async (req, res) => {
  try {
    const expense = await expenseService.getExpense(req.loggedInUser, req.params.id);
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

exports.listExpenseItems = async function (req, res) {
  try {
    const { page, limit } = req.query;
    const products = await expenseService.listExpenseItems(req.params.id, Number(page), Number(limit));
    res.json({ success: true, data: products });
  } catch (err) {
    console.error('Error in listExpenseItems:', err);
    res.status(500).json({ success: false, message: err.message });
  }
}

exports.updateExpense = async function (req, res) {
  try {
    const payload = req.body;
    const user = req.loggedInUser;
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
    const user = req.loggedInUser;
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

exports.getExpenseReceipt = async (req, res) => {
  try {
    const result = await expenseService.getSignedUrl(
      req.loggedInUser,
      req.params.id
    );

    // Map status to HTTP status code
    const statusMap = {
      'EXPENSE_NOT_FOUND': 404,
      'READY': 200,
      'FAILED': 500,
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

exports.exportExpenses = async (req, res) => {
  try {
    const { startDate, endDate, format = "csv", includeItems } = req.query;

    const includeItemsBool = includeItems === "true";

    const file = await expenseService.exportExpenses(
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
      res.setHeader("Content-Disposition", "attachment; filename=expenses.xlsx");

      return res.send(file);
    }

    // CSV
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=expenses.csv");

    return res.send(file);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
