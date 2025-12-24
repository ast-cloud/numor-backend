const Joi = require("joi");

const registerSchema = Joi.object({
  user: Joi.object({
    name: Joi.string().required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    phone: Joi.string().optional()
  }).required(),

  organization: Joi.object({
    name: Joi.string().required(),
    email: Joi.string().email().required(),
    phone: Joi.string().optional(),
    address: Joi.string().optional(),
    gstin: Joi.string().optional()
  }).required()
});


module.exports = {
  registerSchema
};
