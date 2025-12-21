const client = require("prom-client");
const config = require('../config/env');

/**
 * ---------------------------------------------------------
 * 1. Registry
 * ---------------------------------------------------------
 */
const register = new client.Registry();

// Default labels
register.setDefaultLabels({
  app: config.app.name,
  env: config.app.env
});

/**
 * ---------------------------------------------------------
 * 2. Default Node.js metrics
 * ---------------------------------------------------------
 */
client.collectDefaultMetrics({
  register,
  prefix: "fileudbe_",
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2]
});

/**
 * ---------------------------------------------------------
 * 3. Event loop lag
 * ---------------------------------------------------------
 */
const eventLoopLag = new client.Gauge({
  name: "fileudbe_nodejs_event_loop_lag_seconds",
  help: "Event loop lag in seconds",
  registers: [register]
});

setInterval(() => {
  const start = process.hrtime.bigint();
  setImmediate(() => {
    const delta = Number(process.hrtime.bigint() - start) / 1e9;
    eventLoopLag.set(delta);
  });
}, 5000).unref();

/**
 * ---------------------------------------------------------
 * 4. HTTP RED metrics (prefixed)
 * ---------------------------------------------------------
 */
const httpRequestsTotal = new client.Counter({
  name: "fileudbe_http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status"],
  registers: [register]
});

const httpRequestDuration = new client.Histogram({
  name: "fileudbe_http_request_duration_ms",
  help: "HTTP request latency",
  labelNames: ["method", "route", "status"],
  buckets: [
    25, 50, 100, 200, 300,
    500, 750, 1000, 1500, 2000, 5000
  ],
  registers: [register]
});

const httpRequestsInFlight = new client.Gauge({
  name: "fileudbe_http_requests_in_flight",
  help: "Number of in-flight HTTP requests",
  registers: [register]
});

/**
 * ---------------------------------------------------------
 * 5. Route normalization helper
 * ---------------------------------------------------------
 */
function normalizeRoute(req) {
  // req.route?.path works for normal routes
  if (req.route?.path) return req.baseUrl + req.route.path;
  // For dynamic routes with IDs, replace numbers with :id
  const path = req.path || req.originalUrl || "unknown";
  return path.replace(/\d+/g, ":id");
}

/**
 * ---------------------------------------------------------
 * 6. Express middleware
 * ---------------------------------------------------------
 */
function metricsMiddleware(req, res, next) {
  httpRequestsInFlight.inc();
  const endTimer = httpRequestDuration.startTimer();

  res.on("finish", () => {
    httpRequestsInFlight.dec();

    const route = normalizeRoute(req);
    const labels = {
      method: req.method,
      route,
      status: res.statusCode
    };

    httpRequestsTotal.inc(labels);
    endTimer(labels);
  });

  next();
}

/**
 * ---------------------------------------------------------
 * 7. Metrics endpoint
 * ---------------------------------------------------------
 */
async function metricsHandler(req, res) {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
}

/**
 * ---------------------------------------------------------
 * 8. Graceful shutdown
 * ---------------------------------------------------------
 */
function shutdownMetrics() {
  register.clear();
}

/**
 * ---------------------------------------------------------
 * 9. Exports
 * ---------------------------------------------------------
 */
module.exports = {
  register,
  metricsMiddleware,
  metricsHandler,
  httpRequestsTotal,
  httpRequestDuration,
  httpRequestsInFlight,
  shutdownMetrics
};
