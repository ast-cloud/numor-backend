const { createAgent } = require("langchain");
const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { MemorySaver } = require("@langchain/langgraph");
const { PostgresSaver } = require("@langchain/langgraph-checkpoint-postgres");
const { SYSTEM_PROMPT } = require("./system.prompt");
const { getInvoices } = require("../tools/invoices.tool");

const baseModel = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash",
  temperature: 0.2,
  maxOutputTokens: 1024,
});
const checkpointer = new MemorySaver();
// const checkpointer = PostgresSaver.fromConnString(process.env.DATABASE_URL);
// await checkpointer.setup();

const numorAgent = createAgent({
  model: baseModel,
  tools: [
    // getInvoices,
  ],
  checkpointer,
});

module.exports = {
  numorAgent,
};
