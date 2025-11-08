const express = require('express');
const router = express.Router();

// Health & status endpoints
router.get('/', (req, res) => {
  res.status(200).json({ message: 'File Upload Download API is running...', ip: req.ip });
});

router.get('/health', async (req, res) => {
  try {
    const mongoStatus =
      req.app.locals.mongoConnection?.readyState === 1 ? 'connected' : 'disconnected';
    const redisStatus = req.app.locals.redis?.isOpen ? 'connected' : 'disconnected';

    res.status(200).json({
      status: 'ok',
      services: {
        mongodb: mongoStatus,
        redis: redisStatus,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch health status',
      error: err.message,
    });
  }
});

module.exports = router; 