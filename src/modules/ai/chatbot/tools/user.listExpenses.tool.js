const getExpenses = tool(
  async ({ orgId, category, limit = 10 }) => {
    return prisma.expenseBill.findMany({
      where: {
        orgId: BigInt(orgId),
        ...(category ? { category } : {}),
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
      },
    });
  },
  {
    name: "getExpenses",
    description: `
Fetch expense list.
Use when user asks:
- list expenses
- recent expenses
- expenses by category
`,
    schema: {
      type: "object",
      properties: {
        orgId: { type: "string" },
        category: { type: "string" },
        limit: { type: "number" },
      },
      required: ["orgId"],
    },
  }
);

module.exports = { getExpenses };
