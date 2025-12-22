const router = require('express').Router();
const auth = require('../../middlewares/auth.middleware');
const upload = require('../../config/ocr');
const controller = require('./invoice.controller');

router.post(
  '/ocr/uploadInvoice',
  auth,
  upload.single('file'),
  controller.previewOCR
);

router.post(
  '/ocr/saveInvoice',
  auth,
  controller.confirmOCR
)

router.get(
  '/',
  auth,
  controller.listInvoices
)

router.get(
  '/:id/products',
  auth,
  controller.listInvoiceProduct
)


module.exports = router;
