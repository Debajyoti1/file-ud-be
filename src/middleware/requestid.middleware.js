const { v4: uuidv4 } = require("uuid");

function requestIdMiddleware(req, res, next) {
  const existingId = req.headers["x-request-id"];
  const requestId = existingId || uuidv4();

  req.id = requestId;

  res.setHeader("X-Request-ID", requestId);

  next();
}

module.exports = requestIdMiddleware;
