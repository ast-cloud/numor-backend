const { success } = require("zod");
const { handleChat, getChatHistory, deleteChatHistory, handleChatStream } = require("./chat.service");
const chatLogger = require("../../../utils/chat.logger");

async function chatStream(req, res) {
  const start = Date.now();

  try {
    const user = req.loggedInUser;
    const { message } = req.body;

    await handleChatStream(user, message, res);

    const totalLatency = Date.now() - start;

    chatLogger.info({
      event: "CHAT_API_COMPLETED",
      userId: user.userId,
      sessionId: user.sessionId,
      apiLatencyMs: totalLatency,
    });

  } catch (err) {
    chatLogger.error({
      event: "CHAT_API_FAILED",
      error: err.message,
      stack: err.stack,
    });

    if (!res.headersSent) {
      return res.status(500).json({
        error: "Chatbot failed",
        details: err.message,
      });
    }
  }
}

async function chat(req, res) {
  const start = Date.now();

  try {
    const user = req.loggedInUser;
    const { message } = req.body;

    const reply = await handleChat(user, message);

    const totalLatency = Date.now() - start;

    chatLogger.info({
      event: "CHAT_API_COMPLETED",
      userId: user.userId,
      sessionId: user.sessionId,
      apiLatencyMs: totalLatency,
    });

    return res.json({ reply });

  } catch (err) {
    chatLogger.error({
      event: "CHAT_API_FAILED",
      error: err.message,
      stack: err.stack,
    });

    return res.status(500).json({
      error: "Chatbot failed",
      details: err.message,
    });
  }
}


async function chatHistory(req, res) {
  try {
    const user = req.loggedInUser;
    const message = await getChatHistory(user);
    // console.log("Fetched chat history:", message);
    return res.json({
      success: true,
      history: message
    });
  }
  catch (err) {
    console.error("Error fetching chat history:", err);
    return res.status(500).json({
      error: "Failed to fetch chat history",
      details: err.message,
    });
  }
}

async function deleteHistory(req, res) {
  try {
    const result = await deleteChatHistory(req.loggedInUser);

    return res.json({
      success: true,
      message: "Chat history deleted successfully",
      deletedCount: result.deleted,
    });
  } catch (error) {
    console.error("Delete chat history error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete chat history",
    });
  }
}

module.exports = { chat, chatHistory, deleteHistory, chatStream };
