const { z } = require('zod');

// Zod schemas for /api/invoices. Controllers .parse() and pass the result on, so
// services validate business rules only - never shape.

// BigInt() throws a bare SyntaxError on non-numeric ids; this makes it a 400.
const idParam = z
  .string()
  .regex(/^\d+$/, 'Invalid invoice id');

// The dialog sends numbers, form posts send strings. Coerce both.
const money = z.coerce.number().finite();

const invoiceItemSchema = z.object({
  name: z.string().min(1, 'Item name is required'),
  description: z.string().optional().nullable(),
  quantity: money.nonnegative().default(1),
  unitType: z.string().optional().default('UNIT'),
  unitPrice: money.nonnegative().default(0),
  taxRate: money.min(0).max(100).default(0),
  itemTotal: money.nonnegative().optional(),
});

const sellerSchema = z.object({
  name: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  phone: z.string().optional().nullable(),
  streetAddress: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  zipCode: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  taxId: z.string().optional().nullable(),
  taxSystem: z.string().optional().nullable(),
  iecCode: z.string().optional().nullable(),
  lutFiled: z.boolean().optional(),
});

const bankDetailsSchema = z.object({
  bankName: z.string().optional().nullable(),
  accountName: z.string().optional().nullable(),
  accountNumber: z.string().optional().nullable(),
  ifsc: z.string().optional().nullable(),
  swift: z.string().optional().nullable(),
});

const customFieldSchema = z.object({
  name: z.string().min(1, 'Custom field name is required'),
  value: z.string(),
});

const shipToSchema = z.object({
  name: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
});

// Shared by create and update. All optional; create adds its own requirements.
const invoiceFields = {
  clientId: z.union([z.string(), z.number()]).optional().nullable(),
  invoiceNumber: z.string().optional(),
  invoiceType: z.string().optional(),

  issueDate: z.coerce.date().optional(),
  dueDate: z.coerce.date().optional(),
  paymentTerms: z.string().optional().nullable(),

  currency: z.string().optional(),
  baseCurrency: z.string().optional(),
  exchangeRate: money.positive().optional(),

  discount: money.nonnegative().optional(),
  shippingCost: money.nonnegative().optional(),
  paidAmount: money.nonnegative().optional(),

  category: z.string().optional(),

  taxType: z.string().optional(),
  placeOfSupply: z.string().optional().nullable(),
  reverseCharge: z.boolean().optional(),
  reverseReason: z.string().optional().nullable(),
  sacCode: z.string().optional().nullable(),
  taxSummary: z.record(z.string(), z.any()).optional().nullable(),

  seller: sellerSchema.optional(),
  shipTo: shipToSchema.optional(),
  countryOfOrigin: z.string().optional().nullable(),
  countryOfDestination: z.string().optional().nullable(),
  incoterms: z.string().optional().nullable(),

  bankDetails: bankDetailsSchema.optional().nullable(),
  paymentLink: z.string().optional().nullable(),
  bankAddress: z.string().optional().nullable(),

  jurisdiction: z.string().optional().nullable(),
  lateFeePolicy: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),

  customFields: z.array(customFieldSchema).optional(),
};

// POST /api/invoices
// idempotencyKey is required: without it a retry is indistinguishable from a new
// invoice, and a lost response would silently create a duplicate.
exports.createInvoiceSchema = z.object({
  ...invoiceFields,
  idempotencyKey: z
    .string({ error: 'idempotencyKey is required' })
    .min(1, 'idempotencyKey is required'),
  items: z.array(invoiceItemSchema).min(1, 'An invoice needs at least one item'),
});

// PATCH /api/invoices/:id
// Omitting items leaves them untouched; an empty array clears them.
exports.updateInvoiceSchema = z.object({
  ...invoiceFields,
  items: z.array(invoiceItemSchema).optional(),
});

// POST /api/invoices/:id/clone
// Same reasoning as create: without a key, a retried clone makes a second copy.
exports.cloneInvoiceSchema = z.object({
  idempotencyKey: z
    .string({ error: 'idempotencyKey is required' })
    .min(1, 'idempotencyKey is required'),
});

exports.invoiceIdParamSchema = z.object({
  id: idParam,
});

// POST /api/invoices/:id/finalize
exports.finalizeInvoiceQuerySchema = z.object({
  // Compared, not coerced: z.coerce.boolean() turns "false" into true.
  sendEmail: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
});

// PATCH /api/invoices/:id/payment-status
// Mirrors the InvoiceStatus enum in schema.prisma - keep in step.
exports.setPaymentStatusSchema = z.object({
  status: z.enum(['DRAFT', 'UNPAID', 'PAID', 'OVERDUE']),
});

// GET /api/invoices
exports.listInvoicesQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

// GET /api/invoices/:id/items
exports.listInvoiceItemsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

// GET /api/invoices/export
exports.exportInvoicesQuerySchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  format: z.enum(['csv', 'excel']).optional().default('csv'),
  includeItems: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
});

/** ZodError -> { field, message } pairs a form can render. */
exports.formatZodError = (err) => ({
  success: false,
  message: 'Invalid input',
  errors: err.issues.map((issue) => ({
    field: issue.path.join('.') || '(body)',
    message: issue.message,
  })),
});
