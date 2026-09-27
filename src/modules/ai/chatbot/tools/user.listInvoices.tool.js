// const { tool } = require("@langchain/core/tools");
const { tool } = require("@langchain/core/tools");
const prisma = require("../../../../config/database");

const getInvoices = tool(
  async ({ limit = 10, status }, config) => {
    const userId =
      config?.configurable?.context?.userId;

    // if (!userId) {
    //   throw new Error("Missing userId in context");
    // }
    if (!userId) {
      return { error: "User context missing" };
    }

    const where = {
      createdById: BigInt(userId),
      ...(status ? { status } : {}),
    };

    const invoices = await prisma.invoiceBill.findMany({
      where,
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
      },
    });

    return JSON.stringify(invoices);
  },
  {
    name: "getInvoices",
    description: `
Fetch invoices for the authenticated user.
Returns raw invoice data. 
LLM should handle filtering, comparison, and analysis.
Fetch invoices for the currently authenticated user.
You are Numor AI assistant.
You have access to real-time business data via tools.
When user asks about invoices, expenses, bookings, etc.,
ALWAYS call the appropriate tool.
Never say you don't have access to data.
Use when user asks:
- Anything about invoices
- show invoices
- list invoices
- recent invoices
- overdue invoices
- count invoices
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
          enum: ["DRAFT", "UNPAID", "PAID", "OVERDUE"],
        },
        limit: { type: "number" },
      },
    },
  }
);

module.exports = { getInvoices };
