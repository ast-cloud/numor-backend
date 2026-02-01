const { numorAgent } = require("../chatbot/agent/numor.agent");
const { resolveUserContext } = require("./context/chat.resolveUserContext"); // unified context
const { buildSystemPrompt } = require("../chatbot/agent/system.prompt");

/*
current flow
DB → Context Builder → Prompt → Gemini
Going  to implement tools later:
User: "Show unpaid invoices from last month"
↓
LLM calls tool: getInvoices({ status: "OVERDUE", month: "Dec" })
↓
Tool returns ONLY relevant rows
*/
async function handleChat(user, message) {
  const { baseContext, roleContext } = await resolveUserContext(user);

  // const systemPromptContent = buildSystemPrompt({
  //   baseContext,
  //   roleContext,
  // });
  const result = await numorAgent.invoke(
    {
      messages: [
        // { role: "system", content: systemPromptContent },
        { role: "user", content: message },
      ],
    },
    {
      configurable: {
        thread_id: `user-${user.userId}`,
        context: {
          userId: user.userId.toString(),
          role: user.role,
          orgId: user.orgId,
        },
      },
    }
  );


  return result.messages.at(-1)?.content;
}

async function getChatHistory(user) {
  const threadId = `user-${user.userId}`;

  const state = await numorAgent.getState({
    configurable: {
      thread_id: threadId,
    },
  });

  return state?.values?.messages ?? [];
}

module.exports = { handleChat, getChatHistory };