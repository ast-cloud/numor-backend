const { createMiddleware } = require("langchain");
const { RemoveMessage } = require("@langchain/core/messages");
const { REMOVE_ALL_MESSAGES } = require("@langchain/langgraph");

const trimMessages = createMiddleware({
  name: "TrimMessages",
  beforeModel: (state) => {
    if (state.messages.length <= 8) return;

    const system = state.messages[0];
    const recent = state.messages.slice(-6);

    return {
      messages: [
        new RemoveMessage({ id: REMOVE_ALL_MESSAGES }),
        system,
        ...recent,
      ],
    };
  },
});
