const getCABookings = tool(
  async ({ caProfileId, date }) => {
    return prisma.cABooking.findMany({
      where: {
        caProfileId: BigInt(caProfileId),
        ...(date
          ? {
              scheduledAt: {
                gte: new Date(date + "T00:00:00"),
                lte: new Date(date + "T23:59:59"),
              },
            }
          : {}),
      },
      orderBy: { scheduledAt: "asc" },
      select: {
        bookingCode: true,
        scheduledAt: true,
        durationMinutes: true,
        consultationMode: true,
        status: true,
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  },
  {
    name: "getCABookings",
    description: `
Fetch bookings for a CA profile.
Use when CA asks:
- my bookings
- today’s consultations
`,
    schema: {
      type: "object",
      properties: {
        caProfileId: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["caProfileId"],
    },
  }
);

module.exports = { getCABookings };
