const router = require('express').Router();
const controller = require('./auth.controller');
const validate = require('../../middlewares/validate.middleware');
const { registerSchema } = require('./auth.validator');

router.post(
    '/register', 
    validate(registerSchema), 
    controller.register);
router.post(
    '/login', 
    controller.login);

module.exports = router;
