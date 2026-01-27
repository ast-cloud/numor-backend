const getInvoices = tool(
  async ({ orgId, status, limit = 10 }) => {
    return prisma.invoiceBill.findMany({
      where: {
        orgId: BigInt(orgId),
        ...(status ? { status } : {}),
      },
      orderBy: { issueDate: "desc" },
      take: limit,
      select: {
        id: true,
        invoiceNumber: true,
        issueDate: true,
        dueDate: true,
        status: true,
        totalAmount: true,
        balanceDue: true,
        currency: true,
        buyerName: true,
      },
    });
  },
  {
    name: "getInvoices",
    description: `
Fetch invoice list.
Use when user asks:
- show invoices
- recent invoices
- overdue invoices
`,
    schema: {
      type: "object",
      properties: {
        orgId: { type: "string" },
        status: {
          type: "string",
          enum: ["DRAFT", "SENT", "PAID", "OVERDUE"],
        },
        limit: { type: "number" },
      },
      required: ["orgId"],
    },
  }
);

module.exports = { getInvoices };
