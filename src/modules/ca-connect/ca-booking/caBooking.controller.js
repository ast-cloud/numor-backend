const caBookingService = require('./caBooking.service');

/**
 * Create a new CA booking (Customer)
 * POST /api/ca-bookings
 */
exports.createBooking = async (req, res, next) => {
  try {
    const user = req.user;
    const payload = req.body;

    const booking = await caBookingService.createBooking(
      user,
      payload
    );

    res.status(201).json({
      success: true,
      message: 'Booking initiated successfully',
      data: booking
    });
  } catch (err) {
    next(err);
  }
};
exports.confirmBooking = async (req, res, next) => {
  try {
    const { bookingId } = req.params;
    const booking = await caBookingService.confirmBooking(bookingId);

    res.json({
      success: true,
      message: 'Booking confirmed successfully',
      data: booking
    });
  } catch (err) {
    next(err);
  }
};
//here normal user is need to get its latest booking by booking code
exports.getBookingByCode = async (req, res, next) => {
  try {
    const { bookingCode } = req.params;

    const booking = await caBookingService.getByBookingCode(
      bookingCode,
      req.user
    );

    res.json({
      success: true,
      data: booking
    });
  } catch (err) {
    next(err);
  }
};

/**
 * List bookings of logged-in user (Customer)
 * GET /api/ca-bookings/me
 */
exports.listMyBookings = async (req, res, next) => {
  try {
    user = req.user;
    const bookings = await caBookingService.listUserBookings(user);

    res.json({
      success: true,
      data: bookings
    });
  } catch (err) {
    next(err);
  }
};

/**
 * List bookings for CA (CA dashboard)
 * GET /api/ca-bookings/ca
 */
exports.listCABookings = async (req, res, next) => {
  try {
    const CA = req.user;
    const bookings = await caBookingService.listCABookings(CA);

    res.json({
      success: true,
      data: bookings
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Cancel booking (Customer)
 * PUT /api/ca-bookings/:bookingCode/cancel
 */
exports.cancelBooking = async (req, res, next) => {
  try {
    const { bookingCode } = req.params;

    await caBookingService.cancelBooking(
      bookingCode,
      req.user.id
    );

    res.json({
      success: true,
      message: 'Booking cancelled successfully'
    });
  } catch (err) {
    next(err);
  }
};
