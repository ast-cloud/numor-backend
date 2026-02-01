const { success } = require("zod");
const { get } = require("./chat.route");
const { handleChat, getChatHistory } = require("./chat.service");

function normalizeMessages(messages = []) {
  return messages.map(m => ({
    role: m.type === "human" ? "user" : "assistant",
    content: m.content,
    id: m.id,
  }));
}

async function chat(req, res) {
  try {
    const user = req.user;
    const { message } = req.body;

    if (!user.userId || !message) {
      return res.status(400).json({
        error: "userId and message are required",
      });
    }

    const reply = await handleChat(user, message);

    return res.json({ reply });
  } catch (err) {
    console.error("Chat Controller Error:", err);
    return res.status(500).json({
      error: "Chatbot failed",
      details: err.message,
    });
  }
}

async function chatHistory(req, res) {
  try {
    const user = req.user;
    const message = await getChatHistory(user);
    console.log("Fetched chat history:", message);
    return res.json({
      success: true,
      history: normalizeMessages(message)
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


module.exports = { chat, chatHistory };
