const express = require("express");
const { metricsHandler } = require("./src/util/metrics.util"); // adjust path if needed
const logger = require("./src/config/logger.config");

function startMetricsServer() {
  const app = express();

  // Security hardening
  app.disable("x-powered-by");

  // NO middleware here (no cors, no helmet, no auth)
  // Prometheus expects a fast, clean endpoint

  app.get("/metrics", metricsHandler);

  const server = app.listen(9100, () => {
    logger.info("Metrics server running on port 9100");
  });

  return server;
}

module.exports = startMetricsServer;
