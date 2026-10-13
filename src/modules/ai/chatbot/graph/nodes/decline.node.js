// Replies to messages the router ruled out. The text is fixed on purpose: an
// off-topic request never reaches a model that writes prose, so there is
// nothing to talk into doing something else.

const { AIMessage } = require("@langchain/core/messages");

const OUT_OF_SCOPE_REPLY =
  "I can only help with your Numor data and with finance, accounting, tax and invoicing questions.\n\n" +
  "Try asking things like:\n" +
  "- How much did I invoice last month?\n" +
  "- Which clients still owe me money?\n" +
  "- What is the difference between a proforma and a tax invoice?";

const ROUTER_FAILED_REPLY =
  "Sorry, I couldn't process that just now. Please try again in a moment.";

async function declineNode(state) {
  const text = state.plan?.failed ? ROUTER_FAILED_REPLY : OUT_OF_SCOPE_REPLY;
  return { messages: [new AIMessage(text)] };
}

module.exports = { declineNode };
