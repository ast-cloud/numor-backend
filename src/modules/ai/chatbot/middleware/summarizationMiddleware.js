const { summarizationMiddleware } = require("langchain");
const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");

const summaryModel = new ChatGoogleGenerativeAI({
  model: "gemini-2.0-flash-lite",
  temperature: 0,
  maxOutputTokens: 800,
});

const summaryPrompt = `
You are summarizing a financial assistant conversation.

Rules:
- Preserve user intent and applied filters
- Preserve conclusions and decisions
- DO NOT include raw invoice/expense JSON
- DO NOT include IDs unless explicitly discussed
- Keep summary concise and factual

Conversation:
{messages}

Summary:
`;

const summaryMiddleware = summarizationMiddleware({
  model: summaryModel,

  // OR logic — any condition triggers summarization
  trigger: [
    { tokens: 3000 },
    { messages: 8 },
  ],

  // Keep last 15 messages verbatim
  keep: {
    messages: 15,
  },

  trimTokensToSummarize: 4000,
  summaryPrompt,
});

module.exports = summaryMiddleware;
