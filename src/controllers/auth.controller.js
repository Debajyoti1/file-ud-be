const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/user.model");
const initRedis = require("../config/redis");
const config = require("../config/env");
const logger = require("../config/logger.config");

const redis = initRedis();

const generateAccessToken = (user) =>
  jwt.sign({ id: user._id, email: user.email, name: user.name }, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessExpiry,
  });

const generateRefreshToken = (user) =>
  jwt.sign({ id: user._id, email: user.email, name: user.name }, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiry,
  });

const buildRedisKey = (userId, token) => `fileud:refresh:${userId}:${token}`;

exports.register = async (req, res) => {
  const reqId = req.id;
  logger.info(`[${reqId}] Starting user registration`);

  try {
    const { name, email, password } = req.body;
    const existing = await User.findOne({ email });
    if (existing) {
      logger.info(`[${reqId}] Registration failed — Email already registered`);
      return res.status(400).json({ message: "Email already registered" });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hashed });

    logger.info(`[${reqId}] User registered successfully`);
    res.status(201).json({ message: "User registered successfully", user });
  } catch (err) {
    logger.error(`[${reqId}] Register error: ${err.message} ${err.stack}`);
    res.status(500).json({ message: "Internal server error" });
  } finally {
    logger.info(`[${reqId}] Completed user registration`);
  }
};

exports.login = async (req, res) => {
  const reqId = req.id;
  logger.info(`[${reqId}] Starting user login`);

  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select("name email password");
    if (!user) {
      logger.info(`[${reqId}] Login failed — Invalid email`);
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      logger.info(`[${reqId}] Login failed — Invalid password`);
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    const redisKey = buildRedisKey(user._id, refreshToken);
    await redis.set(redisKey, "valid", { EX: 7 * 24 * 60 * 60 });

    logger.info(`[${reqId}] Login successful for user: ${email}`);

    res
      .cookie("accessToken", accessToken, {
        httpOnly: true,
        secure: config.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 15 * 60 * 1000,
      })
      .cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: config.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      })
      .json({ message: "Login successful", user });
  } catch (err) {
    logger.error(`[${reqId}] Login error: ${err.message} ${err.stack}`);
    res.status(500).json({ message: "Internal server error" });
  } finally {
    logger.info(`[${reqId}] Completed user login`);
  }
};


exports.logout = async (req, res) => {
  const reqId = req.id;
  logger.info(`[${reqId}] Starting logout`);

  try {
    logger.info(`[${reqId}] Logging out user`);
    const token = req?.cookies?.refreshToken;
    if (!token) {
      logger.info(`[${reqId}] Already logged out`);
      return res.status(200).json({ message: "Already logged out" });
    }

    jwt.verify(token, config.jwt.refreshSecret, async (err, decoded) => {
      if (!err) {
        const redisKey = buildRedisKey(decoded.id, token);
        await redis.del(redisKey);
      }
    });

    res.clearCookie("accessToken").clearCookie("refreshToken").json({
      message: "Logged out successfully",
    });

    logger.info(`[${reqId}] Logout successful`);
  } catch (err) {
    logger.error(`[${reqId}] Logout error: ${err.message} ${err.stack}`);
    res.status(500).json({ message: "Internal server error" });
  } finally {
    logger.info(`[${reqId}] Completed logout`);
  }
};

exports.refresh = async (req, res) => {
  const reqId = req.id;
  logger.info(`[${reqId}] Starting token refresh`);

  try {
    const token = req.cookies.refreshToken;
    if (!token) {
      logger.info(`[${reqId}] No refresh token provided`);
      return res.status(403).json({ message: "No refresh token provided" });
    }

    jwt.verify(token, config.jwt.refreshSecret, async (err, decoded) => {
      if (err) {
        logger.error(`[${reqId}] Invalid refresh token`);
        return res.status(403).json({ message: "Invalid refresh token" });
      }

      const redisKey = buildRedisKey(decoded.id, token);
      const exists = await redis.exists(redisKey);

      if (!exists) {
        logger.error(`[${reqId}] Refresh token expired or invalid`);
        return res.status(403).json({ message: "Refresh token expired or invalid" });
      }

      const user = await User.findById(decoded.id);
      if (!user) {
        logger.error(`[${reqId}] User not found during token refresh`);
        return res.status(404).json({ message: "User not found" });
      }

      const newAccessToken = generateAccessToken(user);
      const newRefreshToken = generateRefreshToken(user);

      await redis.del(redisKey);
      const newKey = buildRedisKey(user._id, newRefreshToken);
      await redis.set(newKey, "valid", { EX: 7 * 24 * 60 * 60 });

      logger.info(`[${reqId}] Token refreshed successfully for user: ${user.email}`);

      res
        .cookie("accessToken", newAccessToken, {
          httpOnly: true,
          secure: config.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: 15 * 60 * 1000,
        })
        .cookie("refreshToken", newRefreshToken, {
          httpOnly: true,
          secure: config.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: 7 * 24 * 60 * 60 * 1000,
        })
        .json({ message: "Token refreshed successfully" });
    });
  } catch (err) {
    logger.error(`[${reqId}] Refresh error: ${err.message} ${err.stack}`);
    res.status(500).json({ message: "Internal server error" });
  } finally {
    logger.info(`[${reqId}] Completed token refresh`);
  }
};


exports.getMyInfo = async (req, res) => {
  const reqId = req.id;
  logger.info(`[${reqId}] Starting user info fetch`);

  try {
    const user = await User.findById(req.user.id).select("email name");
    logger.info(`[${reqId}] User info fetched successfully for user: ${user.email}`);
    res.json({message: "User info fetched successfully", user});
  } catch (err) {
    logger.error(`[${reqId}] User info fetch error: ${err.message} ${err.stack}`);
    res.status(500).json({ message: "Internal server error" });
  } finally {
    logger.info(`[${reqId}] Completed user info fetch`);
  }
};