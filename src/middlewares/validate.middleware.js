module.exports = (schema) => (req, res, next) => {
  const errors = [];

  if (schema.body) {
    const { error } = schema.body.validate(req.body, {
      abortEarly: false,
      allowUnknown: false,
    });
    if (error) errors.push(error.message);
  }

  if (schema.params) {
    const { error } = schema.params.validate(req.params);
    if (error) errors.push(error.message);
  }

  if (schema.query) {
    const { error } = schema.query.validate(req.query);
    if (error) errors.push(error.message);
  }

  if (errors.length) {
    return res.status(400).json({
      success: false,
      message: 'Invalid input',
      errors,
    });
  }

  next();
};
