module.exports = (ocrText) => `
You are an accounting assistant.

Extract invoice data from the text below.
Return ONLY valid JSON. No explanation.

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

INVOICE TEXT:
"""
${ocrText}
"""
`;
