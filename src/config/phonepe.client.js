const { StandardCheckoutClient, Env } = require('pg-sdk-node');

const clientId = process.env.PHONEPE_CLIENT_ID;
const clientSecret = process.env.PHONEPE_CLIENT_SECRET;
const clientVersion = Number(process.env.PHONEPE_CLIENT_VERSION);

const env =
  process.env.NODE_ENV === 'production'
    ? Env.PRODUCTION
    : Env.SANDBOX;

// 🔥 Singleton client
const phonePeClient = StandardCheckoutClient.getInstance(
  clientId,
  clientSecret,
  clientVersion,
  env
);

module.exports = { phonePeClient };
