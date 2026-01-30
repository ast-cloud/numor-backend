const { tool } = require("@langchain/core/tools");
const prisma = require("../../../../config/database");

const fetchCAReviews = tool(
  async ({ caProfileId, limit = 50 }, config) => {
    const { role, userId } = config.context;

    let whereClause = {
      isVisible: true,
    };

    // 🧠 Case 1: CA user → fetch reviews ABOUT them
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

    // 🧠 Case 2: SME user + CA specified
    if (role === "SME_USER" && caProfileId) {
      whereClause.caProfileId = BigInt(caProfileId);
    }

    // 🧠 Case 3: SME user + no CA specified → ALL CA reviews
    // whereClause unchanged

    const reviews = await prisma.cAReview.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        rating: true,
        comment: true,
        createdAt: true,
        caProfileId: true,
        userId: true,
        bookingId: true,
      },
    });

    return JSON.stringify({
      count: reviews.length,
      reviews,
    });
  },
  {
    name: "fetchCAReviews",
    description: `
Fetch CA reviews.

Behavior:
- CA users → reviews about themselves
- SME users + caProfileId → reviews for that CA
- SME users without caProfileId → reviews for ALL CAs

Returns raw review data.
LLM handles aggregation, rating summary, sentiment, and explanation.
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

module.exports = { fetchCAReviews };
