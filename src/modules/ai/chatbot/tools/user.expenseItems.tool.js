const getExpenseDetails = tool(
  async ({ expenseId }) => {
    return prisma.expenseBill.findUnique({
      where: { id: BigInt(expenseId) },
      select: {
        merchant: true,
        expenseDate: true,
        totalAmount: true,
        category: true,
        paymentMethod: true,
        receiptUrl: true,
        items: {
          select: {
            itemName: true,
            quantity: true,
            unitPrice: true,
            totalPrice: true,
          },
        },
      },
    });
  },
  {
    name: "getExpenseDetails",
    description: `
Fetch detailed expense including items.
Use only when user explicitly asks for details.
`,
    schema: {
      type: "object",
      properties: {
        expenseId: { type: "string" },
      },
      required: ["expenseId"],
    },
  }
);

module.exports = { getExpenseDetails };
