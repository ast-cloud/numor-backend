const prisma = require('../../config/database');
const ocrService = require('../../services/ocr.service');
const aiService = require('../ai/ai.service');

function isExcelFile(mimetype, filename) {
  if (mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimetype === "application/vnd.ms-excel") {
    return true;
  }
  if (typeof filename === 'string' &&
    (filename.endsWith('.xlsx') || filename.endsWith('.xls'))) {
    return true;
  }
  return false;
}

function isCsvFile(mimetype, filename) {
  return (
    mimetype === 'text/csv' ||
    mimetype === 'application/csv' ||
    (typeof filename === 'string' && filename.endsWith('.csv'))
  );
}

exports.previewExpenseAI = async function (file) {
  const { path, mimetype, originalname } = file;
  //Excel 
  if (isExcelFile(mimetype, originalname)) {
    const parsed = await aiService.parseExpenseFromExcel(path);
    return {
      source: "gemini-vision-excel",
      parsedData: parsed,
      confidence: parsed.confidence || null,
    };
  }

  if (isCsvFile(mimetype, originalname)) {
    const parsed = await aiService.parseExpenseFromCsv(path);
    return {
      source: "gemini-vision-csv",
      parsedData: parsed,
      confidence: parsed.confidence || null,
    };
  }


  //Pdf and Image
  const parsed = await aiService.parseExpenseFromFile(path);

  return {
    source: "gemini-vision",
    parsedData: parsed,
    confidence: parsed.confidence || null,
  };
  return {
    source: "gemini-vision",
    parsedData: parsed,
    confidence: parsed.confidence || null,
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

exports.listExpenses = async (user, page = 1, limit = 10) => {
  page = Number(page);
  limit = Number(limit);

  if (Number.isNaN(page) || page < 1) page = 1;
  if (Number.isNaN(limit) || limit < 1) limit = 10;
  const offset = (page - 1) * limit;
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
    take: limit,
    skip: offset,
  });
};

exports.listExpenseItems = async (expenseId, page = 1, limit = 10) => {
  page = Number(page);
  limit = Number(limit);

  if (Number.isNaN(page) || page < 1) page = 1;
  if (Number.isNaN(limit) || limit < 1) limit = 10;
  const offset = (page - 1) * limit;
  return prisma.expenseBillItem.findMany({
    where: { expenseId: BigInt(expenseId) },
    take: limit,
    skip: offset,
  });
};


