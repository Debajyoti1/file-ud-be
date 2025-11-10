const multer = require("multer");
const fs = require("fs");
const path = require("path");
const logger = require("../config/logger.config"); // adjust path if needed

const TEMP_DIR = path.join(__dirname, "../../tmp");
const UPLOAD_DIR = path.join(__dirname, "../../uploads");

// Auto-clear tmp folder on startup
if (fs.existsSync(TEMP_DIR)) {
  fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  logger.info(`[SYSTEM] Cleared temporary upload directory`);
}
fs.mkdirSync(TEMP_DIR, { recursive: true });
logger.info(`[SYSTEM] Temporary upload directory ready`);

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  logger.info(`[SYSTEM] Upload directory created`);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    logger.info(`[${req.id}] Upload destination set to temp folder`);
    cb(null, TEMP_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    logger.info(`[${req.id}] Incoming file: ${file.originalname} → ${uniqueName}`);
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 * 1024 }, // 50GB
});

module.exports = {
  upload,
  TEMP_DIR,
  UPLOAD_DIR,
};
