const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const File = require("../models/file.model");
const User = require("../models/user.model");
const initRedis = require("../config/redis");
const logger = require("../config/logger.config");
const { streamFile } = require("../util/stream.util");

const redis = initRedis();

const { TEMP_DIR, UPLOAD_DIR } = require("../middleware/upload.middleware");
const { getUserByToken } = require("../util/jwt.util");

exports.uploadFile = async (req, res) => {
  const reqId = req.id;
  logger.info(`[${reqId}] Starting file upload`);

  try {
    if (!req.file) {
      logger.info(`[${reqId}] No file uploaded`);
      return res.status(400).json({ message: "No file uploaded" });
    }

    const userId = req.user.id;
    const tempPath = path.join(TEMP_DIR, req.file.filename);
    const finalPath = path.join(UPLOAD_DIR, req.file.filename);

    // Handle aborted uploads
    req.on("aborted", () => {
      if (fs.existsSync(tempPath)) {
        fs.unlink(tempPath, (err) => {
          if (err)
            logger.error(
              `[${reqId}] Failed to delete aborted upload: ${err.message}`
            );
          else
            logger.info(
              `[${reqId}] Aborted upload removed: ${req.file.filename}`
            );
        });
      }
    });

    // Move file from temp → uploads
    await fs.promises.rename(tempPath, finalPath);

    const fileDoc = new File({
      user: userId,
      name: req.file.filename, // stored name (renamed)
      actualName: req.file.originalname, // original filename
      size: req.file.size, // file size in bytes
      mimeType: req.file.mimetype, // MIME type (e.g., "image/png")
    });

    await fileDoc.save();

    logger.info(
      `[${reqId}] File uploaded successfully by user ${userId} — ${req.file.originalname}`
    );

    return res.status(201).json({
      message: "File uploaded successfully",
      file: {
        id: fileDoc._id,
        actualName: fileDoc.actualName,
        createdAt: fileDoc.createdAt,
        size: fileDoc.size,
        mimeType: fileDoc.mimeType,
      },
    });
  } catch (err) {
    logger.error(`[${reqId}] Upload error: ${err.message} ${err.stack}`);
    res.status(500).json({ message: "File upload failed" });
  } finally {
    logger.info(`[${reqId}] Completed file upload`);
  }
};
exports.downloadFile = async (req, res) => {
  const reqId = req.id;
  const fileId = req.params.id;
  const cacheKey = `fileud:fileinfo:${fileId}`;
  logger.info(`[${reqId}] Starting file download`);

  try {
    if (!fileId || !mongoose.Types.ObjectId.isValid(fileId)) {
      logger.warn(`[${reqId}] Invalid or missing file ID`);
      return res.status(400).json({ message: "Invalid file ID" });
    }

    let fileData;
    const cached = await redis.get(cacheKey);

    if (cached) {
      fileData = JSON.parse(cached);
      logger.info(`[${reqId}] Cache hit for file ${fileId}`);
    } else {
      const file = await File.findById(fileId)
        .select("name actualName user public mimeType size createdAt")
        .populate("user", "email name");

      if (!file) {
        logger.info(`[${reqId}] File not found in DB`);
        return res.status(404).json({ message: "File not found" });
      }

      fileData = {
        id: file.id,
        name: file.name,
        actualName: file.actualName,
        userId: file.user._id.toString(),
        user: { name: file.user.name },
        public: file.public,
        mimeType: file.mimeType,
        size: file.size,
      };

      await redis.set(cacheKey, JSON.stringify(fileData), { EX: 3600 });
      logger.info(`[${reqId}] Cached file info for ${fileId}`);
    }

    if (!fileData.public) {
      const user = getUserByToken(req);
      if (!user) {
        logger.warn(`[${reqId}] Unauthorized download attempt (no token)`);
        return res.status(403).json({ message: "Access denied" });
      }
      console.log(typeof user.id,typeof fileData.user.id, fileData)
      if (user.id !== fileData.user.id) {
        logger.warn(`[${reqId}] Unauthorized access to ${fileId}`);
        return res.status(404).json({ message: "File not found" });
      }
    }

    const filePath = path.join(UPLOAD_DIR, fileData.name);
    if (!fs.existsSync(filePath)) {
      logger.error(`[${reqId}] File missing on server: ${filePath}`);
      return res.status(404).json({ message: "File missing from server" });
    }

    streamFile(filePath, fileData.actualName, res, reqId);
  } catch (err) {
    logger.error(`[${reqId}] Download error: ${err.message}`, {
      stack: err.stack,
    });
    if (!res.headersSent)
      res.status(500).json({ message: "File download failed" });
  } finally {
    logger.info(`[${reqId}] Completed file download`);
  }
};

exports.listFiles = async (req, res) => {
  const reqId = req.id;
  logger.info(`[${reqId}] Starting file list retrieval`);

  try {
    const userId = req.user.id;
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const DEFAULT_LIMIT = 10;
    const MAX_LIMIT = 50;
    const limit = Math.min(
      parseInt(req.query.limit) || DEFAULT_LIMIT,
      MAX_LIMIT
    );
    const skip = (page - 1) * limit;

    const total = await File.countDocuments({ user: userId });

    const files = await File.find({ user: userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select("id actualName size mimeType public createdAt");

    const hasMore = skip + files.length < total;

    logger.info(
      `[${reqId}] Retrieved ${files.length} files for user ${userId}`
    );

    res.json({ total, files, hasMore });
  } catch (err) {
    logger.error(`[${reqId}] List files error: ${err.message} ${err.stack}`);
    res.status(500).json({ message: "Failed to list files" });
  } finally {
    logger.info(`[${reqId}] Completed file list retrieval`);
  }
};

exports.getFileInfo = async (req, res) => {
  const reqId = req.id;
  const fileId = req.params.id;
  const cacheKey = `fileud:fileinfo:${fileId}`;
  logger.info(`[${reqId}] Starting file info fetch`);

  try {
    if (!fileId || mongoose.Types.ObjectId.isValid(fileId) === false) {
      logger.warn(`[${reqId}] File ID is invalid`);
      return res.status(400).json({ message: "File ID is invalid" });
    }

    let fileData;
    const cached = await redis.get(cacheKey);
    if (cached) {
      fileData = JSON.parse(cached);
      logger.info(`[${reqId}] Cache hit for file ${fileId}`);
    } else {
      const file = await File.findById(fileId)
        .select("name actualName user public mimeType createdAt size")
        .populate("user", "email name");

      if (!file) {
        logger.info(`[${reqId}] File not found`);
        return res.status(404).json({ message: "File not found" });
      }
      fileData = {
        id: file.id,
        name: file.name,
        actualName: file.actualName,
        user: {
          name: file.user.name,
          id: file.user._id,
        },
        public: file.public,
        mimeType: file.mimeType,
        createdAt: file.createdAt,
        size: file.size,
      };

      redis.set(cacheKey, JSON.stringify(fileData), { EX: 3600 });
      logger.info(`[${reqId}] Cached file info for ${fileId}`);
    }

    if (fileData.public) {
      return res.json({
        message: "Successfully fetched public file info",
        file: fileData,
      });
    }

    const user = getUserByToken(req);
    if (!user) {
      logger.warn(`[${reqId}] Unauthorized access attempt for ${fileId}`);
      return res.status(403).json({ message: "Access to this file is denied" });
    }

    if (user._id !== fileData.userId) {
      logger.warn(`[${reqId}] Unauthorized access attempt for ${fileId}`);
      return res.status(404).json({ message: "File not found" });
    }

    return res.json({
      message: "Successfully fetched private file info",
      file: fileData,
    });
  } catch (err) {
    logger.error(`[${reqId}] File info error: ${err.message}`, {
      stack: err.stack,
    });
    return res.status(500).json({ message: "Failed to fetch file info" });
  } finally {
    logger.info(`[${reqId}] Completed file info fetch`);
  }
};

exports.updatePublicStatus = async (req, res) => {
  const reqId = req.id;
  logger.info(`[${reqId}] Starting file public status update`);

  try {
    const fileId = req.params.id;
    const { isPublic } = req.body;

    if (!fileId || typeof isPublic !== "boolean") {
      logger.warn(`[${reqId}] Missing or invalid fileId / isPublic in request`);
      return res
        .status(400)
        .json({ message: "Valid fileId and boolean isPublic are required" });
    }

    const file = await File.findById(fileId).select(
      "id name actualName size mimeType public createdAt"
    );
    if (!file) {
      logger.info(`[${reqId}] File not found`);
      return res.status(404).json({ message: "File not found" });
    }

    if (file.public === isPublic) {
      logger.info(
        `[${reqId}] No change in public status for ${file.actualName}`
      );
      return res.json({ message: "No change needed", file });
    }

    file.public = isPublic;
    await file.save();

    const cacheKey = `fileud:fileinfo:${fileId}`;
    redis
      .del(cacheKey)
      .then(() => logger.info(`[${reqId}] Cache deleted for ${fileId}`))
      .catch((err) =>
        logger.error(
          `[${reqId}] Cache delete error: ${err.message} ${err.stack}`
        )
      );

    logger.info(
      `[${reqId}] File public status updated successfully: ${file.actualName}`
    );
    res.json({ message: "File public status updated successfully", file });
  } catch (err) {
    logger.error(
      `[${reqId}] File public status update error: ${err.message} ${err.stack}`
    );
    res.status(500).json({ message: "Failed to update file public status" });
  } finally {
    logger.info(`[${reqId}] Completed file public status update`);
  }
};

exports.deleteFile = async (req, res) => {
  const reqId = req.id;
  logger.info(`[${reqId}] Starting file deletion`);

  try {
    const userId = req.user.id;
    const file = await File.findById(req.params.id);

    if (!file) {
      logger.info(`[${reqId}] File not found`);
      return res.status(404).json({ message: "File not found" });
    }

    if (file.user.toString() !== userId) {
      logger.info(`[${reqId}] Unauthorized delete attempt`);
      return res.status(403).json({ message: "Unauthorized" });
    }

    const filePath = path.join(UPLOAD_DIR, file.name);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      logger.info(`[${reqId}] File removed from disk`);
    }

    await File.findByIdAndDelete(file._id);
    await redis.del(`fileud:fileinfo:${req.params.id}`);

    logger.info(`[${reqId}] File deleted successfully: ${file.actualName}`);

    res.json({ message: "File deleted successfully" });
  } catch (err) {
    logger.error(`[${reqId}] Delete file error: ${err.message} ${err.stack}`);
    res.status(500).json({ message: "File deletion failed" });
  } finally {
    logger.info(`[${reqId}] Completed file deletion`);
  }
};
