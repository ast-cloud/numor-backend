const { tool } = require("@langchain/core/tools");
const prisma = require("../../../../config/database");

const listInvoiceItems = tool(
  async ({ invoiceNumber }, config) => {
    const userId = config.config.configurable.context.userId;

    if (!userId) {
      throw new Error("userId missing from context");
    }

    if (!invoiceNumber) {
      throw new Error("invoiceNumber is required");
    }
    // Ensure invoice belongs to the current user
    const invoice = await prisma.invoiceBill.findFirst({
      where: {
        invoiceNumber: invoiceNumber,
        createdById: BigInt(userId),
      },
      select: { id: true },
    });

    if (!invoice) {
      throw new Error("Invoice not found or access denied");
    }

    const items = await prisma.invoiceBillItem.findMany({
      where: {
        invoiceId: invoice.id,
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
    name: "ListInvoiceItems",
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
        invoiceNumber: {   // ✅ MATCH FUNCTION PARAM
          type: "string",
          description: "Visible invoice number (e.g., INV-1001XYZ)",
        },
      },
      required: ["invoiceNumber"], // ✅ MATCH
    },
  }
);

module.exports = { listInvoiceItems };
