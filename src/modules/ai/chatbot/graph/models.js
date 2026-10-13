// The three models the chat graph uses, one per node that calls an LLM.
//
// maxRetries is 1 everywhere: LangChain's default of 6 with backoff turns a
// Gemini outage into a request that hangs for minutes. Failing fast lets each
// node fall back to its own error path instead.

const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
// Loads .env. ChatGoogleGenerativeAI reads GOOGLE_API_KEY from the environment
// when it is constructed, so this has to come first.
require("../../../../config/env");

// "nostream" keeps a model call out of streamMode "messages". Only the answer
// model's tokens are meant for the user; the router's JSON and the generated
// SQL are not. Applied with .withConfig(HIDDEN) after withStructuredOutput().
const HIDDEN = { tags: ["nostream"] };

// Scope check + question rewrite. Small and fast; runs on every message.
const routerModel = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash-lite",
  temperature: 0,
  maxOutputTokens: 400,
  maxRetries: 1,
});

// Writes SQL. A small thinking budget helps on multi-part questions; thinking
// tokens count against maxOutputTokens, hence the headroom.
const sqlModel = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash",
  temperature: 0,
  maxOutputTokens: 4000,
  maxRetries: 1,
  thinkingConfig: { thinkingBudget: 1024 },
});

// Writes the reply the user reads. Thinking is off so the first token arrives
// quickly - the facts are already fetched by the time this runs.
const answerModel = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash",
  temperature: 0.2,
  maxOutputTokens: 1500,
  maxRetries: 1,
  streaming: true,
  thinkingConfig: { thinkingBudget: 0 },
});

/** Rejects if `promise` has not settled within `ms`. */
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, rejectTimeout) => {
    timer = setTimeout(() => rejectTimeout(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Message content as plain text. Gemini can return a list of parts. */
function textOf(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => (typeof part === "string" ? part : part?.text ?? "")).join("");
  }
  return "";
}

module.exports = { routerModel, sqlModel, answerModel, HIDDEN, withTimeout, textOf };
