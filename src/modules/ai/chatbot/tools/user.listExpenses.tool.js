const { tool } = require("@langchain/core/tools");
const prisma = require("../../../../config/database");

const getExpenses = tool(
  async ({ limit = 50 }, config) => {
    const userId = config.config.configurable.context.userId;

    if (!userId) {
      throw new Error("Missing userId in context");
    }

    const expenses = await prisma.expenseBill.findMany({
      where: {
        ...(userId ? { createdById: BigInt(userId) } : {}),
      },
      orderBy: { expenseDate: "desc" },
      take: limit,
      select: {
        id: true,
        merchant: true,
        expenseDate: true,
        totalAmount: true,
        category: true,
        paymentMethod: true,
        ocrExtracted: true,
        ocrConfidence: true,
      },
    });

    return JSON.stringify(expenses);
  },
  {
    name: "GetExpenses",
    description: `
Fetch raw expense data for the authenticated user or organization.
Do NOT apply business logic or filters.
LLM must perform all filtering, grouping, comparisons, and analysis.
- You need to return response in markdown format with appropriate headings, bullet points, line breaks i.e <br>,tables, etc. to make it easy to read, make sure all the markdown syntax is correct and properly rendered.
`,
    schema: {
      type: "object",
      properties: {
        limit: { type: "number" },
      },
    },
  }
);

module.exports = { getExpenses };
