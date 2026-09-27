const { tool } = require("@langchain/core/tools");
const prisma = require("../../../../config/database");

const listAllUserInvoiceItems = tool(
  async (_, config) => {
    const userId = config?.configurable?.context?.userId;

    if (!userId) {
      throw new Error("userId missing from context");
    }

    const items = await prisma.invoiceBillItem.findMany({
      where: {
        invoice: {
          createdById: BigInt(userId), // 🔐 secure ownership filter
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        itemName: true,
        description: true,
        quantity: true,
        unitType: true,
        unitPrice: true,
        taxRate: true,
        totalPrice: true,
        invoice: {
          select: {
            invoiceNumber: true,
            issueDate: true,
            status: true,
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
    name: "ListAllUserInvoiceItems",
    description: `
Fetch all invoice items across all invoices
for the authenticated user.

Use when user asks:
- show all my invoice items
- list all items across invoices
- what have I billed so far
- show full billing breakdown
- show count of invoice items
`,
    schema: {
      type: "object",
      properties: {},
    },
  }
);

module.exports = { listAllUserInvoiceItems };
