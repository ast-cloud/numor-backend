const { tool } = require("@langchain/core/tools");
const prisma = require("../../../../config/database");

const fetchCABookings = tool(
  async (
    { status, fromDate, toDate, limit = 50 },
    config
  ) => {
    const { role, userId } = config.context;

    let whereClause = {};

    // 🧠 SME USER → bookings created by them
    if (role === "SME_USER") {
      whereClause.userId = BigInt(userId);
    }

    // 🧠 CA USER → bookings assigned to their CA profile
    if (role === "CA_USER") {
      const caProfile = await prisma.cAProfile.findUnique({
        where: { userId: BigInt(userId) },
        select: { id: true },
      });

      if (!caProfile) {
        throw new Error("CA profile not found");
      }

      whereClause.caProfileId = caProfile.id;
    }

    // 🔍 Optional filters
    if (status) {
      whereClause.status = status;
    }

    if (fromDate || toDate) {
      whereClause.scheduledAt = {
        ...(fromDate ? { gte: new Date(fromDate) } : {}),
        ...(toDate ? { lte: new Date(toDate) } : {}),
      };
    }

    const bookings = await prisma.cABooking.findMany({
      where: whereClause,
      orderBy: { scheduledAt: "asc" },
      take: limit,
      select: {
        id: true,
        bookingCode: true,
        scheduledAt: true,
        durationMinutes: true,
        consultationMode: true,
        meetingLink: true,
        meetingProvider: true,
        amount: true,
        currency: true,
        status: true,

        userId: true,
        caProfileId: true,
        slotId: true,

        createdAt: true,
      },
    });

    return JSON.stringify({
      count: bookings.length,
      bookings,
    });
  },
  {
    name: "fetchCABookings",
    description: `
Fetch CA bookings.

Behavior:
- SME users → their own bookings
- CA users → bookings assigned to them
- Supports filtering by status and date range

Returns raw booking data.
LLM handles grouping, status summaries, and user-friendly responses.
`,
    schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["INITIATED", "CONFIRMED", "COMPLETED", "CANCELLED"],
        },
        fromDate: {
          type: "string",
          description: "ISO date string (start range)",
        },
        toDate: {
          type: "string",
          description: "ISO date string (end range)",
        },
        limit: {
          type: "number",
        },
      },
    },
  }
);

module.exports = { fetchCABookings };
