const fetch = require('node-fetch');
const invoicePrompt = require('./prompts/invoice.prompt');
const expensePromt = require('./prompts/expense.prompt');
const fs = require("fs");
const path = require("path");

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent';
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
  const taxSummary = typeof data.tax?.taxSummary === "object"? data.tax.taxSummary : null;
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

  // Convert DD/MM/YYYY → Date
  const expenseDate = data.expenseDate
    ? parseDDMMYYYY(data.expenseDate)
    : new Date();

  const items = (data.items || []).map((item) => ({
    itemName: item.name,
    quantity: Number(item.quantity || 1),
    unitPrice: Number(item.unitPrice || 0),
    totalPrice: Number(item.total || 0)
  }));

  const calculatedTotal =
    items.length > 0
      ? items.reduce((sum, i) => sum + i.totalPrice, 0)
      : Number(data.totalAmount);

  return {
    merchant: data.merchant,
    expenseDate,
    totalAmount: Number(data.totalAmount ?? calculatedTotal),
    category: mapExpenseCategory(data.category),
    paymentMethod: data.paymentMethod,
    ocrExtracted: true,
    ocrConfidence: data.confidence ? Number(data.confidence) : null,
    items
  };
}


function extractJson(text) {
  // Try to extract JSON object from AI response
  const match = text.match(/\{[\s\S]*\}/);

  if (!match) {
    throw new Error('No JSON found in Gemini response');
  }

  return JSON.parse(match[0]);
}

async function parseInvoiceFromFile(filePath) {
  const prompt = `
You are an expert invoice parser.
Analyze the invoice image and return ONLY valid JSON.
Do not include explanations or markdown.

Rules:
- Dates must be in YYYY-MM-DD
- Numbers must be decimals (no currency symbols)
- If a field is missing, return null
- Ensure totals are mathematically consistent

JSON format:
{
  "invoiceNumber": string,
  "invoiceType": "TAX" | "PROFORMA" | "COMMERCIAL",
  "issueDate": "YYYY-MM-DD",
  "dueDate": "YYYY-MM-DD",
  "paymentTerms": string | null,

  "currency": string,
  "subtotal": number,
  "discount": number,
  "taxAmount": number,
  "shippingCost": number,
  "totalAmount": number,

  "seller": {
    "name": string,
    "email": string | null,
    "phone": string | null,
    "taxId": string | null,
    "street": string | null,
    "city": string | null,
    "state": string | null,
    "zipCode": string | null,
    "country": string | null
  },

  "buyer": {
    "name": string | null,
    "email": string | null,
    "phone": string | null,
    "address": {
      "street": string | null,
      "city": string | null,
      "state": string | null,
      "zipCode": string | null,
      "country": string | null
    },
    "companyType": string | null,
    "gstin": string | null,
    "taxId": string | null,
    "taxSystem": "GST" | "VAT" | "SALES" | "NONE"
  },

  "tax": {
    "taxType": "GST" | "VAT" | "SALES" | "NONE",
    "placeOfSupply": string | null,
    "reverseCharge": boolean,
    "taxSummary": {
      "<TAX_NAME>": {
        "rate": number,
        "amount": number
      }
    } | null
    Example:
    "taxSummary": {
      "CGST": { "rate": 9, "amount": 100.00 },
      "SGST": { "rate": 18, "amount": 200.00 }
    } | null
  },

  "items": [
    {
      "name": string,
      "description": string | null,
      "quantity": number,
      "unitPrice": number,
      "taxRate": number,
      "total": number
    }
  ]
}
`;

  try {
    const raw = await callGemini(prompt, filePath);
    return normalizeInvoice(raw);
  } catch (err) {
    console.error("❌ GEMINI INVOICE ERROR:\n", err);
    throw err;
  }
}

async function parseExpenseFromFile(filePath) {
  const prompt = `
You are an expert expense receipt parser.

Extract data from the receipt image and return ONLY valid JSON.
Do not include markdown, comments, or explanations.

Rules:
- Use DOUBLE QUOTES for all keys and string values
- Numbers must be numbers (no currency symbols)
- If a value is unknown, use null
- expenseDate must be in DD/MM/YYYY format
- category must be one of:
  "Food & Dining", "Transportation", "Utilities",
  "Office Supplies", "Travel", "Entertainment", "Other"

JSON format:
{
  "merchant": string | null,
  "expenseDate": string | null,
  "totalAmount": number,
  "category": string | null,
  "paymentMethod": string | null,
  "items": [
    {
      "name": string | null,
      "quantity": number,
      "unitPrice": number,
      "total": number
    }
  ],
  "confidence": number | null
}
If any required field is missing, return null.
`;

  try {
    const raw = await callGemini(prompt, filePath);
    return normalizeExpense(raw);
  } catch (err) {
    console.error("❌ GEMINI EXPENSE ERROR:", err);
    throw err;
  }
}


async function callGemini(prompt, filePath) {
  const mimeType = getMimeType(filePath);
  const fileBase64 = fs.readFileSync(filePath, {
    encoding: "base64",
  });

  const response = await fetch(
    `${GEMINI_ENDPOINT}?key=${process.env.GEMINI_API_KEY}`,
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

module.exports = { parseInvoiceFromFile, parseExpenseFromFile };
