const { createClient } = require("redis");
const config = require("./env");
const logger = require("./logger.config");

let redisClient;

function initRedis() {
  if (redisClient) return redisClient;

  redisClient = createClient({
    socket: {
      host: config.redis.host,
      port: config.redis.port,
    },
    password: config.redis.password || undefined,
    database: config.redis.db || 0,
  });

  redisClient.on("connect", () => logger.info("Redis connected"));
  redisClient.on("ready", () => logger.info("Redis ready to use"));
  
  redisClient.on("error", (err) => {
    logger.error("Redis error:", err.message);
    logger.error("Shutting down due to Redis failure...");
    process.kill(process.pid, "SIGTERM");
  });

  redisClient.on("end", () => {
    logger.error("Redis connection ended unexpectedly. Exiting...");
  });

  redisClient.connect().catch((err) => {
    logger.error("Failed to connect to Redis:", err.message);
    process.kill(process.pid, "SIGTERM");
  });

  return redisClient;
}

module.exports = initRedis;
