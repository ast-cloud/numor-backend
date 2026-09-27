const express = require("express");
const internalController = require("../workers/qstash.controller");

const router = express.Router();

router.post(
  "/process-invoice-pdf",
  internalController.processInvoicePdf
);

router.post(
  "/invoice-pdf-failure",
  internalController.processInvoicePdfFailure
);

router.post(
  "/sweep-invoice-pdf",
  internalController.sweepInvoicePdfJobs
);

module.exports = router;
