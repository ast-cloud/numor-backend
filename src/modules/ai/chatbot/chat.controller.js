const { handleChat } = require("./chat.service");

async function chat(req, res) {
  try {
    const user = req.user;
    const {message} = req.body;

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

module.exports = { chat };
