require("dotenv").config();
const config = require("./src/config/env");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const connectDB = require("./src/config/db");
const connectRedis = require("./src/config/redis");
const logger = require("./src/config/logger.config");
const routes = require("./src/routes/index.routes");
const requestIdMiddleware = require("./src/middleware/requestid.middleware");

const app = express();

app.use(cors({
  origin: ["http://localhost:5173","https://file.debajyotidutta.com"],
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  optionsSuccessStatus: 204,
  credentials: true
}));

// Handle unexpected errors early
process.on("uncaughtException", (err) => {
  logger.error("Uncaught Exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", (err) => {
  logger.error("Unhandled Promise Rejection:", err);
  process.exit(1);
});

// Middleware
app.set("trust proxy", true);
app.use(requestIdMiddleware);
app.use(helmet());
app.use(express.urlencoded({ extended: true }));
app.use(express.json({limit: '100kb' }));
app.use(cookieParser());

// Routes
app.use("/", routes);

// Global Error Handler
app.use((err, req, res, next) => {
  logger.error(`[${req.id}]Global error handler:`, err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

// Initialize App
async function initApp() {
  try {
    logger.info("Initializing application...");

    // MongoDB
    const mongoose = await connectDB();
    logger.info("MongoDB connected successfully");

    // Redis
    const redisClient = await connectRedis();
    logger.info("Redis connected successfully");

    // Health checks
    app.locals.mongoConnection = mongoose.connection;
    app.locals.redis = redisClient;

    // Start server
    const PORT = config.app.port || 5000;
    const server = app.listen(PORT, () =>
      logger.info(`Server running on ${PORT}`)
    );

    // Graceful shutdown
    const shutdown = async (signal) => {
      logger.info(`\n Received ${signal}. Shutting down gracefully...`);
      try {
        if (mongoose.connection.readyState === 1) {
          await mongoose.disconnect();
          logger.info("MongoDB connection closed");
        }
        if (redisClient.isOpen) {
          await redisClient.quit();
          logger.info("Redis connection closed");
        }
        server.close(() => {
          logger.info("HTTP server closed");
          process.exit(0);
        });
      } catch (err) {
        logger.error("Error during shutdown:", err);
        process.exit(1);
      }
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (err) {
    logger.error("Failed to initialize application:", err.message);
    process.exit(1);
  }
}

initApp();
