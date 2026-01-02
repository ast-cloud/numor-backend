const fetch = require('node-fetch');
const invoicePrompt = require('./prompts/invoice.prompt');
const expensePromt = require('./prompts/expense.prompt');
const fs = require("fs");
const path = require("path");

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent';

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


JSON format:
{
  "invoiceNumber": string,
  "vendorName": string,
  "invoiceDate": "YYYY-MM-DD",
  "dueDate": "YYYY-MM-DD",
  "subtotal": number,
  "taxAmount": number,
  "totalAmount": number,
  "items": [
    {
      "name": string,
      "quantity": number,
      "unitPrice": number,
      "total": number
    }
  ]
}

If any field is missing, return null.
`;

  try {
    return await callGemini(prompt, filePath);
  } catch (err) {
    console.error("❌ GEMINI INVOICE ERROR:\n", err);
    throw err;
  }
}
async function parseExpenseFromFile(filePath) {
  const prompt = `
You are a strict JSON generator.

Rules:
- Return ONLY valid JSON
- Use DOUBLE QUOTES for all keys and string values
- Do NOT include comments
- Do NOT include markdown
- Do NOT include explanation text
- If a value is unknown, use null
- Numbers must be numbers, not strings

JSON schema:
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
If any field is missing, return null.
Fill the category field by selecting one category from this list - "Food & Dining", "Transportation", "Utilities", "Office Supplies", "Travel", "Entertainment", "Other".
`;

  try {
    return await callGemini(prompt, filePath);
  } catch (err) {
    console.error("❌ GEMINI EXPENSE ERROR");
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

module.exports = {parseInvoiceFromFile, parseExpenseFromFile };
