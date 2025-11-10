const fs = require("fs");
const logger = require("../config/logger.config");

const streamFile = (filePath, fileName, res, reqId) => {
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${fileName.replace(/"/g, "'")}"`
  );

  const readStream = fs.createReadStream(filePath);
  readStream.pipe(res);

  readStream.on("open", () =>
    logger.info(`[${reqId}] File streaming started: ${fileName}`)
  );

  readStream.on("error", (err) => {
    logger.error(`[${reqId}] File stream error: ${err.message}`);
    if (!res.headersSent) res.status(500).end("Error streaming file");
  });

  readStream.on("end", () =>
    logger.info(`[${reqId}] File streaming completed: ${fileName}`)
  );
};
module.exports = { streamFile };
