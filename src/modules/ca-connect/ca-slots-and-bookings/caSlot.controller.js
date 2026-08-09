const service = require('./caSlot.service');
const { google } = require("googleapis");
const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = require("../../../config/env");


exports.createSlots = async (req, res) => {
  try {
    const user = req.loggedInUser;
    const data = req.body;

    const slots = await service.createOrUpdateSlots(user, data);

    res.json({ success: true, slots });
  } catch (error) {
    console.error("Error in createSlots:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Something went wrong"
    });
  }
};

exports.getSlots = async (req, res) => {
  try {
    const requestedCaProfileId = req.params.caProfileId || req.query.caProfileId;
    const { startDate, endDate } = req.query;
    const caProfileId = await service.resolveCaProfileIdForSlots(
      req.loggedInUser,
      requestedCaProfileId
    );

    const slots = await service.getWeeklyAvailableSlots(
      caProfileId,
      startDate,
      endDate
    );

    res.json({ success: true, slots });
  } catch (error) {
    console.error("Error in getSlots:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Something went wrong"
    });
  }
};

exports.createBooking = async (req, res) => {
  try {
    const user = req.loggedInUser;
    const data = req.body;

    const booking = await service.createBooking(user, data);

    res.json({ success: true, booking });
  } catch (error) {
    console.error("Error in createBooking:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Something went wrong"
    });
  }
};

//here normal user is need to get its latest booking by booking code
exports.getBookingByCode = async (req, res, next) => {
  try {
    const { bookingCode } = req.params;

    const booking = await service.getByBookingCode(
      bookingCode,
      req.loggedInUser
    );

    res.json({
      success: true,
      data: booking
    });
  } catch (err) {
    next(err);
  }
};

exports.listMyBookings = async (req, res, next) => {
  try {
    user = req.loggedInUser;
    const bookings = await service.listUserBookings(user);

    res.json({
      success: true,
      data: bookings
    });
  } catch (err) {
    next(err);
  }
};

exports.listCABookings = async (req, res, next) => {
  try {
    const CA = req.loggedInUser;
    const bookings = await service.listCABookings(CA);

    res.json({
      success: true,
      data: bookings
    });
  } catch (err) {
    next(err);
  }
};

exports.getGoogleCalendarAuthUrl = async (req, res) => {
  const { caProfileId } = req.query;

  if (!caProfileId) {
    throw new Error("caProfileId is required");
  }

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/calendar",
      "openid",
      "email",
      "profile"
    ],
    prompt: "consent",
    state: caProfileId,
  });

  res.json({ url });
};
exports.googleCallback = async (req, res) => {
  try {
    const code = req.query.code;
    const caProfileId = req.query.state;

    if (!code) {
      throw new Error("Authorization code missing");
    }

    // 1️⃣ Get tokens
    const { tokens } = await oauth2Client.getToken(code);
    console.log("TOKENS:", tokens);

    // 🔥 2️⃣ Get user info from ID token (BEST WAY)
    const ticket = await oauth2Client.verifyIdToken({
      idToken: tokens.id_token,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    // 3️⃣ Save in DB
    await prisma.cAProfile.update({
      where: { id: BigInt(caProfileId) },
      data: {
        googleAccessToken: tokens.access_token,
        googleRefreshToken: tokens.refresh_token ?? undefined,
        googleTokenExpiry: tokens.expiry_date
          ? new Date(tokens.expiry_date)
          : null,
        googleCalendarEmail: payload.email,
        googleCalendarConnected: true,
      },
    });

    res.send("Google Calendar connected successfully");
  } catch (err) {
    console.error(
      "GOOGLE CALLBACK ERROR:",
      err.response?.data || err.message
    );
    res.status(500).send("Error connecting Google Calendar");
  }
};

const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI
);
