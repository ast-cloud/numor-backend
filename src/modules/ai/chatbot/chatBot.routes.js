const router = require('express').Router();
const auth = require('../../../middlewares/auth.middleware');
const controller = require('./chatBot.controller');

router.post("/chat", auth, controller.chat);

module.exports = router;