const prisma = require('../../../config/database');

module.exports = async function caContext(user) {
  if (!user.caProfile) {
    return {
      caStatus: "Not onboarded",
      message: "CA Profile is not created yet."
    };
  }
  const bookings = await prisma.cABooking.aggregate({
    where: { caProfileId: user.caProfile.id },
    _count: true,
    _sum: { amount: true }
  });

  return {
    caStatus: user.caProfile.status,
    bookingsSummary: bookings
  };
};
