const { tool } = require("@langchain/core/tools");
const prisma = require("../../../../config/database");

const listAllUserExpenseItems = tool(
  async (_, config) => {
    const userId = config?.configurable?.context?.userId;

    if (!userId) {
      throw new Error("userId missing from context");
    }

    const items = await prisma.expenseBillItem.findMany({
      where: {
        expense: {
          createdById: BigInt(userId),
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        itemName: true,
        quantity: true,
        unitType: true,
        unitPrice: true,
        taxRate: true,
        totalPrice: true,
        expense: {
          select: {
            id: true,
            merchant: true,
            expenseDate: true,
            category: true,
            paymentMethod: true,
          },
        },
      },
    });

    return {
      count: items.length,
      items,
    };
  },
  {
    name: "ListAllUserExpenseItems",
    description: `
Fetch all expense items across all expenses 
for the authenticated user.

Use when user asks:
- show all my expense items
- list all purchased items
- what expenses did I incur
- breakdown of all expense items
- show count of expense items
- You need to return response in markdown format with appropriate headings, bullet points, line breaks i.e <br>,tables, etc. to make it easy to read, make sure all the markdown syntax is correct and properly rendered.
`,
    schema: {
      type: "object",
      properties: {},
    },
  }
);

module.exports = { listAllUserExpenseItems };
