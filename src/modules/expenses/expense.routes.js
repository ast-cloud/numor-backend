const router = require('express').Router();
const auth = require('../../middlewares/auth.middleware');
const upload = require('../../config/upload');
const controller = require('./expense.controller');

// router.post(
//   '/ocr/uploadExpense',
//   auth,
//   upload.single('file'),
//   controller.previewOCR
// );
router.post(
  '/parseExpense',
  auth,
  upload.single('file'),
  controller.parseExpense
);

router.post(
  '/confirmAndSaveExpense',
  auth,
  controller.confirmExpense
)

router.get(
  '/',
  auth,
  controller.listExpenses
)

router.get(
  '/:id', 
  auth, 
  controller.getExpense
);

router.get(
  '/:id/items',
  auth,
  controller.listExpenseItems
)

router.post(
  '/:id/updateExpense',
  auth,
  controller.updateExpense
)

router.delete(
  '/:id',
  auth,
  controller.deleteExpense
)

router.get(
  '/:id/pdf',
  auth, 
  controller.getExpensePdf
);

module.exports = router;
