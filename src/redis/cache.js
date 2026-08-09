const { Redis } = require("@upstash/redis");
const { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } = require("../config/env");

const redis = new Redis({
  url: UPSTASH_REDIS_REST_URL,
  token: UPSTASH_REDIS_REST_TOKEN,
});

module.exports = redis;