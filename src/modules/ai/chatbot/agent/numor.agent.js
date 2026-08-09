const { createAgent } = require("langchain");
const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { MemorySaver } = require("@langchain/langgraph");
const { PostgresSaver } = require("@langchain/langgraph-checkpoint-postgres");
const { Pool } = require('pg');
const { SYSTEM_PROMPT } = require("./system.prompt");
const { getInvoices } = require("../tools/user.listInvoices.tool");
const { listInvoiceItems } = require("../tools/user.invoiceItems.tool");
const { getExpenses } = require("../tools/user.listExpenses.tool");
const { fetchCASlots } = require("../tools/caSlot.tool");
const { fetchCAReviews } = require("../tools/caReview.tool");
const { fetchCABookings } = require("../tools/caBooking.tool");
const summaryMiddleware = require("../middleware/summarizationMiddleware");
const { getExpenseDetails } = require("../tools/user.expenseItems.tool");
const chatLogger = require("../../../../utils/chat.logger");
const {listAllUserInvoiceItems} = require("../tools/listAllUserInvoiceItems")
const {listAllUserExpenseItems} = require("../tools/listAllUserExpenseItems")
const {getTotalInvoiceTax} = require("../tools/getTotalInvoiceTax")
const {getAnalyticsForInvoice} = require("../tools/generalInvoiceAnalytics")
const {getExpenseAnalytics} = require("../tools/generalExpenseAnalytics")
const { FF_CA_CORE, DATABASE_URL, RUN_LANGGRAPH_SETUP } = require("../../../../config/env");
const isCACoreEnabled = FF_CA_CORE === "true";

const enabledTools = [
  getInvoices,
  getExpenses,
  listInvoiceItems,
  getExpenseDetails,
  listAllUserInvoiceItems,
  listAllUserExpenseItems,
  getTotalInvoiceTax,
  getAnalyticsForInvoice,
  getExpenseAnalytics,
];

if (isCACoreEnabled) {
  enabledTools.push(
    fetchCASlots,
    fetchCAReviews,
    fetchCABookings,
  );
}

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
  maxOutputTokens: 1200,
  streaming: true, 
});
// ---- POSTGRES CHECKPOINTER ----

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, 
  }
});

const checkpointer = new PostgresSaver(pool);

// const checkpointer = PostgresSaver.fromConnString(
//   process.env.DATABASE_URL,
// );

// IMPORTANT: run once on app startup
async function initCheckpointer() {
  if (RUN_LANGGRAPH_SETUP === "true") {
    await checkpointer.setup();
    console.log("✅ LangGraph tables ensured");
  }
}

const numorAgent = createAgent({
  model: baseModel,
  tools: enabledTools,
  systemPrompt: SYSTEM_PROMPT, 
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
