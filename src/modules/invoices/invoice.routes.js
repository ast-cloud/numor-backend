const router = require('express').Router();
const auth = require('../../middlewares/auth.middleware');
const upload = require('../../config/ocr');
const controller = require('./invoice.controller');

router.post(
  '/ocr/preview',
  auth,
  upload.single('file'),
  controller.previewOCR
);

router.post(
  '/ocr/confirm',
  auth,
  controller.confirmOCR
)

module.exports = router;
