const router = require('express').Router();
const auth = require('../../middlewares/auth.middleware');
const upload = require('../../config/upload');
const controller = require('./invoice.controller');

// router.post(
//   '/ocr/uploadInvoice',
//   auth,
//   upload.single('file'),
//   controller.previewOCR
// );

router.post(
  '/parseInvoice',
  auth,
  upload.single('file'),
  controller.previewInvoice
);

router.post(
  '/saveInvoice',
  auth,
  controller.confirmAndSaveInvoice
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

router.post(
  '/createInvoice',
  auth,
  controller.confirmAndCreateInvoice
)

router.get(
  '/:id', 
  auth, 
  controller.getInvoice
);

router.get(
  '/:id/pdf',
  auth, 
  controller.getInvoicePdf
);

router.get(
  '/:id/pdf/stream',
  auth,
  controller.streamInvoicePdfStatus
)

module.exports = router;
