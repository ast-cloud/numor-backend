const express = require("express");
const { verifySignature } = require("@upstash/qstash/nextjs");
const internalController = require("../workers/qstash.controller");

const router = express.Router();

router.post(
  "/process-invoice-pdf",
  internalController.processInvoicePdf
);

module.exports = router;
