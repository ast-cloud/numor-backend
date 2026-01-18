const router = require('express').Router();
const authenticate  = require('../../../middlewares/auth.middleware');
const role = require('../../../middlewares/role.middleware');
const controller = require('./caBooking.controller');

router.post(
  '/',
  authenticate,
  role('SME_USER'),
  controller.createBooking
);

router.post(
  '/:bookingId/confirm',
  authenticate,
  role('SME_USER'),
  controller.confirmBooking
);

router.get(
  '/me',
  authenticate,
  role('SME_USER'),
  controller.listMyBookings
);

router.get(
  '/ca',
  authenticate,
  role('CA_USER'),
  controller.listCABookings
);

//for CA
router.get(
  '/:bookingCode',
  authenticate,
  controller.getBookingByCode
);

router.put(
  '/:bookingCode/cancel',
  authenticate,
  role('SME_USER'),
  controller.cancelBooking
);

module.exports = router;
