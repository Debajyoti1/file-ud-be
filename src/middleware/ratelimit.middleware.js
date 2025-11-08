const redisClient = require("../config/redis");

/**
 * Generic Redis-based rate limiter middleware
 * @param {Object} options
 * @param {String} options.prefix - Prefix for Redis key (e.g., "upload", "download")
 * @param {Number} options.limit - Number of allowed requests in time window
 * @param {Number} options.window - Time window in seconds
 */
function rateLimit({ prefix, limit, window }) {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id || req.ip; // fallback for unauthenticated routes
      const key = `rate:${prefix}:${userId}`;

      // Lua-like atomic increment and TTL set
      const current = await redisClient.incr(key);

      if (current === 1) {
        // first time set expiry
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
      console.error("❌ Rate limit middleware error:", err.message);
      res.status(500).json({ message: "Rate limiting failed" });
    }
  };
}

module.exports = { rateLimit };
