const prisma = require('../../../config/database');

module.exports = async function smeContext(user) {
  const invoices = await prisma.invoiceBill.aggregate({
    where: { customerId: user.id },
    _sum: { totalAmount: true, balanceDue: true },
    _count: true
  });

  const expenses = await prisma.expenseBill.aggregate({
    where: { userId: user.id },
    _sum: { totalAmount: true }
  });

  return {
    invoicesSummary: invoices,
    expensesSummary: expenses
  };
};
