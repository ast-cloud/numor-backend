const { tool } = require("@langchain/core/tools");
const prisma = require("../../../../config/database");

const getExpenseAnalytics = tool(
  async ({ metric, startDate, endDate, category }, config) => {
    const userId = config?.configurable?.context?.userId;

    if (!userId) throw new Error("Missing user context");

    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.expenseDate = {};
      if (startDate) dateFilter.expenseDate.gte = new Date(startDate);
      if (endDate) dateFilter.expenseDate.lte = new Date(endDate);
    }

    let result;

    switch (metric) {

      case "total_expense":
        result = await prisma.expenseBill.aggregate({
          _sum: { totalAmount: true },
          where: {
            createdById: BigInt(userId),
            ...dateFilter,
            ...(category ? { category } : {})
          }
        });
        return {
          value: result._sum.totalAmount?.toString() || "0.00"
        };

      case "total_tax":
        result = await prisma.$queryRaw`
          SELECT COALESCE(SUM(b."totalTax"), 0) AS value
          FROM expense_bills b
          WHERE b."createdById" = ${BigInt(userId)}
        `;

        return {
          value: Number(result[0].value).toFixed(2)
        };

      case "expense_count":
        const count = await prisma.expenseBill.count({
          where: {
            createdById: BigInt(userId),
            ...dateFilter,
          }
        });
        return { value: count };

      case "average_expense":
        result = await prisma.expenseBill.aggregate({
          _avg: { totalAmount: true },
          where: {
            createdById: BigInt(userId),
            ...dateFilter,
          }
        });
        return {
          value: result._avg.totalAmount?.toString() || "0.00"
        };
      case "expense_by_category":
        const byCategory = await prisma.expenseBill.groupBy({
          by: ["category"],
          _sum: { totalAmount: true },
          where: {
            createdById: BigInt(userId),
            ...dateFilter,
          },
          orderBy: {
            _sum: { totalAmount: "desc" }
          }
        });

        return JSON.stringify(
          byCategory.map(c => ({
            category: c.category,
            total: c._sum.totalAmount?.toString() || "0.00"
          }))
        );

      case "expense_by_merchant":
        const byMerchant = await prisma.expenseBill.groupBy({
          by: ["merchant"],
          _sum: { totalAmount: true },
          where: {
            createdById: BigInt(userId),
            ...dateFilter,
          },
          orderBy: {
            _sum: { totalAmount: "desc" }
          }
        });

        return JSON.stringify(byMerchant.map(m => ({
          merchant: m.merchant || "Unknown",
          total: m._sum.totalAmount?.toString() || "0.00"
        })));

      case "expense_by_payment_method":
        const byPayment = await prisma.expenseBill.groupBy({
          by: ["paymentMethod"],
          _sum: { totalAmount: true },
          where: {
            createdById: BigInt(userId),
            ...dateFilter,
          },
        });

        return JSON.stringify(byPayment.map(p => ({
          method: p.paymentMethod || "Unknown",
          total: p._sum.totalAmount?.toString() || "0.00"
        })));

      case "monthly_trend":
        const trend = await prisma.$queryRaw`
        SELECT 
          TO_CHAR("expenseDate", 'YYYY-MM') as month,
          SUM("totalAmount") as total
        FROM expense_bills
        WHERE "createdById" = ${BigInt(userId)}
        GROUP BY month
        ORDER BY month ASC
      `;

        return JSON.stringify(trend);

      case "highest_expense":
        const highest = await prisma.expenseBill.findFirst({
          where: {
            createdById: BigInt(userId),
            ...dateFilter,
          },
          orderBy: { totalAmount: "desc" }
        });

        return JSON.stringify({  
          value: highest?.totalAmount?.toString() || "0.00",
          merchant: highest?.merchant
        });

      case "tax_by_rate":
        const taxBreakdown = await prisma.$queryRaw`
        SELECT 
          i."taxRate",
          SUM((i."totalPrice" * i."taxRate") / 100) as tax
        FROM expense_bill_items i
        JOIN expense_bills b ON b.id = i."expenseId"
        WHERE b."createdById" = ${BigInt(userId)}
        GROUP BY i."taxRate"
        ORDER BY i."taxRate"
      `;

        return JSON.stringify(taxBreakdown);

      case "average_daily_spend":
        const daily = await prisma.$queryRaw`
            SELECT COALESCE(SUM("totalAmount") / COUNT(DISTINCT DATE("expenseDate")), 0) as value
            FROM expense_bills
            WHERE "createdById" = ${BigInt(userId)}
          `;

        return JSON.stringify({ value: Number(daily[0].value).toFixed(2) });


      default:
        throw new Error("Metric not supported");
    }
  },
  {
    name: "GetExpenseAnalytics",
    description: `
Fetch expense analytics including:
- total expense
- total tax on expenses
- expense count
- average expense
- expense_by_category
- expense_by_merchant
- expense_by_payment_method
- monthly_trend
- highest_expense
- average_daily_spend
- tax_by_rate
- You need to return response in markdown format with appropriate headings, bullet points, line breaks i.e <br>,tables, etc. to make it easy to read, make sure all the markdown syntax is correct and properly rendered.
You can optionally filter by date range or category.
`,
    schema: {
      type: "object",
      properties: {
        metric: {
          type: "string",
          enum: [
            "total_expense",
            "total_tax",
            "expense_count",
            "average_expense",
            "expense_by_category",
            "expense_by_merchant",
            "expense_by_payment_method",
            "monthly_trend",
            "highest_expense",
            "average_daily_spend",
            "tax_by_rate",

          ]
        },
        startDate: { type: "string" },
        endDate: { type: "string" },
        category: { type: "string" }
      },
      required: ["metric"]
    }
  }
);

module.exports = { getExpenseAnalytics };