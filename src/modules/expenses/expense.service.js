const prisma = require('../../config/database');
const ocrService = require('../../services/ocr.service');
const aiService = require('../ai/ai.service');

exports.previewExpenseOCR = async function (filePath) {
    const rawText = await ocrService.extractText(filePath);
    const parsed = await aiService.parseExpense(rawText);
    console.log('--- OCR RAW TEXT ---\n', rawText);
    console.log('Parsed Expense Data:', parsed);
    return {
        source: 'ocr+ai',
        parsedData: parsed,
        confidence: parsed.confidence || null, // optional
    };
}

exports.saveExpenseFromPreview = async (user, payload) => {
  return prisma.$transaction(async (tx) => {

    // 1️⃣ Create expense bill
    const expense = await tx.expenseBill.create({
      data: {
        orgId: BigInt(user.orgId),
        userId: BigInt(user.userId),
        merchant: payload.merchant ?? null,
        expenseDate: payload.expenseDate
          ? new Date(payload.expenseDate)
          : new Date(),
        totalAmount: payload.totalAmount,
        category: payload.category ?? 'OTHER',
        paymentMethod: payload.paymentMethod ?? null,
        ocrExtracted: true,
        ocrConfidence: payload.confidence ?? null,
      },
    });

    // 2️⃣ Create expense items
    if (Array.isArray(payload.items)) {
      for (const item of payload.items) {
        await tx.expenseBillItem.create({
          data: {
            expenseId: expense.id, // ✅ IMPORTANT
            itemName: item.name ?? null,
            quantity: item.quantity ?? 1,
            unitPrice: item.unitPrice ?? 0,
            totalPrice: item.total ?? 0,
          },
        });
      }
    }

    return expense;
  });
};

exports.listExpenses = async (user) => {
  return prisma.expenseBill.findMany({
    where: {
        userId: BigInt(user.userId),
    },
    include: {
      items: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
};

exports.listExpenseItems = async (expenseId) => {
  return prisma.expenseBillItem.findMany({
    where: { expenseId: BigInt(expenseId) },
  });
};


