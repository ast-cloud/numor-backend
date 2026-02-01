const { tool } = require("@langchain/core/tools");
const prisma = require("../../../../config/database");

const listInvoiceItems = tool(
  async ({ invoiceId }, config) => {
    const userId = config.config.configurable.context.userId;

    if (!userId) {
      throw new Error("userId missing from context");
    }

    // Ensure invoice belongs to the current user
    const invoice = await prisma.invoiceBill.findFirst({
      where: {
        id: BigInt(invoiceId),
        customerId: BigInt(userId),
      },
      select: { id: true },
    });

    if (!invoice) {
      throw new Error("Invoice not found or access denied");
    }

    const items = await prisma.invoiceBillItem.findMany({
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

    return JSON.stringify({
      count: items.length,
      items,
    });
  },
  {
    name: "listInvoiceItems",
    description: `
Fetch line items for a specific invoice of the authenticated user.
Use when user asks:
- show invoice items
- line items for invoice
- item breakdown
- invoice details
`,
    schema: {
      type: "object",
      properties: {
        invoiceId: {
          type: "string",
          description: "Invoice ID to fetch line items for",
        },
      },
      required: ["invoiceId"],
    },
  }
);

module.exports = { listInvoiceItems };
