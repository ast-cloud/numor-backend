const { tool } = require("@langchain/core/tools");
const prisma = require("../../../../config/database");

const getCASlots = tool(
  async ({ caProfileId, date, status }) => {
    return prisma.cASlot.findMany({
      where: {
        caProfileId: BigInt(caProfileId),
        ...(date
          ? {
              date: {
                gte: new Date(date + "T00:00:00.000Z"),
                lt: new Date(date + "T23:59:59.999Z"),
              },
            }
          : {}),
        ...(status ? { status } : {}),
      },
      orderBy: {
        startTime: "asc",
      },
      select: {
        id: true,
        date: true,
        startTime: true,
        endTime: true,
        status: true,
        bookingId: true,
      },
    });
  },
  {
    name: "getCASlots",
    description: `
Fetch CA time slots.
Use when user asks about:
- available CA slots
- booked slots
- CA schedule for a date
`,
    schema: {
      type: "object",
      properties: {
        caProfileId: {
          type: "string",
          description: "CA profile ID",
        },
        date: {
          type: "string",
          description: "Date in YYYY-MM-DD format",
        },
        status: {
          type: "string",
          enum: ["AVAILABLE", "BOOKED", "CANCELLED"],
        },
      },
      required: ["caProfileId"],
    },
  }
);

module.exports = { getCASlots };
