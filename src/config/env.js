require("dotenv").config();

const ENVIRONMENT = process.env.ENVIRONMENT || "local"; // "local" | "production" | "lovable"

function pickByEnvironment(variants) {
  return variants[ENVIRONMENT] ?? variants.local;
}

const FRONTEND_URL = pickByEnvironment({
  local: process.env.FRONTEND_URL_LOCAL,
  production: process.env.FRONTEND_URL_PRODUCTION,
  lovable: process.env.FRONTEND_URL_LOVABLE,
});

// The public origin QStash calls back on to reach this process (see
// queues/invoice.qstash.js). Locally that has to be an ngrok tunnel, not
// localhost, since the delivery comes over the internet - and the URL is baked
// into the message at publish time, so use a reserved ngrok domain rather than
// a per-restart random one, or retries will hit a dead host.
const BASE_URL = pickByEnvironment({
  local: process.env.BASE_URL_LOCAL,
  production: process.env.BASE_URL_PRODUCTION,
  lovable: process.env.BASE_URL_PRODUCTION,
});

// Only one physical Google callback route exists (see auth.routes.js:
// GET /api/auth/google-local-storage-based-login), so the redirect_uri only
// ever needs to vary by which backend host is serving it, not by signup type.
const GOOGLE_REDIRECT_URI_LOGIN = pickByEnvironment({
  local: process.env.GOOGLE_REDIRECT_URI_LOCAL,
  production: process.env.GOOGLE_REDIRECT_URI_PRODUCTION,
  lovable: process.env.GOOGLE_REDIRECT_URI_PRODUCTION,
});

// Databases deliberately do NOT use pickByEnvironment: its fallback to the
// local variant would silently point a deployed process at localhost. Here an
// unset variant falls back to the plain DATABASE_URL / CHAT_DATABASE_URL,
// which is how hosted deploys inject their connection string.
function pickDatabaseUrl(variants, fallback) {
  return variants[ENVIRONMENT] ?? fallback;
}

// Keep this resolution in sync with prisma.config.ts, which the Prisma CLI
// reads directly (it never loads this file).
const DATABASE_URL = pickDatabaseUrl(
  {
    local: process.env.DATABASE_URL_LOCAL,
    production: process.env.DATABASE_URL_PRODUCTION,
    lovable: process.env.DATABASE_URL_PRODUCTION,
  },
  process.env.DATABASE_URL
);

// Read-only role used only by the chatbot's generated SQL. Row-level
// security on this role is what keeps model-written queries tenant-safe.
// See prisma/sql/chat-rls-setup.sql.
const CHAT_DATABASE_URL = pickDatabaseUrl(
  {
    local: process.env.CHAT_DATABASE_URL_LOCAL,
    production: process.env.CHAT_DATABASE_URL_PRODUCTION,
    lovable: process.env.CHAT_DATABASE_URL_PRODUCTION,
  },
  process.env.CHAT_DATABASE_URL
);

module.exports = {
  NODE_ENV: process.env.NODE_ENV,
  ENVIRONMENT,
  PORT: process.env.PORT || 4000,

  DATABASE_URL,
  CHAT_DATABASE_URL,

  JWT_SECRET: process.env.JWT_SECRET || "dev_secret",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",

  FF_CA_CORE: process.env.FF_CA_CORE,
  FF_AI_CHATBOT: process.env.FF_AI_CHATBOT,
  // Routes /chatbot/chat/stream to the new StateGraph agent instead of the
  // legacy createAgent one. Both stay wired until the new one is at parity.
  FF_CHAT_GRAPH: process.env.FF_CHAT_GRAPH,

  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GEMINI_ENDPOINT: process.env.GEMINI_ENDPOINT,
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,

  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
  GOOGLE_REDIRECT_URI_LOGIN,

  LINKEDIN_CLIENT_ID: process.env.LINKEDIN_CLIENT_ID,
  LINKEDIN_CLIENT_SECRET: process.env.LINKEDIN_CLIENT_SECRET,
  LINKEDIN_REDIRECT_URI_CA_SIGNUP: process.env.LINKEDIN_REDIRECT_URI_CA_SIGNUP,
  LINKEDIN_REDIRECT_URI_SME_SIGNUP: process.env.LINKEDIN_REDIRECT_URI_SME_SIGNUP,
  LINKEDIN_REDIRECT_URI_LOGIN: process.env.LINKEDIN_REDIRECT_URI_LOGIN,

  FRONTEND_URL,
  FRONTEND_URL_PRODUCTION: process.env.FRONTEND_URL_PRODUCTION,

  BASE_URL,
  QSTASH_TOKEN: process.env.QSTASH_TOKEN,

  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,

  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,

  RESEND_API_KEY: process.env.RESEND_API_KEY,
  EMAIL_FROM: process.env.EMAIL_FROM,

  ZOOM_ACCOUNT_ID: process.env.ZOOM_ACCOUNT_ID,
  ZOOM_CLIENT_ID: process.env.ZOOM_CLIENT_ID,
  ZOOM_CLIENT_SECRET: process.env.ZOOM_CLIENT_SECRET,
  ZOOM_USER_EMAIL: process.env.ZOOM_USER_EMAIL,

  PHONEPE_CLIENT_ID: process.env.PHONEPE_CLIENT_ID,
  PHONEPE_CLIENT_SECRET: process.env.PHONEPE_CLIENT_SECRET,

  ENABLE_PDF_WORKER: process.env.ENABLE_PDF_WORKER,
  RUN_LANGGRAPH_SETUP: process.env.RUN_LANGGRAPH_SETUP,
};
