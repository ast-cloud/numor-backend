const { tool } = require("@langchain/core/tools");
const prisma = require("../../../../config/database");

const getCAReviews = tool(
  async ({ caProfileId, limit = 10 }) => {
    return prisma.cAReview.findMany({
      where: {
        caProfileId: BigInt(caProfileId),
        isVisible: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: limit,
      select: {
        id: true,
        rating: true,
        comment: true,
        createdAt: true,
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
    name: "getCAReviews",
    description: `
Fetch visible reviews for a CA profile.
Use when user asks about:
- CA reviews
- ratings
- feedback for CA
`,
    schema: {
      type: "object",
      properties: {
        caProfileId: { type: "string" },
        limit: { type: "number" },
      },
      required: ["caProfileId"],
    },
  }
);

module.exports = { getCAReviews };
