const prisma = require('../../../../config/database');

module.exports = async function smeContext(user) {
  const invoicesSummary = await prisma.invoiceBill.aggregate({
    where: { customerId: user.userId },
    _sum: { totalAmount: true, balanceDue: true },
    _count: true
  });

  const expensesSummary = await prisma.expenseBill.aggregate({
    where: { userId: user.userId },
    _sum: { totalAmount: true }
  });

  //  const recentInvoices = await prisma.invoiceBill.findMany({
  //   where: { customerId: user.userId },
  //   orderBy: { issueDate: 'desc' },
  //   take: 10, 
  //   select: {
  //     id: true,
  //     invoiceNumber: true,
  //     issueDate: true,
  //     dueDate: true,
  //     status: true,
  //     totalAmount: true,
  //     balanceDue: true,
  //     currency: true,
  //     client: {
  //       select: { name: true },
  //     },
  //   },
  // });

  //  const recentExpenses = await prisma.expenseBill.findMany({
  //   where: { userId: user.userId },
  //   orderBy: { expenseDate: 'desc' },
  //   take: 10,
  //   select: {
  //     id: true,
  //     merchant: true,
  //     expenseDate: true,
  //     totalAmount: true,
  //     category: true,
  //     paymentMethod: true,
  //   },
  // });

  return {
    invoicesSummary,
    expensesSummary,
    // recentInvoices,
    // recentExpenses
  };
};
