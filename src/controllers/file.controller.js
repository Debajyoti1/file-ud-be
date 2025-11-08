const fs = require("fs");
const path = require("path");
const util = require("util");
const File = require("../models/file.model");
const User = require("../models/user.model");
const initRedis = require("../config/redis");
const logger = require("../config/logger.config");
const { streamFile } = require("../util/stream.util");

const redis = initRedis();

const { TEMP_DIR, UPLOAD_DIR } = require("../middleware/upload.middleware");

// --------------------
// UPLOAD CONTROLLER
// --------------------
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
// DOWNLOAD CONTROLLER
exports.downloadFile = async (req, res) => {
  const reqId = req.id;
  logger.info(`[${reqId}] Starting file download`);

  try {
    const userId = req.user?.id;
    const { id: fileId } = req.params;
    if (!fileId) {
      logger.warn(`[${reqId}] Missing file ID in request`);
      return res.status(400).json({ message: "File ID is required" });
    }

    const cacheKey = `fileud:fileinfo:${fileId}`;
    let fileData;

    // --- Try cache first ---
    const cached = await redis.get(cacheKey);
    if (cached) {
      fileData = JSON.parse(cached);
      logger.info(`[${reqId}] Cache hit for ${fileId}`);
    } else {
      // --- Fallback: DB ---
      const file = await File.findById(fileId);
      if (!file) {
        logger.info(`[${reqId}] File not found in DB`);
        return res.status(404).json({ message: "File not found" });
      }

      fileData = {
        id: file.id,
        name: file.name,
        actualName: file.actualName,
        userId: file.user.toString(),
        public: file.public,
      };

      await redis.set(cacheKey, JSON.stringify(fileData), { EX: 600 });
      logger.info(`[${reqId}] Cached file info for ${fileId}`);
    }

    // --- Access control ---
    if (!fileData.public && fileData.userId !== userId) {
      logger.info(`[${reqId}] Unauthorized download attempt`);
      return res.status(403).json({ message: "Unauthorized access" });
    }

    // --- Verify file exists ---
    const filePath = path.join(UPLOAD_DIR, fileData.name);
    if (!fs.existsSync(filePath)) {
      logger.error(`[${reqId}] File missing from server: ${filePath}`);
      return res.status(404).json({ message: "File missing from server" });
    }

    // --- Stream it efficiently ---
    streamFile(filePath, fileData.actualName, res, reqId);
  } catch (err) {
    logger.error(`[${reqId}] Download error: ${err.message}\n${err.stack}`);
    if (!res.headersSent)
      res.status(500).json({ message: "File download failed" });
  } finally {
    logger.info(`[${reqId}] Completed file download`);
  }
};

exports.downloadFileNoAuth = async (req, res) => {
  const reqId = req.id;
  logger.info(`[${reqId}] Starting file download no auth`);

  try {
    const { id: fileId } = req.params;
    if (!fileId) {
      logger.warn(`[${reqId}] Missing file ID in request`);
      return res.status(400).json({ message: "File ID is required" });
    }

    const cacheKey = `fileud:fileinfo:${fileId}`;
    let fileData;

    // --- Try cache first ---
    const cached = await redis.get(cacheKey);
    if (cached) {
      fileData = JSON.parse(cached);
      logger.info(`[${reqId}] Cache hit for ${fileId}`);
    } else {
      // --- Fallback: DB ---
      const file = await File.findById(fileId);
      if (!file) {
        logger.info(`[${reqId}] File not found in DB`);
        return res.status(404).json({ message: "File not found" });
      }

      fileData = {
        id: file.id,
        name: file.name,
        actualName: file.actualName,
        userId: file.user.toString(),
        public: file.public,
      };

      await redis.set(cacheKey, JSON.stringify(fileData), { EX: 600 });

      logger.info(`[${reqId}] Cached file info for ${fileId}`);
    }

    // --- Access control ---
    if (!fileData.public) {
      logger.info(`[${reqId}] Unauthorized download attempt`);
      return res.status(404).json({ message: "File not found" });
    }

    // --- Verify file exists ---
    const filePath = path.join(UPLOAD_DIR, fileData.name);
    if (!fs.existsSync(filePath)) {
      logger.error(`[${reqId}] File missing from server: ${filePath}`);
      return res.status(404).json({ message: "File missing from server" });
    }

    // --- Stream it efficiently ---
    streamFile(filePath, fileData.actualName, res, reqId);
  } catch (err) {
    logger.error(`[${reqId}] Download error: ${err.message}\n${err.stack}`);
    if (!res.headersSent)
      res.status(500).json({ message: "File download no auth failed" });
  } finally {
    logger.info(`[${reqId}] Completed file download no auth`);
  }
};
// LIST FILES
exports.listFiles = async (req, res) => {
  const reqId = req.id;
  logger.info(`[${reqId}] Starting file list retrieval`);

  try {
    const userId = req.user.id;
    const files = await File.find({ user: userId })
      .sort({ createdAt: -1 })
      .select("id actualName size mimeType createdAt");

    logger.info(
      `[${reqId}] Retrieved ${files.length} files for user ${userId}`
    );

    res.json({
      total: files.length,
      files,
    });
  } catch (err) {
    logger.error(`[${reqId}] List files error: ${err.message} ${err.stack}`);
    res.status(500).json({ message: "Failed to list files" });
  } finally {
    logger.info(`[${reqId}] Completed file list retrieval`);
  }
};

// Get file info
exports.getFileInfo = async (req, res) => {
  const reqId = req.id;
  logger.info(`[${reqId}] Starting file info fetch`);

  try {
    const fileId = req.params.id;
    const cacheKey = `fileud:fileinfo:${fileId}`;

    const cached = await redis.get(cacheKey);
    if (cached) {
      logger.info(`[${reqId}] Cache hit for ${fileId}`);
      return res.json(JSON.parse(cached));
    }

    const file = await File.findById(fileId).populate("user", "email name");
    if (!file) {
      logger.info(`[${reqId}] File not found`);
      return res.status(404).json({ message: "File not found" });
    }

    const info = {
      id: file._id,
      actualName: file.actualName,
      uploadedBy: file.user?.name,
      email: file.user?.email,
      uploadedAt: file.createdAt,
    };

    await redis.set(cacheKey, JSON.stringify(fileData), { EX: 600 });

    logger.info(`[${reqId}] Cached file info for ${fileId}`);

    res.json(info);
  } catch (err) {
    logger.error(`[${reqId}] File info error: ${err.message} ${err.stack}`);
    res.status(500).json({ message: "Failed to fetch file info" });
  } finally {
    logger.info(`[${reqId}] Completed file info fetch`);
  }
};
// Get file info without authentication
exports.getFileInfoNoAuth = async (req, res) => {
  const reqId = req.id;
  logger.info(`[${reqId}] Starting file info fetch`);

  try {
    const fileId = req.params.id;
    if (!fileId) {
      logger.warn(`[${reqId}] Missing file ID in request`);
      return res.status(400).json({ message: "File ID is required" });
    }

    const cacheKey = `fileud:fileinfo:${fileId}`;

    // --- Try cache first ---
    const cachedData = await redis.get(cacheKey);
    if (cachedData) {
      logger.info(`[${reqId}] Cache hit for ${fileId}`);

      try {
        const cachedJson = JSON.parse(cachedData);

        // If the file is not public, act as if not found
        if (!cachedJson.public) {
          logger.info(`[${reqId}] Non-public file access attempt (cached)`);
          return res.status(404).json({ message: "File not found" });
        }

        return res.json(cachedJson);
      } catch (parseErr) {
        logger.warn(
          `[${reqId}] Failed to parse cached data for ${fileId}: ${parseErr.message}`
        );
      }
    }

    // --- Fetch from DB ---
    const file = await File.findById(fileId).populate("user", "email name");
    if (!file) {
      logger.info(`[${reqId}] File not found in DB`);
      return res.status(404).json({ message: "File not found" });
    }

    // If file is not public, hide its existence
    if (!file.public) {
      logger.info(`[${reqId}] Non-public file access attempt (DB)`);
      return res.status(404).json({ message: "File not found" });
    }

    // --- Prepare response object ---
    const info = {
      id: file._id,
      actualName: file.actualName,
      uploadedBy: file.user?.name || "Unknown",
      email: file.user?.email || null,
      uploadedAt: file.createdAt,
      public: file.public,
    };

    // --- Cache result for 10 minutes ---
    await redis.set(cacheKey, JSON.stringify(info), { EX: 600 });

    logger.info(`[${reqId}] Cached public file info for ${fileId}`);

    return res.json(info);
  } catch (err) {
    logger.error(`[${reqId}] File info error: ${err.message}\n${err.stack}`);
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

    // Basic validation
    if (!fileId || typeof isPublic !== "boolean") {
      logger.warn(`[${reqId}] Missing or invalid fileId / isPublic in request`);
      return res
        .status(400)
        .json({ message: "Valid fileId and boolean isPublic are required" });
    }

    // Fetch file
    const file = await File.findById(fileId).select(
      "id name actualName public createdAt"
    );
    if (!file) {
      logger.info(`[${reqId}] File not found`);
      return res.status(404).json({ message: "File not found" });
    }
    console.log(file.toJSON);
    console.log(file.public, isPublic);
    // Update status only if it’s changed
    if (file.public === isPublic) {
      logger.info(
        `[${reqId}] No change in public status for ${file.actualName}`
      );
      return res.json({ message: "No change needed", file });
    }

    // Update and save
    file.public = isPublic;
    await file.save();

    // Prepare info for cache
    const cacheKey = `fileud:fileinfo:${fileId}`;
    // Update cache (or recreate)
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

// DELETE FILE
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
