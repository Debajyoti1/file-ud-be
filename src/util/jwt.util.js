const jwt = require("jsonwebtoken");
const config = require("../config/env");

exports.getUserByToken = (req) => {
  const token = req.cookies?.accessToken;
  if (!token) {
    return null;
  }

  try {
    const decoded = jwt.verify(token, config.jwt.accessSecret);
    return decoded;
  } catch (err) {
    console.error("Token verification failed:", err.message);
    return null;
  }
};
