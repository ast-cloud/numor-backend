/**
 * ZodError -> { field, message } pairs a form can render.
 *
 * Shared so every module answers a validation failure in the same shape; the
 * frontend reads `errors[].field` to mark the offending input.
 */
exports.formatZodError = (err) => ({
  success: false,
  message: 'Invalid input',
  errors: err.issues.map((issue) => ({
    field: issue.path.join('.') || '(body)',
    message: issue.message,
  })),
});
