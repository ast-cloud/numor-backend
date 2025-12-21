const fetch = require('node-fetch');
const invoicePrompt = require('./prompts/invoice.prompt');

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent';

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

  return JSON.parse(text);
}

module.exports = { parseInvoice };
