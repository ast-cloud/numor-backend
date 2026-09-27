const { tool } = require("@langchain/core/tools");
const prisma = require("../../../../config/database");

const getTotalInvoiceTax = tool(
  async (_, config) => {
    const userId = config?.configurable?.context?.userId;

    if (!userId) {
      throw new Error("userId missing from context");
    }

    const result = await prisma.$queryRaw`
      SELECT COALESCE(SUM((i."totalPrice" * i."taxRate") / 100), 0) AS total_tax
      FROM invoice_bill_items i
      JOIN invoice_bills b ON b.id = i."invoiceId"
      WHERE b."createdById" = ${BigInt(userId)}
    `;

    return {
      totalTax: Number(result[0].total_tax).toFixed(2),
    };
  },
  {
    name: "GetTotalInvoiceTax",
    description: `
Calculate total tax across all invoice items 
for the authenticated user.

Use when user asks:
- total tax
- how much tax do I owe
- GST total
- total tax on invoices
`,
    schema: {
      type: "object",
      properties: {},
    },
  }
);

module.exports = { getTotalInvoiceTax };