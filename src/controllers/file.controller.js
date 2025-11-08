const fs = require("fs");
const path = require("path");
const util = require("util");
const File = require("../models/file.model");
const User = require("../models/user.model");
const redisClient = require("../config/redis");
const logger = require("../config/logger.config");

const pipeline = util.promisify(require("stream").pipeline);

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
            logger.error(`[${reqId}] Failed to delete aborted upload: ${err.message}`);
          else logger.info(`[${reqId}] Aborted upload removed: ${req.file.filename}`);
        });
      }
    });

    // Move file from temp → uploads
    await fs.promises.rename(tempPath, finalPath);

    const fileDoc = new File({
      user: userId,
      name: req.file.filename,              // stored name (renamed)
      actualName: req.file.originalname,    // original filename
      size: req.file.size,                  // file size in bytes
      mimeType: req.file.mimetype,          // MIME type (e.g., "image/png")
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
// --------------------
// DOWNLOAD CONTROLLER
// --------------------
exports.downloadFile = async (req, res) => {
  const reqId = req.id;
  logger.info(`[${reqId}] Starting file download`);

  try {
    const userId = req.user.id;
    const file = await File.findById(req.params.id);

    if (!file) {
      logger.info(`[${reqId}] File not found`);
      return res.status(404).json({ message: "File not found" });
    }

    if (file.user.toString() !== userId) {
      logger.info(`[${reqId}] Unauthorized download attempt`);
      return res.status(403).json({ message: "Unauthorized access" });
    }

    const filePath = path.join(UPLOAD_DIR, file.name);
    if (!fs.existsSync(filePath)) {
      logger.error(`[${reqId}] File missing from server`);
      return res.status(404).json({ message: "File missing from server" });
    }

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${file.actualName}"`
    );

    const readStream = fs.createReadStream(filePath);
    readStream.pipe(res);

    readStream.on("error", (err) => {
      logger.error(`[${reqId}] Download stream error: ${err.message}`);
      res.status(500).end("Error streaming file");
    });

    logger.info(`[${reqId}] File download started: ${file.actualName}`);
  } catch (err) {
    logger.error(`[${reqId}] Download error: ${err.message} ${err.stack}`);
    res.status(500).json({ message: "File download failed" });
  } finally {
    logger.info(`[${reqId}] Completed file download`);
  }
};

// --------------------
// LIST FILES
// --------------------
exports.listFiles = async (req, res) => {
  const reqId = req.id;
  logger.info(`[${reqId}] Starting file list retrieval`);

  try {
    const userId = req.user.id;
    const files = await File.find({ user: userId })
      .sort({ createdAt: -1 })
      .select("id actualName size mimeType createdAt");

    logger.info(`[${reqId}] Retrieved ${files.length} files for user ${userId}`);

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

// --------------------
// FILE INFO (with Redis cache)
// --------------------
exports.getFileInfo = async (req, res) => {
  const reqId = req.id;
  logger.info(`[${reqId}] Starting file info fetch`);

  try {
    const fileId = req.params.id;
    const cacheKey = `file:meta:${fileId}`;

    const cached = await redisClient.get(cacheKey);
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

    await redisClient.setEx(cacheKey, 600, JSON.stringify(info));
    logger.info(`[${reqId}] Cached file info for ${fileId}`);

    res.json(info);
  } catch (err) {
    logger.error(`[${reqId}] File info error: ${err.message} ${err.stack}`);
    res.status(500).json({ message: "Failed to fetch file info" });
  } finally {
    logger.info(`[${reqId}] Completed file info fetch`);
  }
};

// --------------------
// DELETE FILE
// --------------------
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
    await redisClient.del(`file:meta:${req.params.id}`);

    logger.info(`[${reqId}] File deleted successfully: ${file.actualName}`);

    res.json({ message: "File deleted successfully" });
  } catch (err) {
    logger.error(`[${reqId}] Delete file error: ${err.message} ${err.stack}`);
    res.status(500).json({ message: "File deletion failed" });
  } finally {
    logger.info(`[${reqId}] Completed file deletion`);
  }
};
