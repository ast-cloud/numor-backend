const buildPrompt = require('../chatBot.prompt');

function buildSystemPrompt({ baseContext, roleContext, lastFetchedData }) {
  // You can wrap buildPrompt with an empty user message for system-level context
  return buildPrompt({
    baseContext,
    roleContext,
    data: lastFetchedData || {},
    message: "SYSTEM_INIT" // or leave empty if you want
  });
}

module.exports = { buildSystemPrompt };
