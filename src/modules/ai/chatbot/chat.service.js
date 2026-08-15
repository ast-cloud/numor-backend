const { numorAgent } = require("../chatbot/agent/numor.agent");
const { resolveUserContext } = require("./context/chat.resolveUserContext"); // unified context
const { buildSystemPrompt } = require("../chatbot/agent/system.prompt");
const { RemoveMessage, SystemMessage } = require("@langchain/core/messages");
const { summarizeMessages } = require("../chatbot/middleware/summarizationMiddleware");
const chatLogger = require("../../../utils/chat.logger");

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
const MAX_HISTORY_TURNS = 6;
const MAX_HISTORY_MESSAGES = MAX_HISTORY_TURNS * 2;
const HISTORY_SUMMARY_PREFIX = "Summary of previous conversation:";

async function ensureConversationWindow(user) {
  const threadId = `session-${user.sessionId}`;
  const state = await numorAgent.getState({
    configurable: { thread_id: threadId },
  });

  const allMessages = state?.values?.messages ?? [];
  const normalized = normalizeMessages(allMessages);

  if (normalized.length <= MAX_HISTORY_MESSAGES) {
    return;
  }

  const keptNormalized = normalized.slice(-MAX_HISTORY_MESSAGES);
  const firstKeptId = keptNormalized[0]?.id;
  const keepIndex = firstKeptId
    ? allMessages.findIndex((msg) => msg.id === firstKeptId)
    : 0;

  if (keepIndex <= 0) {
    return;
  }

  const removedMessages = allMessages
    .slice(0, keepIndex)
    .filter((msg) => Boolean(msg.id))
    .map((msg) => msg.id);

  const removedIds = [...new Set(removedMessages)];
  const oldNormalized = normalized.slice(0, normalized.length - MAX_HISTORY_MESSAGES);
  const summary = await summarizeMessages(oldNormalized);

  const summaryMessage = new SystemMessage({
    content: `${HISTORY_SUMMARY_PREFIX}\n${summary}`,
  });

  await numorAgent.updateState(
    { configurable: { thread_id: threadId } },
    {
      messages: [
        ...removedIds.map((id) => new RemoveMessage({ id })),
        summaryMessage,
      ],
    }
  );

  chatLogger.info({
    event: "CHAT_HISTORY_PRUNED",
    userId: user.userId,
    sessionId: user.sessionId,
    originalMessages: normalized.length,
    keptMessages: MAX_HISTORY_MESSAGES,
    droppedMessages: removedMessages.length,
    summaryLength: summary.length,
  });
}

async function handleChatStream(user, message, res) {
  const agentStart = Date.now();

  try {
    chatLogger.info({
      event: "CHAT_REQUEST_RECEIVED",
      userId: user.userId,
      sessionId: user.sessionId,
      role: user.role,
      messageLength: message.length,
    });

    // 🔥 Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    await ensureConversationWindow(user);

    let fullResponse = "";

    const stream = await numorAgent.stream(
      {
        messages: [{ role: "user", content: buildStyledUserMessage(message) }],
      },
      {
        configurable: {
          thread_id: `session-${user.sessionId}`,
          context: {
            userId: user.userId.toString(),
            role: user.role,
            orgId: user.orgId,
          },
        },
        streamMode: "messages", // 🔥 token streaming
      }
    );

    for await (const [chunk, metadata] of stream) {

      const type = chunk?._getType?.();
      // console.log("STREAM CHUNK:", { type, content: chunk.content, metadata });

      // Ignore tool output
      if (type === "tool") continue;

      // Only stream AI tokens
      if (type === "ai" && chunk.content) {
        fullResponse += chunk.content;
        console.log("STREAMING CHUNK:", chunk.content);
        res.write(`data: ${chunk.content}\n\n`);
      }
    }

    const agentLatency = Date.now() - agentStart;

    chatLogger.info({
      event: "AGENT_STREAM_COMPLETED",
      agentLatencyMs: agentLatency,
      userId: user.userId,
      sessionId: user.sessionId,
    });

    // End event
    res.write(`event: end\ndata: done\n\n`);
    res.end();
    console.log("Full response:", fullResponse);
    return ensureMarkdownFormatting(fullResponse);

  } catch (error) {
    chatLogger.error({
      event: "CHAT_ERROR",
      error: error.message,
      stack: error.stack,
    });

    res.write(`event: error\ndata: ${error.message}\n\n`);
    res.end();
  }
}

async function handleChat(user, message) {
  const agentStart = Date.now();

  try {
    chatLogger.info({
      event: "CHAT_REQUEST_RECEIVED",
      userId: user.userId,
      sessionId: user.sessionId,
      role: user.role,
      messageLength: message.length,
    });
    await ensureConversationWindow(user);

    const result = await numorAgent.invoke(
      {
        messages: [
          // { role: "system", content: systemPromptContent },
          { role: "user", content: buildStyledUserMessage(message) },
        ],
      },
      {
        configurable: {
          thread_id: `session-${user.sessionId}`,
          context: {
            userId: user.userId.toString(),
            role: user.role,
            orgId: user.orgId,
          },
        },
      }
    );
    const agentLatency = Date.now() - agentStart;

    chatLogger.info({
      event: "AGENT_EXECUTION_COMPLETED",
      agentLatencyMs: agentLatency,
      userId: user.userId,
      sessionId: user.sessionId,
    });

    // console.log(JSON.stringify(result, null, 2));
    const raw = result.messages.at(-1)?.content;
    return ensureMarkdownFormatting(raw);
  }
  catch (error) {
    const agentLatency = Date.now() - agentStart;

    chatLogger.error({
      event: "CHAT_ERROR",
      userId: user.userId,
      sessionId: user.sessionId,
      agentLatencyMs: agentLatency,
      error: error.message,
      stack: error.stack,
    });

    throw error;
  }
}

function detectVerbosityMode(message) {
  const text = String(message || "").toLowerCase();

  if (/(full report|complete report|all details|deep dive|detailed breakdown)/.test(text)) {
    return "full";
  }
  if (/(brief|short|summary|in short|quick)/.test(text)) {
    return "brief";
  }
  return "detailed";
}

function buildStyledUserMessage(message) {
  const mode = detectVerbosityMode(message);
  let instruction = "";

  if (mode === "brief") {
    instruction = "Response mode: brief. Keep answer concise and focused on top findings.";
  } else if (mode === "full") {
    instruction =
      "Response mode: full report. Provide a complete structured answer with sections and clear calculations. If very large, still provide best possible detail and mention which section can be expanded next.";
  } else {
    instruction =
      "Response mode: detailed. Give a structured and practical explanation with key numbers and reasoning.";
  }

  return `${instruction}\n\nUser question:\n${message}`;
}
function ensureMarkdownFormatting(text) {
  if (!text) return text;

  // Convert "*   **ID:**" style to markdown dash format
  return text
    .replace(/\*\s+\*\*/g, "- **") // convert weird bullet format
    .replace(/\n\*\s+/g, "\n- ");
}

async function getChatHistory(loggedInUser) {
  const threadId = `session-${loggedInUser.sessionId}`;
  const state = await numorAgent.getState({
    configurable: {
      thread_id: threadId,
    },
  });
  // console.log("RAW STATE:", JSON.stringify(state.values.messages, null, 2));

  return normalizeMessages(state?.values?.messages ?? []);

  // return state?.values?.messages ?? [];
}

function normalizeMessages(messages) {
  return messages
    .filter((msg) => {
      // 1️⃣ Keep Human messages
      if (msg._getType?.() === "human") return true;

      // 2️⃣ Keep only final AI messages (no tool calls)
      if (msg._getType?.() === "ai" && !msg.tool_calls?.length) {
        return true;
      }

      // ❌ Remove tool messages
      // ❌ Remove AI function call messages
      return false;
    })
    .map((msg) => ({
      role: msg._getType() === "human" ? "user" : "assistant",
      content: msg.content,
      id: msg.id,
    }));
}

async function deleteChatHistory(user) {
  const threadId = `session-${user.sessionId}`;

  // 1️⃣ Get current state
  const state = await numorAgent.getState({
    configurable: { thread_id: threadId },
  });

  const messages = state?.values?.messages ?? [];

  if (!messages.length) {
    return { deleted: 0 };
  }

  // 2️⃣ Convert all messages to RemoveMessage
  await numorAgent.updateState(
    {
      configurable: { thread_id: threadId },
    },
    {
      messages: messages.map(
        (m) => new RemoveMessage({ id: m.id })
      ),
    }
  );

  return { deleted: messages.length };
}



module.exports = { handleChat, getChatHistory, deleteChatHistory, handleChatStream };
