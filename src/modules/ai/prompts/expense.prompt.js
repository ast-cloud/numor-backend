module.exports = (ocrText) => `
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

Receipt text:
"""
${ocrText}
"""
`;
