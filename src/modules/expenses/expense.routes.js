const router = require('express').Router();
const auth = require('../../middlewares/auth.middleware');
const upload = require('../../config/ocr');
const controller = require('./expense.controller');

router.post(
  '/ocr/uploadExpense',
  auth,
  upload.single('file'),
  controller.previewOCR
);

router.post(
  '/ocr/saveExpense',
  auth,
  controller.confirmOCR
)

router.get(
  '/',
  auth,
  controller.listExpenses
)

router.get(
  '/:id/products',
  auth,
  controller.listExpenseProduct
)


module.exports = router;
