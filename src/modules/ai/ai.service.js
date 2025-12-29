const fetch = require('node-fetch');
const invoicePrompt = require('./prompts/invoice.prompt');
const expensePromt = require('./prompts/expense.prompt');
const fs = require("fs");

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent';

function extractJson(text) {
  // Try to extract JSON object from AI response
  const match = text.match(/\{[\s\S]*\}/);

  if (!match) {
    throw new Error('No JSON found in Gemini response');
  }

  return JSON.parse(match[0]);
}

async function parseInvoiceFromImage(filePath) {
  const imageBase64 = fs.readFileSync(filePath, {
    encoding: "base64",
  });

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
                  mime_type: "image/jpeg", // or image/png
                  data: imageBase64,
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

  try {
    return extractJson(text);
  } catch (err) {
    console.error("❌ GEMINI RAW RESPONSE:\n", text);
    throw err;
  }
}
async function parseExpenseFromImage(filePath) {
  const imageBase64 = fs.readFileSync(filePath, {
    encoding: "base64",
  });

  const prompt = `
From the given image of an expense receipt, extract the relevant expense details and return ONLY valid JSON in the specified format.

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
Fill the expenseDate in this format - DD/MM/YYYY
`;

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
                  mime_type: "image/jpeg", // or image/png
                  data: imageBase64,
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

  try {
    return extractJson(text);
  } catch (err) {
    console.error("❌ GEMINI RAW RESPONSE:\n", text);
    throw err;
  }
}


async function parseInvoice(ocrText) {
  const prompt = invoicePrompt(ocrText);

  const response = await fetch(
    `${GEMINI_ENDPOINT}?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
      }),
    }
  );

  const data = await response.json();

  const text =
    data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) throw new Error('Gemini returned empty response');
  try {
    return extractJson(text);
  } catch (err) {
    console.error('❌ GEMINI RAW RESPONSE:\n', text);
    throw err;
  }
  return JSON.parse(text);
}

async function parseExpense(ocrText) {
  const prompt = expensePromt(ocrText);

  const response = await fetch(
    `${GEMINI_ENDPOINT}?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
      }),
    }
  );

  const data = await response.json();

  const text =
    data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) throw new Error('Gemini returned empty response');
  try {
    return extractJson(text);
  } catch (err) {
    console.error('❌ GEMINI RAW RESPONSE:\n', text);
    throw err;
  }
  return JSON.parse(text);
}

module.exports = { parseInvoice, parseExpense, parseInvoiceFromImage, parseExpenseFromImage };
