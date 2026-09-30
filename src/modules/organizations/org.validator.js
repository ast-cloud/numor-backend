const { z } = require('zod');

// Zod schemas for /api/organization. Controllers .parse() and pass the result
// on, so services validate business rules only - never shape.

// BigInt() throws a bare SyntaxError on non-numeric ids; this makes it a 400.
const idParam = z.string().regex(/^\d+$/, 'Invalid payment account id');

/**
 * One bank/payment field. Trimmed, and blank becomes null rather than "" so a
 * cleared field reads as absent everywhere downstream - the invoice template
 * skips null rows but would print an empty label for "".
 */
const detail = z
  .string()
  .trim()
  .max(200, 'Must be 200 characters or fewer')
  .optional()
  .nullable()
  .transform((v) => v || null);

/** The fields that carry actual payment information, nickname aside. */
const DETAIL_FIELDS = [
  'bankName',
  'accountName',
  'accountNumber',
  'ifsc',
  'swift',
  'bankAddress',
];

// POST /payment-accounts and PUT /payment-accounts/:id - same body either way.
exports.paymentAccountSchema = z
  .object({
    // What the user picks from in the invoice dialog. Unique per org, enforced
    // by the database.
    nickname: z
      .string({ error: 'A nickname is required' })
      .trim()
      .min(1, 'A nickname is required')
      .max(60, 'Nickname must be 60 characters or fewer'),

    bankName: detail,
    accountName: detail,
    // IBAN outside India, plain account number within it.
    accountNumber: detail,
    ifsc: detail,
    swift: detail,
    bankAddress: detail,
  })
  // A nickname on its own would populate nothing when picked on an invoice.
  .refine((v) => DETAIL_FIELDS.some((field) => v[field]), {
    message: 'Add at least one payment detail',
  });

// PUT and DELETE /payment-accounts/:id
exports.paymentAccountIdParamSchema = z.object({
  id: idParam,
});

exports.formatZodError = require('../../utils/zodError').formatZodError;
