const redisClient = require("../config/redis");

function rateLimit({ prefix, limit, window }) {
  return async (req, res, next) => {
    try {
      const userId = req?.user?.id || req.ip;
      const key = `fileud:rate:${prefix}:${userId}`;

      const current = await redisClient.incr(key);

      if (current === 1) {
        await redisClient.expire(key, window);
      }

      if (current > limit) {
        const ttl = await redisClient.ttl(key);
        return res.status(429).json({
          message: `Too many ${prefix} requests. Try again in ${ttl}s.`,
        });
      }

      next();
    } catch (err) {
      console.error("Rate limit middleware error:", err.message);
      res.status(500).json({ message: "Rate limiting failed" });
    }
  };
}

module.exports = { rateLimit };
