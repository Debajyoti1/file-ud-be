const express = require('express');
const router = express.Router();

const homeRoutes = require('./home.routes');
const authRoutes = require('./auth.routes');
const fileRoutes = require('./file.routes');

// Mount all routes
router.use('/', homeRoutes);
router.use('/auth', authRoutes);
router.use('/files', fileRoutes);

// 404 handler (for unknown routes)
router.all('/{*splat}', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
});

module.exports = router;
