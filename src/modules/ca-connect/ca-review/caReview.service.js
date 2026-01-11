const prisma = require('../../../config/database');
const { BookingStatus } = require('@prisma/client');

/**
 * Create Review
 */
exports.createReview = async (user, payload) => {
  const { bookingId, rating, comment } = payload;

  if (rating < 1 || rating > 5) {
    throw new Error('Rating must be between 1 and 5');
  }

  const booking = await prisma.cABooking.findUnique({
    where: { id: BigInt(bookingId) },
    include: { review: true }
  });

    console.log('Creating review for booking:', booking);

  if (!booking) {
    throw new Error('Booking not found');
  }

  if (booking.userId !== BigInt(user.userId)) {
    throw new Error('You can review only your own booking');
  }

  if (booking.status !== BookingStatus.COMPLETED) {
    throw new Error('Review allowed only after booking is completed');
  }

  if (booking.review) {
    throw new Error('Review already submitted for this booking');
  }

  return prisma.$transaction(async (tx) => {
    // 1. Create review
    const review = await tx.cAReview.create({
      data: {
        bookingId: booking.id,
        caProfileId: booking.caProfileId,
        userId: user.userId,
        rating,
        comment
      }
    });

    // 2. Update CA rating
    const caProfile = await tx.cAProfile.findUnique({
      where: { id: booking.caProfileId }
    });

    const newCount = caProfile.ratingCount + 1;
    const newAvg =
      (
        (Number(caProfile.ratingAvg || 0) * caProfile.ratingCount) +
        rating
      ) / newCount;

    await tx.cAProfile.update({
      where: { id: booking.caProfileId },
      data: {
        ratingAvg: newAvg,
        ratingCount: newCount
      }
    });

    return review;
  });
};

/**
 * Get visible reviews for CA profile
 */
exports.getReviewsForCA = async (caProfileId) => {
  return prisma.cAReview.findMany({
    where: {
      caProfileId,
      isVisible: true
    },
    orderBy: {
      createdAt: 'desc'
    },
    include: {
      user: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });
};
