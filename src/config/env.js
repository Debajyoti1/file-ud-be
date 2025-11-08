require("dotenv").config();

const config = {
  app: {
    port: process.env.PORT || 5000,
    env: process.env.NODE_ENV || "development",
  },
  mongo: {
    uri: process.env.MONGO_URI || "mongodb://localhost:27017/myapp",
  },
  redis: {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: process.env.REDIS_PORT || 6379,
    db: process.env.REDIS_DB || 0,
    password: process.env.REDIS_PASSWORD || null,
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || "supersecret",
    refreshSecret: process.env.JWT_REFRESH_SECRET || "refreshsecret",
    accessExpiry: process.env.JWT_ACCESS_EXPIRY || "15m",
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || "7d",
  },
};

module.exports = config;
