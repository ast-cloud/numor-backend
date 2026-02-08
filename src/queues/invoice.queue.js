const { Redis } = require('@upstash/redis');
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
});

exports.enqueue = async (payload) => {
  console.log('📥 Enqueuing PDF job:', payload);
  await redis.lpush('numor-invoice-pdf-queue', JSON.stringify(payload));
};
