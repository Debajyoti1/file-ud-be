const jwt = require("jsonwebtoken");
const config = require("../config/env");

const verifyAccessToken = (req, res, next) => {
  try {
    const token = req.cookies?.accessToken;
    if (!token) {
      return res.status(401).json({ message: "Access token missing" });
    }

    jwt.verify(token, config.jwt.accessSecret, (err, decoded) => {
      if (err) {
        console.error("Access token verification failed:", err.message);
        return res.status(403).json({ message: "Invalid or expired token" });
      }

      req.user = { id: decoded.id, email: decoded.email };
      next();
    });
  } catch (err) {
    console.error("Token verification error:", err.message);
    res.status(403).json({ message: "Invalid or expired token" });
  }
};

module.exports = {
  verifyAccessToken,
};
