const prisma = require('../../config/database')

function getDateRange(startDate, endDate) {
    const now = new Date();

    const start = startDate
        ? new Date(startDate)
        : new Date(now.getFullYear(), now.getMonth(), 1);

    const end =
        endDate
            ? new Date(endDate)
            : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    return { start, end };
}

async function revenueByCustomer(customerId, startDate, endDate) {
    // 1️⃣ Default to current month if dates not provided
    const now = new Date();

    const { start, end } = getDateRange(startDate, endDate);

    // 2️⃣ Prisma groupBy
    const data = await prisma.invoiceBill.groupBy({
        by: ['category'],
        where: {
            customerId: BigInt(customerId),
            issueDate: {
                gte: start,
                lte: end,
            },
        },
        _sum: {
            totalAmount: true,
        },
        orderBy: {
            _sum: {
                totalAmount: 'desc',
            },
        },
    });
    return data;
}

async function expenseByUser(userId, startDate, endDate) {
    // 1️⃣ Default to current month
    const now = new Date();

    const { start, end } = getDateRange(startDate, endDate);

    // 2️⃣ Prisma groupBy
    const data = await prisma.expenseBill.groupBy({
        by: ['category'],
        where: {
            userId: BigInt(userId),
            expenseDate: {
                gte: start,
                lte: end,
            },
        },
        _sum: {
            totalAmount: true,
        },
        orderBy: {
            _sum: {
                totalAmount: 'desc',
            },
        },
    });

    return data;
}

async function dashboardSummary(userId, startDate, endDate) {
    const { start, end } = getDateRange(startDate, endDate);
    const [
        revenueAgg,
        expenseAgg,
        invoiceCount,
        expenseCount,
    ] = await Promise.all([
        prisma.invoiceBill.aggregate({
            where: {
                customerId: BigInt(userId),
                issueDate: { gte: start, lte: end },
            },
            _sum: { totalAmount: true },
        }),

        prisma.expenseBill.aggregate({
            where: {
                userId: BigInt(userId),
                expenseDate: { gte: start, lte: end },
            },
            _sum: { totalAmount: true },
        }),

        prisma.invoiceBill.count({
            where: {
                customerId: BigInt(userId),
                issueDate: { gte: start, lte: end },
            },
        }),

        prisma.expenseBill.count({
            where: {
                userId: BigInt(userId),
                expenseDate: { gte: start, lte: end },
            },
        }),
    ]);

    const revenue = revenueAgg._sum.totalAmount || 0;
    const expense = expenseAgg._sum.totalAmount || 0;

    return {
        revenue,
        expense,
        netCashFlow: revenue - expense,
        invoiceCount,
        expenseCount,
        startDate: start,
        endDate: end,
    };
}

async function revenueExpenseTrend(userId, startDate, endDate) {
  const { start, end } = getDateRange(startDate, endDate);

  // Fetch raw data
  const invoices = await prisma.invoiceBill.findMany({
    where: {
      customerId: BigInt(userId),
      issueDate: { gte: start, lte: end },
    },
    select: {
      issueDate: true,
      totalAmount: true,
    },
  });

  const expenses = await prisma.expenseBill.findMany({
    where: {
      userId: BigInt(userId),
      expenseDate: { gte: start, lte: end },
    },
    select: {
      expenseDate: true,
      totalAmount: true,
    },
  });

  // Group by YYYY-MM
  const trendMap = {};

  invoices.forEach(inv => {
    const key = inv.issueDate.toISOString().slice(0, 7);
    if (!trendMap[key]) trendMap[key] = { revenue: 0, expense: 0 };
    trendMap[key].revenue += Number(inv.totalAmount);
  });

  expenses.forEach(exp => {
    const key = exp.expenseDate.toISOString().slice(0, 7);
    if (!trendMap[key]) trendMap[key] = { revenue: 0, expense: 0 };
    trendMap[key].expense += Number(exp.totalAmount);
  });

  // Convert to sorted array
  return Object.keys(trendMap)
    .sort()
    .map(period => ({
      period,              // e.g. "2025-01"
      revenue: trendMap[period].revenue,
      expense: trendMap[period].expense,
      netCashFlow:
        trendMap[period].revenue - trendMap[period].expense,
    }));
}

module.exports = { revenueByCustomer, expenseByUser, dashboardSummary, revenueExpenseTrend }