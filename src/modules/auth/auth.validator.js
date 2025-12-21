const Joi = require('joi');

const registerSchema = {
  body: Joi.object({
    name: Joi.string().required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(8).required(),
    userType: Joi.string().valid('INTERNAL', 'EXTERNAL').optional(),
    orgId: Joi.number().required()
  })
};

module.exports = {
  registerSchema
};
