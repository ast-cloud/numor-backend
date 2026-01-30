const router = require('express').Router();
const auth = require('../../../middlewares/auth.middleware');
const controller = require('./chat.controller');

router.post("/chat", auth, controller.chat);

module.exports = router;
