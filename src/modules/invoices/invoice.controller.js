// invoice.controller.js
const { ZodError } = require('zod');
const invoiceService = require('./invoice.service');
const {
  createInvoiceSchema,
  updateInvoiceSchema,
  invoiceIdParamSchema,
  finalizeInvoiceQuerySchema,
  setPaymentStatusSchema,
  cloneInvoiceSchema,
  listInvoicesQuerySchema,
  listInvoiceItemsQuerySchema,
  exportInvoicesQuerySchema,
  formatZodError,
} = require('./invoice.validator');

/** Single error exit: ZodError -> 400 with field names, anything else -> status. */
const fail = (res, err, context, status = 400) => {
  if (err instanceof ZodError) {
    return res.status(400).json(formatZodError(err));
  }

  console.error(`Error in ${context}:`, err);
  return res.status(status).json({ success: false, message: err.message });
};

exports.previewInvoice = async function (req, res) {
  // const filePath = req.file.path;
  const result = await invoiceService.previewInvoiceAI(req.file);

  res.json({
    success: true,
    data: result,
  });
}

exports.confirmAndSaveInvoice = async function (req, res) {
  try {
    const payload = req.body;
    const loggedInUser = req.loggedInUser; // from auth middleware

    const invoice = await invoiceService.saveInvoiceFromPreview(loggedInUser, payload);

    res.json({ success: true, invoice });
  } catch (err) {
    return fail(res, err, 'confirmAndSaveInvoice');
  }
};

exports.listInvoices = async function (req, res) {
  try {
    const { page, limit, startDate, endDate } = listInvoicesQuerySchema.parse(req.query);

    const invoices = await invoiceService.listInvoices(
      req.loggedInUser,
      page,
      limit,
      startDate,
      endDate
    );

    res.json({ success: true, data: invoices });
  } catch (err) {
    return fail(res, err, 'listInvoices', 500);
  }
}

exports.listInvoiceProduct = async function (req, res) {
  try {
    const { id } = invoiceIdParamSchema.parse(req.params);
    const { page, limit } = listInvoiceItemsQuerySchema.parse(req.query);

    const products = await invoiceService.listInvoiceProducts(id, page, limit);

    res.json({ success: true, data: products });
  } catch (err) {
    return fail(res, err, 'listInvoiceProduct', 500);
  }
}

// PATCH /:id - edits contents only; never touches the payment lifecycle.
exports.updateInvoice = async function (req, res) {
  try {
    const { id } = invoiceIdParamSchema.parse(req.params);
    const payload = updateInvoiceSchema.parse(req.body);

    const invoice = await invoiceService.updateInvoice(req.loggedInUser, id, payload);

    return res.json({ success: true, data: invoice });
  } catch (err) {
    return fail(res, err, 'updateInvoice');
  }
};

// POST / - creates a draft. Issuing is a separate POST /:id/finalize, so the
// client holds the id before any PDF work starts. idempotencyKey covers the one
// gap that leaves: a lost response before the id arrives.
exports.createInvoice = async function (req, res) {
  try {
    const { idempotencyKey, ...payload } = createInvoiceSchema.parse(req.body);

    const invoice = await invoiceService.createInvoice(req.loggedInUser, payload, {
      idempotencyKey,
    });

    return res.status(201).json({ success: true, data: invoice });
  } catch (err) {
    return fail(res, err, 'createInvoice');
  }
};

// POST /:id/clone - copies an invoice's contents into a new draft.
exports.cloneInvoiceAsDraft = async function (req, res) {
  try {
    const { id } = invoiceIdParamSchema.parse(req.params);
    const { idempotencyKey } = cloneInvoiceSchema.parse(req.body);

    const invoice = await invoiceService.cloneInvoiceAsDraft(req.loggedInUser, id, { idempotencyKey });

    return res.status(201).json({ success: true, data: invoice });
  } catch (err) {
    return fail(res, err, 'cloneInvoiceAsDraft');
  }
};

// POST /:id/finalize - issues a draft; idempotent, so it doubles as the retry.
exports.finalizeInvoice = async function (req, res) {
  try {
    const { id } = invoiceIdParamSchema.parse(req.params);
    const { sendEmail } = finalizeInvoiceQuerySchema.parse(req.query);

    const invoice = await invoiceService.finalizeInvoice(req.loggedInUser, id, { sendEmail });

    return res.json({ success: true, data: invoice });
  } catch (err) {
    return fail(res, err, 'finalizeInvoice');
  }
};

// PATCH /:id/payment-status - marks an invoice PAID/UNPAID/etc.
exports.setPaymentStatus = async function (req, res) {
  try {
    const { id } = invoiceIdParamSchema.parse(req.params);
    const { status } = setPaymentStatusSchema.parse(req.body);

    const invoice = await invoiceService.setPaymentStatus(req.loggedInUser, id, status);

    return res.json({ success: true, data: invoice });
  } catch (err) {
    return fail(res, err, 'setPaymentStatus');
  }
};

// POST /:id/resend-email - the only path allowed to override at-most-once: a
// person is asserting the mail never arrived.
exports.resendInvoiceEmail = async function (req, res) {
  try {
    const { id } = invoiceIdParamSchema.parse(req.params);

    const invoice = await invoiceService.resendInvoiceEmail(req.loggedInUser, id);

    return res.json({ success: true, data: invoice });
  } catch (err) {
    return fail(res, err, 'resendInvoiceEmail');
  }
};

// GET /:id/status - cheap poller for the row badge; getInvoice() is too heavy.
exports.getInvoiceStatus = async function (req, res) {
  try {
    const { id } = invoiceIdParamSchema.parse(req.params);

    const status = await invoiceService.getInvoiceStatus(req.loggedInUser, id);

    return res.json({ success: true, data: status });
  } catch (err) {
    return fail(res, err, 'getInvoiceStatus');
  }
};

exports.getInvoice = async (req, res) => {
  try {
    const { id } = invoiceIdParamSchema.parse(req.params);

    const invoice = await invoiceService.getInvoice(req.loggedInUser, id);

    return res.json({ success: true, data: invoice });
  } catch (err) {
    return fail(res, err, 'getInvoice');
  }
};

exports.getInvoicePdf = async (req, res) => {
  try {
    const { id } = invoiceIdParamSchema.parse(req.params);

    const result = await invoiceService.getSignedPdfUrl(req.loggedInUser, id);

    // Map status to HTTP status code
    const statusMap = {
      'INVOICE_NOT_FOUND': 404,
      'NOT_STARTED': 202,
      'QUEUED': 202,
      'PROCESSING': 202,
      'READY': 200,
      'FAILED': 500,
      'NOT_GENERATED': 500
    };

    const httpStatus = statusMap[result.status] || 500;
    return res.status(httpStatus).json(result);
  } catch (err) {
    return fail(res, err, 'getInvoicePdf', err.statusCode || 500);
  }
};

exports.streamInvoicePdfStatus = (req, res) => {
  // Org-scoped: the stream re-reads the invoice on every tick.
  invoiceService.openStream({
    req,
    res,
    orgId: req.loggedInUser.orgId,
    invoiceId: req.params.id
  });
};

exports.deleteInvoice = async (req, res) => {
  try {
    const { id } = invoiceIdParamSchema.parse(req.params);

    const result = await invoiceService.deleteInvoice(req.loggedInUser, id);

    return res.json({ success: true, data: result });
  } catch (err) {
    return fail(res, err, 'deleteInvoice');
  }
};

exports.exportInvoices = async (req, res) => {
  try {
    const { startDate, endDate, format, includeItems } =
      exportInvoicesQuerySchema.parse(req.query);

    const file = await invoiceService.exportInvoices(
      req.loggedInUser,
      startDate,
      endDate,
      format,
      includeItems
    );

    if (format === "excel") {
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        "attachment; filename=invoices.xlsx"
      );
      return res.send(file);
    }

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=invoices.csv"
    );

    return res.send(file);
  } catch (err) {
    return fail(res, err, 'exportInvoices', 500);
  }
};
