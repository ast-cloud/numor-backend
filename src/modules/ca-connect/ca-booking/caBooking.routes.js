const router = require('express').Router();
const authenticate  = require('../../../middlewares/auth.middleware');
const role = require('../../../middlewares/role.middleware');
const controller = require('./caBooking.controller');

router.post(
  '/',
  authenticate,
  role('USER'),
  controller.createBooking
);

router.post(
  '/:bookingId/confirm',
  authenticate,
  role('USER'),
  controller.confirmBooking
);

router.get(
  '/me',
  authenticate,
  role('USER'),
  controller.listMyBookings
);

router.get(
  '/ca',
  authenticate,
  role('CA'),
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
  role('USER'),
  controller.cancelBooking
);

module.exports = router;
