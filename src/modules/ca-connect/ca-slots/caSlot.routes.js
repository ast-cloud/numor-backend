const router = require('express').Router();
const controller = require('./caSlot.controller');
const authenticate = require('../../../middlewares/auth.middleware');
const role = require('../../../middlewares/role.middleware');

// CA creates slots
router.post(
    '/slots',
    authenticate,
    role('CA_USER'),
    controller.createSlots
);

// Get slots for users
router.get(
    '/:caProfileId/slots',
    authenticate,
    controller.getSlotsByDate
);

// CA blocks a slot
router.patch(
    '/:slotId/block',
    authenticate,
    controller.blockSlot
);

module.exports = router;
