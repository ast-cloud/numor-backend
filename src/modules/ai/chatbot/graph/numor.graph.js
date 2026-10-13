// The chat graph. Replaces the single createAgent tool loop with fixed steps:
//
//                 START
//                   |
//                router ---- out of scope ----> decline --> END
//                   |
//          +--------+--------+
//     needs data         no source
//          |                 |
//      fetch_sql             |
//          +--------+--------+
//                   |
//                answer --> END
//
// At most three model calls per turn and no loops. Each source is exactly one
// node writing to its own state key, so when more than one is selected they
// run in the same step and `answer` still runs once.
//
// To add a source (the docs / vector search is next):
//   1. a question field in the router's output  (nodes/router.node.js)
//   2. a node that writes its own result key    (nodes/<source>.node.js)
//   3. that key in ChatState, reset by the router each turn
//   4. one line in pickNext, one addNode, one edge to "answer"

const {
  StateGraph,
  Annotation,
  MessagesAnnotation,
  START,
  END,
} = require("@langchain/langgraph");
const { checkpointer } = require("../agent/numor.agent");
const { routerNode } = require("./nodes/router.node");
const { fetchSqlNode } = require("./nodes/fetchSql.node");
const { answerNode } = require("./nodes/answer.node");
const { declineNode } = require("./nodes/decline.node");

const ChatState = Annotation.Root({
  // User messages and final replies only. Plans, SQL and rows never go here.
  ...MessagesAnnotation.spec,
  // { inScope, sqlQuestion, failed } - written by router.
  plan: Annotation(),
  // { status, reason?, queries: [{ purpose, sql, ok, rows?, truncated?, error? }] }
  // - written by fetch_sql.
  sqlResult: Annotation(),
});

// Who is asking. Supplied per request from the JWT and deliberately kept out
// of state, so nothing a model writes can ever change it.
const ChatContext = Annotation.Root({
  userId: Annotation(),
  orgId: Annotation(),
  role: Annotation(),
});

function pickNext({ plan }) {
  if (!plan?.inScope) return "decline";

  const next = [];
  if (plan.sqlQuestion) next.push("fetch_sql");

  return next.length > 0 ? next : "answer";
}

// A node may not share a name with a state key, hence "router" not "plan".
const numorGraph = new StateGraph(ChatState, ChatContext)
  .addNode("router", routerNode)
  .addNode("fetch_sql", fetchSqlNode)
  .addNode("answer", answerNode)
  .addNode("decline", declineNode)
  .addEdge(START, "router")
  .addConditionalEdges("router", pickNext, ["fetch_sql", "answer", "decline"])
  .addEdge("fetch_sql", "answer")
  .addEdge("answer", END)
  .addEdge("decline", END)
  .compile({ checkpointer });

// Nodes whose output is shown to the user. Everything else is internal.
const USER_FACING_NODES = new Set(["answer", "decline"]);

// A separate prefix from the legacy agent's "session-<id>", so the graph never
// loads a checkpoint written in the other agent's state shape.
const graphThreadId = (sessionId) => `graph-session-${sessionId}`;

module.exports = { numorGraph, USER_FACING_NODES, graphThreadId };
