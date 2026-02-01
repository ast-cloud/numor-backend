const { createAgent } = require("langchain");
const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { MemorySaver } = require("@langchain/langgraph");
const { PostgresSaver } = require("@langchain/langgraph-checkpoint-postgres");
const { SYSTEM_PROMPT } = require("./system.prompt");
const { getInvoices } = require("../tools/user.listInvoices.tool");
const { listInvoiceItems } = require("../tools/user.invoiceItems.tool");
const { getExpenses } = require("../tools/user.listExpenses.tool");
const { fetchCASlots } = require("../tools/caSlot.tool");
const { fetchCAReviews } = require("../tools/caReview.tool");
const { fetchCABookings } = require("../tools/caBooking.tool");
const summaryMiddleware = require("../middleware/summarizationMiddleware");

const contextSchema = {
  type: "object",
  properties: {
    userId: { type: "string" },
    role: { type: "string" },
    orgId: { type: "string" },
  },
};

const baseModel = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash",
  temperature: 0.2,
  maxOutputTokens: 5000,
});
// const checkpointer = new MemorySaver();
// ---- POSTGRES CHECKPOINTER ----
const checkpointer = PostgresSaver.fromConnString(
  process.env.DATABASE_URL,
);
// IMPORTANT: run once on app startup
async function initCheckpointer() {
  if (process.env.RUN_LANGGRAPH_SETUP === "true") {
    await checkpointer.setup();
    console.log("✅ LangGraph tables ensured");
  }
}

const numorAgent = createAgent({
  model: baseModel,
  tools: [
    getInvoices,
    getExpenses,
    fetchCASlots,
    fetchCAReviews,
    fetchCABookings,
    listInvoiceItems
  ],
  checkpointer,
  contextSchema,
  middleware: [
    summaryMiddleware,
  ],
});

module.exports = {
  numorAgent,
  initCheckpointer
};
