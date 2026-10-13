const { numorAgent, checkpointer } = require("../chatbot/agent/numor.agent");
const { numorGraph, USER_FACING_NODES, graphThreadId } = require("./graph/numor.graph");
const { textOf } = require("./graph/models");
const { FLAGS } = require("../../../config/featureFlags");
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

// FF_CHAT_GRAPH switches every entry point below from the legacy createAgent
// loop to the StateGraph in ./graph. The two keep separate threads, so
// flipping the flag starts users on a clean conversation.
const useGraph = () => FLAGS.FF_CHAT_GRAPH;
const MAX_GRAPH_MESSAGE_CHARS = 2000;

const threadIdFor = (user) =>
  useGraph() ? graphThreadId(user.sessionId) : `session-${user.sessionId}`;

function graphInput(message) {
  return {
    messages: [
      { role: "user", content: String(message ?? "").slice(0, MAX_GRAPH_MESSAGE_CHARS) },
    ],
  };
}

function graphConfig(user) {
  return {
    configurable: { thread_id: graphThreadId(user.sessionId) },
    // Read by the nodes as config.context. orgId is what scopes every query.
    context: {
      userId: String(user.userId),
      orgId: String(user.orgId),
      role: user.role,
    },
  };
}

// One "data:" line per line of text, as the SSE format requires. Writing a
// chunk that contains a newline as a single data line cuts the frame short
// and the client loses everything after it.
function writeSseData(res, text) {
  res.write(`${text.split("\n").map((line) => `data: ${line}`).join("\n")}\n\n`);
}

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

    const graph = useGraph();
    let fullResponse = "";
    let stream;

    if (graph) {
      stream = await numorGraph.stream(graphInput(message), {
        ...graphConfig(user),
        streamMode: "messages",
      });
    } else {
      await ensureConversationWindow(user);

      stream = await numorAgent.stream(
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
    }

    for await (const [chunk, metadata] of stream) {

      const type = chunk?._getType?.();
      // console.log("STREAM CHUNK:", { type, content: chunk.content, metadata });

      // Ignore tool output
      if (type === "tool") continue;

      // Graph: only the answer and decline nodes speak to the user. The
      // router's plan and the generated SQL stay internal.
      if (graph && !USER_FACING_NODES.has(metadata?.langgraph_node)) continue;

      // Only stream AI tokens
      const text = type === "ai" ? textOf(chunk.content) : "";
      if (text) {
        fullResponse += text;
        console.log("STREAMING CHUNK:", text);
        writeSseData(res, text);
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

    if (useGraph()) {
      const result = await numorGraph.invoke(graphInput(message), graphConfig(user));
      return textOf(result.messages.at(-1)?.content);
    }

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
  const threadId = threadIdFor(loggedInUser);
  const state = await (useGraph() ? numorGraph : numorAgent).getState({
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
  if (useGraph()) {
    const threadId = graphThreadId(user.sessionId);
    const state = await numorGraph.getState({
      configurable: { thread_id: threadId },
    });
    const count = state?.values?.messages?.length ?? 0;

    // Removes every checkpoint for the thread. RemoveMessage would only empty
    // the latest one and leave the earlier ones, query results included, in
    // the database.
    await checkpointer.deleteThread(threadId);
    return { deleted: count };
  }

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
