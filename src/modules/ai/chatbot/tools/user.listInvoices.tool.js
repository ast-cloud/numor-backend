// const { tool } = require("@langchain/core/tools");
const {tool} = require("langchain");
const prisma = require("../../../../config/database");

const getInvoices = tool(
  async ({ limit = 10 }, config) => {
    const userId = config.context.userId;

    if (!userId) {
      throw new Error("userId missing from context");
    }

    const invoices = await prisma.invoiceBill.findMany({
      where: {
        customerId: BigInt(userId),
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
    return JSON.stringify({
      count: invoices.length,
      invoices,
    });
  },
  {
    name: "getInvoices",
//     description: `
// Fetch invoices for the currently authenticated user.
// Use when user asks:
// - Anything about invoices
// - show invoices
// - list invoices
// - recent invoices
// - overdue invoices
// - count invoices
// `,
description:`
Fetch invoices for the authenticated user.
Returns raw invoice data. 
LLM should handle filtering, comparison, and analysis.
You have access to tools that fetch raw data from the database.

IMPORTANT RULES:
- Tools ONLY retrieve data.
- You MUST perform all filtering, comparison, sorting, math, and reasoning yourself.
- Never refuse a request just because a tool does not support filtering.
- Always fetch data first, then reason over it.
`,
    schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["DRAFT", "SENT", "PAID", "OVERDUE"],
        },
        limit: { type: "number" },
      },
    },
  }
);

module.exports = { getInvoices };
