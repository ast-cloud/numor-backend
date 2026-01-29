const { tool } = require("@langchain/core/tools");
const prisma = require("../../../../config/database");

const fetchCASlots = tool(
  async ({ caProfileId, limit = 50 }, config) => {
    const { role, userId } = config.context;

    let whereClause = {};

    // 🧠 Case 1: CA user → fetch own slots
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

    // 🧠 Case 2: SME user explicitly provided CA
    if (role === "SME_USER" && caProfileId) {
      whereClause.caProfileId = BigInt(caProfileId);
    }

    // 🧠 Case 3: SME user + no CA specified → ALL CAs
    // whereClause remains empty → fetch all slots

    const slots = await prisma.cASlot.findMany({
      where: whereClause,
      orderBy: [
        { date: "asc" },
        { startTime: "asc" },
      ],
      take: limit,
      select: {
        id: true,
        date: true,
        startTime: true,
        endTime: true,
        status: true,
        caProfileId: true,
      },
    });

    return JSON.stringify({
      count: slots.length,
      slots,
    });
  },
  {
    name: "fetchCASlots",
    description: `
Fetch CA time slots.

Behavior:
- CA users → fetch their own slots
- SME users + caProfileId → fetch that CA’s slots
- SME users without caProfileId → fetch slots for ALL CAs

Returns raw slot data.
LLM must handle filtering (AVAILABLE), grouping, and explanation.
`,
    schema: {
      type: "object",
      properties: {
        caProfileId: { type: "string" },
        limit: { type: "number" },
      },
    },
  }
);

module.exports = { fetchCASlots };
