const { v4: uuidv4 } = require("uuid");
const logger = require("../config/logger.config");


function requestIdMiddleware(req, res, next) {
 const requestId = uuidv4();
  req.id = requestId;

  const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const method = req.method;
  const uri = req.originalUrl;

  logger.info(`[${requestId}] Incoming request: ${method} ${uri} - IP: ${ip}`);

  res.setHeader("X-Request-ID", requestId);

  next();
}

module.exports = requestIdMiddleware;
