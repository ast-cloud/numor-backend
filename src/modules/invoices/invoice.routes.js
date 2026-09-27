const router = require('express').Router();
const auth = require('../../middlewares/auth.middleware');
const {upload} = require('../../config/upload');
const { requirePermission } = require('../../middlewares/permission.middleware');
const controller = require('./invoice.controller');

// Mounted at /api/invoices. "Frontend:" names the wrapper in lib/api/invoices.ts
// and its callers.
//
// ORDERING: literal paths must come before '/:id', or Express matches them as ids.


// router.post('/ocr/upload',
//   auth,
//   upload.single('file'),
//   controller.previewOCR
// );

// Downloads the org's invoices as CSV/Excel. Frontend: no caller.
router.get('/export',
  auth,
  requirePermission('income', 'read'),
  controller.exportInvoices
);

// Extracts invoice fields from a file (OCR/AI). Saves nothing. No caller yet.
router.post('/parse-upload',
  auth,
  requirePermission('income', 'write'),
  upload.single('file'),
  controller.previewInvoice
);

// Lists every invoice for the caller's org.
// Frontend: fetchInvoices() - Income.tsx (invoice table), use-dashboard-data.ts.
router.get('/',
  auth,
  requirePermission('income', 'read'),
  controller.listInvoices
);

// Creates a draft. The only route that creates.
// Frontend: createInvoice() - CreateInvoiceDialog.tsx, both dialog buttons.
router.post('/',
  auth,
  requirePermission('income', 'write'),
  controller.createInvoice
);

// Fetches one invoice with its items and custom fields.
// Frontend: fetchInvoice() - Income.tsx (row expand), CreateInvoiceDialog.tsx (edit mode).
router.get('/:id',
  auth,
  requirePermission('income', 'read'),
  controller.getInvoice
);

// Saves edits. Never changes status or touches the PDF.
// Frontend: updateInvoice() - CreateInvoiceDialog.tsx, editing or retrying.
router.patch('/:id',
  auth,
  requirePermission('income', 'write'),
  controller.updateInvoice
);

// Deletes an invoice and its items.
// Frontend: deleteInvoice() - Income.tsx delete confirmation dialog.
router.delete('/:id',
  auth,
  requirePermission('income', 'write'),
  controller.deleteInvoice
);

// Copies an invoice's contents into a new draft.
// Frontend: cloneInvoiceAsDraft() - Income.tsx row menu "Clone as Draft".
router.post('/:id/clone',
  auth,
  requirePermission('income', 'write'),
  controller.cloneInvoiceAsDraft
);

// Issues a draft; idempotent, so it doubles as the retry.
// Frontend: finalizeInvoice() - CreateInvoiceDialog.tsx, and the row retry.
router.post('/:id/finalize',
  auth,
  requirePermission('income', 'write'),
  controller.finalizeInvoice
);

// Marks an invoice PAID / UNPAID / OVERDUE / DRAFT.
// Frontend: updateInvoiceStatus() - Income.tsx status dropdown.
router.patch('/:id/payment-status',
  auth,
  requirePermission('income', 'write'),
  controller.setPaymentStatus
);

// Paginated line items. Frontend: no caller - items come inline via GET /:id.
router.get('/:id/items',
  auth,
  requirePermission('income', 'read'),
  controller.listInvoiceProduct
);

// Progress poll for the row badge: payment, PDF and email status + signed URL.
// Frontend: fetchInvoiceStatus() - Income.tsx row badge.
router.get('/:id/status',
  auth,
  requirePermission('income', 'read'),
  controller.getInvoiceStatus
);

// Re-sends the invoice email after a failed send.
// Frontend: resendInvoiceEmail() - Income.tsx "Retry sending email".
router.post('/:id/resend-email',
  auth,
  requirePermission('income', 'write'),
  controller.resendInvoiceEmail
);

// Reports pdfStatus, returning a signed download URL once it is READY.
// Frontend: fetchInvoicePdfStatus() - Income.tsx (download), CreateInvoiceDialog.tsx (polling).
router.get('/:id/pdf',
  auth,
  requirePermission('income', 'read'),
  controller.getInvoicePdf
);

// SSE stream of pdfStatus - push alternative to polling. Frontend: no caller.
router.get('/:id/pdf/events',
  auth,
  requirePermission('income', 'read'),
  controller.streamInvoicePdfStatus
);

module.exports = router;
