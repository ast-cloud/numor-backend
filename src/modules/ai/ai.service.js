const fetch = require('node-fetch');
const invoicePrompt = require('./prompts/invoice.prompt');
const expensePromt = require('./prompts/expense.prompt');
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const buildExcelInvoicePrompt = require('./prompts/invoiceExcel.promt');
const buildExcelExpensePrompt = require('./prompts/expenseExcel.prompt');
const invoicePromptVision = require('./prompts/invoice.prompt');
const expensePromptVision = require('./prompts/expense.prompt');
const csv = require("csv-parser");

// const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent';
function normalizeInvoice(data) {
  if (!data || !Array.isArray(data.items) || data.items.length === 0) {
    throw new Error("Invalid invoice data from AI");
  }

  // 🧮 Subtotal fallback
  const subtotal =
    Number(data.subtotal) ||
    data.items.reduce((sum, i) => sum + Number(i.total || 0), 0);

  const discount = Number(data.discount || 0);
  const taxAmount = Number(data.taxAmount || 0);
  const shippingCost = Number(data.shippingCost || 0);

  const totalAmount =
    Number(data.totalAmount) ||
    subtotal - discount + taxAmount + shippingCost;

  const effectiveTax =
    subtotal > 0 ? Number((taxAmount / subtotal).toFixed(4)) : 0;
  const taxSummary = typeof data.tax?.taxSummary === "object" ? data.tax.taxSummary : null;
  return {
    // 🧾 Core invoice
    invoiceNumber: data.invoiceNumber ?? null,
    invoiceType: data.invoiceType ?? "TAX",
    invoiceDate: data.issueDate ?? data.invoiceDate ?? null,
    dueDate: data.dueDate ?? null,
    paymentTerms: data.paymentTerms ?? null,

    // 💱 Money
    currency: data.currency ?? "USD",
    exchangeRate: Number(data.exchangeRate || 1),
    baseCurrency: data.baseCurrency ?? "INR",

    subtotal,
    discount,
    taxAmount,
    shippingCost,
    totalAmount,
    effectiveTax,

    paidAmount: Number(data.paidAmount || 0),

    // 🧾 Seller (nested — IMPORTANT)
    seller: data.seller
      ? {
        name: data.seller.name ?? null,
        email: data.seller.email ?? null,
        phone: data.seller.phone ?? null,
        streetAddress: data.seller.street ?? null,
        city: data.seller.city ?? null,
        state: data.seller.state ?? null,
        zipCode: data.seller.zipCode ?? null,
        country: data.seller.country ?? null,
        taxId: data.seller.taxId ?? null,
        iecCode: data.seller.iecCode ?? null,
        lutFiled: Boolean(data.seller.lutFiled),
      }
      : null,

    buyer: data.buyer
      ? {
        name: data.buyer.name ?? null,
        email: data.buyer.email ?? null,
        phone: data.buyer.phone ?? null,

        address: {
          street: data.buyer.address?.street ?? null,
          city: data.buyer.address?.city ?? null,
          state: data.buyer.address?.state ?? null,
          zipCode: data.buyer.address?.zipCode ?? null,
          country: data.buyer.address?.country ?? null,
        },

        companyType: data.buyer.companyType ?? null,
        gstin: data.buyer.gstin ?? null,
        taxId: data.buyer.taxId ?? null,
        taxSystem: data.buyer.taxSystem ?? "NONE",
        isActive: true,
      }
      : null,

    // 🧮 Tax & compliance
    taxType: data.tax?.taxType ?? "NONE",
    placeOfSupply: data.tax?.placeOfSupply ?? null,
    reverseCharge: Boolean(data.tax?.reverseCharge),
    reverseReason: data.tax?.reverseReason ?? null,
    sacCode: data.tax?.sacCode ?? null,
    taxSummary: taxSummary,

    // 🚚 Shipping / trade
    shipTo: data.shipTo
      ? {
        name: data.shipTo.name ?? null,
        address: data.shipTo.address ?? null,
      }
      : null,

    countryOfOrigin: data.countryOfOrigin ?? null,
    countryOfDestination: data.countryOfDestination ?? null,
    incoterms: data.incoterms ?? null,

    // 💳 Payment
    bankDetails: data.bankDetails ?? null,
    paymentLink: data.paymentLink ?? null,
    bankAddress: data.bankAddress ?? null,

    // ⚖️ Legal
    jurisdiction: data.jurisdiction ?? null,
    lateFeePolicy: data.lateFeePolicy ?? null,
    notes: data.notes ?? null,

    // 📦 Items (payload format, NOT Prisma)
    items: data.items.map((item) => ({
      name: item.name ?? null,
      description: item.description ?? null,
      quantity: Number(item.quantity || 1),
      unitPrice: Number(item.unitPrice || 0),
      taxRate: Number(item.taxRate || 0),
      total: Number(item.total || 0),
    })),
  };
}

function normalizeExpense(data) {
  if (!data || !data.totalAmount) {
    throw new Error("Invalid expense data from AI");
  }

  // Date normalization (safe fallback)
  const parsedDate = data.expenseDate ?? null
  const expenseDate = parsedDate || new Date();

  const items = Array.isArray(data.items)
    ? data.items.map((item) => {
      const quantity = Number(item.quantity || 1);
      const unitPrice = Number(item.unitPrice || 0);

      return {
        itemName: item.name || "Unknown item",
        quantity,
        unitPrice,
        taxPercent: Number(item.taxPercent || 0),
        totalPrice:
          Number(item.total) || Number((quantity * unitPrice).toFixed(2)),
      };
    })
    : [];

  const calculatedTotal =
    items.length > 0
      ? items.reduce((sum, i) => sum + i.totalPrice, 0)
      : Number(data.totalAmount);

  return {
    merchant: data.merchant || "Unknown",
    expenseDate,
    totalAmount: Number(data.totalAmount ?? calculatedTotal),
    category: mapExpenseCategory(data.category),
    paymentMethod: data.paymentMethod || null,
    ocrExtracted: true,
    ocrConfidence:
      data.confidence !== undefined ? Number(data.confidence) : null,
    items,
  };
}

function csvToJson(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];

    fs.createReadStream(filePath)
      .pipe(csv({ skipLines: 0, trim: true }))
      .on("data", (row) => rows.push(row))
      .on("end", () => resolve(rows))
      .on("error", reject);
  });
}

function extractJson(text) {
  // Try to extract JSON object from AI response
  const match = text.match(/\{[\s\S]*\}/);

  if (!match) {
    throw new Error('No JSON found in Gemini response');
  }

  return JSON.parse(match[0]);
}

async function parseInvoiceFromExcel(filePath) {
  // 1. Excel → JSON rows
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  const rows = XLSX.utils.sheet_to_json(sheet, {
    defval: null,
    raw: false,
  });

  // Safety limit (important)
  const trimmedRows = rows.slice(0, 200);

  // 2. JSON → AI (TEXT)
  const prompt = buildExcelInvoicePrompt(trimmedRows);
  // console.log("Excel Invoice Prompt:", prompt);

  const raw = await callGeminiText(prompt);
  // console.log("Gemini Raw:", raw);

  return normalizeInvoice(raw);
}

async function parseInvoiceFromCsv(filePath) {
  // 1. CSV → JSON rows
  const rows = await csvToJson(filePath);

  // Safety limit (same as Excel)
  const trimmedRows = rows.slice(0, 200);

  // 2. JSON → AI (TEXT)
  const prompt = buildExcelInvoicePrompt(trimmedRows);
  // 👆 Reuse same prompt — CSV & Excel are both tabular

  // console.log("CSV Invoice Prompt:", prompt);

  const raw = await callGeminiText(prompt);
  // console.log("Gemini Raw:", raw);

  return normalizeInvoice(raw);
}


async function parseInvoiceFromFile(filePath) {
  const prompt = invoicePromptVision;
  // console.log("Excel Invoice Prompt:", prompt);

  try {
    const raw = await callGeminiVision(prompt, filePath);
    return normalizeInvoice(raw);
  } catch (err) {
    console.error("❌ GEMINI INVOICE ERROR:\n", err);
    throw err;
  }
}

async function parseExpenseFromExcel(filePath) {
  // 1. Excel → JSON rows
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  const rows = XLSX.utils.sheet_to_json(sheet, {
    defval: null,
    raw: false,
  });

  // Safety limit (important)
  const trimmedRows = rows.slice(0, 200);

  // 2. JSON → AI (TEXT)
  const prompt = buildExcelExpensePrompt(trimmedRows);
  // console.log("Excel Expense Prompt:", prompt);

  const raw = await callGeminiText(prompt);
  // console.log("Gemini Raw:", raw);

  return normalizeExpense(raw);
}

async function parseExpenseFromCsv(filePath) {
  // 1. CSV → JSON rows
  const rows = await csvToJson(filePath);

  // Safety limit (same as Excel)
  const trimmedRows = rows.slice(0, 200);

  // 2. JSON → AI (TEXT)
  const prompt = buildExcelExpensePrompt(trimmedRows);
  // 👆 Reuse same prompt — CSV & Excel are both tabular

  // console.log("CSV Expense Prompt:", prompt);

  const raw = await callGeminiText(prompt);
  // console.log("Gemini Raw:", raw);

  return normalizeExpense(raw);
}

async function parseExpenseFromFile(filePath) {
  const prompt = expensePromptVision;

  try {
    const raw = await callGeminiVision(prompt, filePath);
    return normalizeExpense(raw);
  } catch (err) {
    console.error("❌ GEMINI EXPENSE ERROR:", err);
    throw err;
  }
}

async function callGeminiVision(prompt, filePath) {
  const mimeType = getMimeType(filePath);
  const fileBase64 = fs.readFileSync(filePath, {
    encoding: "base64",
  });

  const response = await fetch(
    `${process.env.GEMINI_ENDPOINT}?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: fileBase64,
                },
              },
            ],
          },
        ],
      }),
    }
  );

  const data = await response.json();

  const text =
    data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error("Gemini returned empty response");
  }

  return extractJson(text);
}

async function callGeminiText(prompt) {
  const response = await fetch(
    `${process.env.GEMINI_ENDPOINT}?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
      }),
    }
  );

  const data = await response.json();

  const text =
    data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error("Gemini returned empty response");
  }

  return extractJson(text);
}


function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".pdf":
      return "application/pdf";
    default:
      throw new Error("Unsupported file type");
  }
}

const ALLOWED_EXPENSE_CATEGORIES = new Set([
  "Food & Dining",
  "Transportation",
  "Travel",
  "Accommodation",
  "Utilities",
  "Office Supplies",
  "Software & Subscriptions",
  "Marketing & Advertising",
  "Professional Services",
  "Rent",
  "Maintenance & Repairs",
  "Entertainment",
  "Insurance",
  "Taxes & Government Fees",
  "Bank Charges",
  "Training & Education",
  "Other"
]);

function mapExpenseCategory(category) {
  return ALLOWED_EXPENSE_CATEGORIES.has(category)
    ? category
    : "Other";
}


module.exports = { parseInvoiceFromFile, parseExpenseFromFile, parseInvoiceFromExcel, parseInvoiceFromCsv, parseExpenseFromExcel, parseExpenseFromCsv };
