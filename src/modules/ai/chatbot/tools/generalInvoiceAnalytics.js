const { tool } = require("@langchain/core/tools");
const prisma = require("../../../../config/database");

const getAnalyticsForInvoice = tool(
  async ({ metric, startDate, endDate }, config) => {
    const userId = config?.configurable?.context?.userId;

    if (!userId) throw new Error("Missing user context");

    let result;

    switch (metric) {

      case "total_tax":
        result = await prisma.$queryRaw`
          SELECT COALESCE(SUM((i."totalPrice" * i."taxRate") / 100), 0) as value
          FROM invoice_bill_items i
          JOIN invoice_bills b ON b.id = i."invoiceId"
          WHERE b."createdById" = ${BigInt(userId)}
        `;
        break;

      case "invoice_count":
        result = await prisma.invoiceBill.count({
          where: { createdById: BigInt(userId) }
        });
        break;

      case "total_revenue":
        result = await prisma.$queryRaw`
          SELECT COALESCE(SUM(i."totalPrice"), 0) as value
          FROM invoice_bill_items i
          JOIN invoice_bills b ON b.id = i."invoiceId"
          WHERE b."createdById" = ${BigInt(userId)}
        `;
        break;
      case "average_invoice_value":
        result = await prisma.$queryRaw`
        SELECT COALESCE(AVG(b."totalAmount"), 0) as value
        FROM invoice_bills b
        WHERE b."createdById" = ${BigInt(userId)}
      `;
        break;

      case "total_paid":
        result = await prisma.$queryRaw`
    SELECT COALESCE(SUM(b."paidAmount"), 0) as value
    FROM invoice_bills b
    WHERE b."createdById" = ${BigInt(userId)}
  `;
        break;

      case "total_outstanding":
        result = await prisma.$queryRaw`
    SELECT COALESCE(SUM(b."balanceDue"), 0) as value
    FROM invoice_bills b
    WHERE b."createdById" = ${BigInt(userId)}
  `;
        break;

      case "overdue_count":
        result = await prisma.invoiceBill.count({
          where: {
            createdById: BigInt(userId),
            status: "OVERDUE"
          }
        });
        return JSON.stringify({ value: result });

      case "paid_count":
        result = await prisma.invoiceBill.count({
          where: {
            createdById: BigInt(userId),
            status: "PAID"
          }
        });
        return JSON.stringify({ value: result });

      case "draft_count":
        result = await prisma.invoiceBill.count({
          where: {
            createdById: BigInt(userId),
            status: "DRAFT"
          }
        });
        return JSON.stringify({ value: result });

      case "revenue_by_currency":
        result = await prisma.$queryRaw`
        SELECT b."currency", COALESCE(SUM(b."totalAmount"), 0) as value
        FROM invoice_bills b
        WHERE b."createdById" = ${BigInt(userId)}
        GROUP BY b."currency"
        `;
        return JSON.stringify({ value: result });

      case "revenue_by_category":
        result = await prisma.$queryRaw`
          SELECT b."category", COALESCE(SUM(b."totalAmount"), 0) as value
          FROM invoice_bills b
          WHERE b."createdById" = ${BigInt(userId)}
          GROUP BY b."category"
        `;
        return JSON.stringify({ value: result });

      case "total_discount":
        result = await prisma.$queryRaw`
          SELECT COALESCE(SUM(b."discount"), 0) as value
          FROM invoice_bills b
          WHERE b."createdById" = ${BigInt(userId)}
        `;
        break;

      case "monthly_revenue":
        result = await prisma.$queryRaw`
          SELECT 
            DATE_TRUNC('month', b."issueDate") as month,
            COALESCE(SUM(b."totalAmount"), 0) as value
          FROM invoice_bills b
          WHERE b."createdById" = ${BigInt(userId)}
          GROUP BY month
          ORDER BY month ASC
        `;
        return JSON.stringify({ value: result });

      case "total_tax_invoice_level":
        result = await prisma.$queryRaw`
          SELECT COALESCE(SUM(b."taxAmount"), 0) as value
          FROM invoice_bills b
          WHERE b."createdById" = ${BigInt(userId)}
        `;
        break;

      case "average_payment_delay":
        result = await prisma.$queryRaw`
          SELECT COALESCE(AVG(EXTRACT(DAY FROM (b."paidAt" - b."dueDate"))), 0) as value
          FROM invoice_bills b
          WHERE b."createdById" = ${BigInt(userId)}
            AND b."paidAt" IS NOT NULL
        `;
        break;

      case "export_invoice_count":
        result = await prisma.invoiceBill.count({
          where: {
            createdById: BigInt(userId),
            countryOfDestination: { not: null }
          }
        });
        return JSON.stringify({ value: result });

      default:
        throw new Error("Metric not supported");
    }

    return JSON.stringify({ value: Number(result[0].value).toFixed(2) });
  },
  {
    name: "GetAnalytics",
    description: `
Fetch financial analytics metrics like:
- total tax
- total revenue
- invoice count
- average invoice value
- total_paid
- total_outstanding
- overdue_count
- paid_count
- draft_count
- total_discount
- monthly_revenue
- revenue_by_currency
- revenue_by_category
- average_payment_delay
- export_invoice_count
`,
    schema: {
      type: "object",
      properties: {
        metric: {
          type: "string",
          enum: [
            "total_tax",
            "total_revenue",
            "invoice_count",
            "average_invoice_value",
            "total_paid",
            "total_outstanding",
            "overdue_count",
            "paid_count",
            "draft_count",
            "total_discount",
            "monthly_revenue",
            "revenue_by_currency",
            "revenue_by_category",
            "average_payment_delay",
            "export_invoice_count"
          ]
        },
        startDate: { type: "string" },
        endDate: { type: "string" }
      },
      required: ["metric"]
    }
  }
);

module.exports = { getAnalyticsForInvoice }