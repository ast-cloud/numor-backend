const { generateBookingCode } = require('../../../utils/bookingCode');
const prisma = require('../../../config/database');
const dayjs = require('dayjs');
const { sendBookingEmails } = require('../../../services/email.service');
const zoomService = require('../../../services/zoom.service');
const { initiatePhonePePayment } = require('../../../services/phonepe.service');


exports.phonepeWebhook = async (req, res) => {
  const { merchantOrderId, state } = req.body;

  const payment = await prisma.cAPayment.findFirst({
    where: { gatewayOrderId: merchantOrderId },
    include: { booking: true }
  });

  if (!payment) return res.sendStatus(200);

  // 🔒 Idempotency
  if (payment.status === 'SUCCESS') {
    return res.sendStatus(200);
  }

  if (state === 'COMPLETED') {
    await prisma.cAPayment.update({
      where: { id: payment.id },
      data: { status: 'SUCCESS' }
    });

    await caBookingService.confirmBooking(payment.bookingId);
  }

  if (state === 'FAILED') {
    await prisma.$transaction(async (tx) => {
      await tx.cAPayment.update({
        where: { id: payment.id },
        data: { status: 'FAILED' }
      });

      await tx.cASlot.update({
        where: { id: payment.booking.slotId },
        data: { status: 'AVAILABLE', bookingId: null }
      });

      await tx.cABooking.update({
        where: { id: payment.bookingId },
        data: { status: 'PAYMENT_FAILED' }
      });
    });
  }

  res.sendStatus(200);
};

exports.initiatePayment = async (bookingId, user) => {
  const booking = await prisma.cABooking.findUnique({
    where: { id: bookingId },
    include: { payment: true }
  });

  if (!booking) throw new Error('Booking not found');
  if (booking.userId !== user.userId) throw new Error('Unauthorized');

  if (booking.payment)
    throw new Error('Payment already initiated');

  const payment = await prisma.cAPayment.create({
    data: {
      bookingId,
      gateway: 'PHONEPE',
      amount: booking.amount,
      currency: booking.currency,
      status: 'INITIATED'
    }
  });

  const { redirectUrl, merchantOrderId } =
    await initiatePhonePePayment({
      bookingId,
      amount: booking.amount,
      userId: user.userId
    });

  await prisma.cAPayment.update({
    where: { id: payment.id },
    data: { gatewayOrderId: merchantOrderId }
  });

  return { redirectUrl };
};

exports.createBooking = async (user, payload) => {
  console.log('UserPayload is', payload);
  return prisma.$transaction(async (tx) => {
    // 1️⃣ Ensure slot is available
    const slot = await tx.cASlot.findFirst({
      where: {
        id: BigInt(payload.slotId),
        caProfileId: BigInt(payload.caProfileId),
        status: 'AVAILABLE'
      }
    });

    if (!slot) {
      throw new Error('Slot not available');
    }

    const booking = await tx.cABooking.create({
      data: {
        bookingCode: generateBookingCode(),

        userId: user.userId,
        caProfileId: payload.caProfileId,
        slotId: payload.slotId,

        consultationMode: payload.consultationMode,
        scheduledAt: payload.scheduledAt,
        durationMinutes: Math.round(
          (slot.endTime - slot.startTime) / 60000
        ),
        amount: payload.amount,
        currency: payload.currency || 'INR',

        status: 'INITIATED'
      }
    });
    await tx.cASlot.update({
      where: { id: BigInt(payload.slotId) },
      data: {
        status: 'HOLD',
        bookingId: booking.id
      }
    });

    return booking;
  });
}

exports.confirmBooking = async (bookingId) => {
  // 1️⃣ Fetch booking
  const existingBooking = await prisma.cABooking.findUnique({
    where: { id: bookingId },
    include: {
      user: true,
      caProfile: { include: { user: true } },
      slot: true
    }
  });

  if (!existingBooking) throw new Error('Booking not found');
  if (!existingBooking.slot) throw new Error('Slot not linked');

  // 🔒 Idempotency guard
  if (existingBooking.status === 'CONFIRMED') {
    return existingBooking;
  }

  // 2️⃣ Create Zoom meeting (timezone-safe)
  const meeting = await zoomService.createZoomMeeting({
    topic: `Consultation with ${existingBooking.user.name}`,
    startTime: dayjs(existingBooking.slot.startTime)
      .tz('Asia/Kolkata')
      .format(),
    duration: existingBooking.durationMinutes
  });

  // 3️⃣ DB transaction
  const confirmedBooking = await prisma.$transaction(async (tx) => {
    const booking = await tx.cABooking.update({
      where: { id: bookingId },
      data: {
        status: 'CONFIRMED',
        meetingLink: meeting.join_url,
        meetingProvider: 'ZOOM'
      },
      include: {
        user: true,
        caProfile: { include: { user: true } },
        slot: true
      }
    });

    await tx.cASlot.update({
      where: { id: booking.slotId },
      data: { status: 'BOOKED', bookingId }
    });

    return booking;
  });

  // 4️⃣ Emails (async)
  sendBookingEmails(confirmedBooking).catch(err =>
    logger.error('Email sending failed', err)
  );

  return confirmedBooking;
};


// exports.confirmBooking = async (bookingId) => {
//   const booking = await prisma.$transaction(async (tx) => {
//     const booking = await tx.cABooking.update({
//       where: { id: bookingId },
//       data: { status: 'CONFIRMED' },
//       include: {
//         user: true,
//         caProfile: {
//           include: { user: true }
//         }
//       }
//     });
//     if (!booking) throw new Error('Booking not found');

//     const meeting = await zoomService.createZoomMeeting({
//     topic: `Consultation with ${booking.user.name}`,
//     startTime: booking.scheduledAt,
//     duration: booking.durationMinutes
//   });

//     await tx.cASlot.update({
//       where: { bookingId },
//       data: { status: 'BOOKED' }
//     });
//     // ✅ Fire-and-forget AFTER transaction
//     sendBookingEmails(booking);
//     return booking;
//   });
// };
/**
 * Get booking by bookingCode
 * Accessible by:
 * - Booking owner (USER)
 * - Assigned CA
 */
exports.getByBookingCode = async (bookingCode, user) => {
  const booking = await prisma.cABooking.findUnique({
    where: { bookingCode },
    include: {
      caProfile: {
        include: {
          user: {
            select: { id: true, name: true, email: true }
          }
        }
      },
      user: {
        select: { id: true, name: true, email: true }
      },
      payment: true,
      review: true
    }
  });

  if (!booking) {
    throw new Error('Booking not found');
  }

  // console.log(booking);

  // const isCustomer = booking.userId === user.userId;

  // if (!isCustomer) {
  //   throw new Error('Unauthorized access to booking');
  // }

  return booking;
};

/**
 * List bookings for logged-in USER (Customer)
 */
exports.listUserBookings = async (user) => {
  return prisma.cABooking.findMany({
    where: { userId: user.userId },
    orderBy: { scheduledAt: 'desc' },
    include: {
      caProfile: {
        select: {
          id: true,
          hourlyFee: true,
          user: {
            select: { name: true }
          }
        }
      },
      payment: true,
      review: true
    }
  });
};

/**
 * List bookings for logged-in CA-- from CA profile with help of its userID we fetch its ID and then fetch bookings with that ID in caBooking
 */
exports.listCABookings = async (CA) => {
  const caProfile = await prisma.cAProfile.findUnique({
    where: { userId: CA.userId }
  });

  if (!caProfile) {
    throw new Error('CA profile not found');
  }

  return prisma.cABooking.findMany({
    where: { caProfileId: caProfile.id },
    orderBy: { scheduledAt: 'desc' },
    include: {
      user: {
        select: { id: true, name: true, email: true }
      },
      payment: true,
      review: true
    }
  });
};

/**
 * Cancel booking (Customer only)
 */
exports.cancelBooking = async (bookingCode, userId) => {
  const booking = await prisma.cABooking.findUnique({
    where: { bookingCode }
  });

  if (!booking) {
    throw new Error('Booking not found');
  }

  if (booking.userId !== userId) {
    throw new Error('You can cancel only your own bookings');
  }

  if (
    booking.status === BookingStatus.CANCELLED ||
    booking.status === BookingStatus.COMPLETED
  ) {
    throw new Error('Booking cannot be cancelled');
  }

  return prisma.cABooking.update({
    where: { bookingCode },
    data: {
      status: BookingStatus.CANCELLED
    }
  });
};
