const { tool } = require("@langchain/core/tools");
const prisma = require("../../../../config/database");

const getInvoiceItems = tool(
  async ({ invoiceId }) => {
    return prisma.invoiceBillItem.findMany({
      where: {
        invoiceId: BigInt(invoiceId),
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        itemName: true,
        description: true,
        quantity: true,
        unitPrice: true,
        taxRate: true,
        totalPrice: true,
      },
    });
  },
  {
    name: "getInvoiceItems",
    description: `
Fetch line items for a specific invoice.
Use when user asks:
- invoice items
- line items
- item breakdown
`,
    schema: {
      type: "object",
      properties: {
        invoiceId: { type: "string" },
      },
      required: ["invoiceId"],
    },
  }
);

module.exports = { getInvoiceItems };
