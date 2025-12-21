const router = require('express').Router();
const auth = require('../../middlewares/auth.middleware');
const upload = require('../../config/ocr');
const controller = require('./invoice.controller');


console.log('DEBUG TYPES:', {
  auth: typeof auth,
  upload: typeof upload,
  uploadSingle: upload && typeof upload.single,
  runOCR: controller && typeof controller.runOCR,
});

router.post(
  '/:id/ocr',
  auth,
  upload.single('file'),
  controller.runOCR
);

module.exports = router;
