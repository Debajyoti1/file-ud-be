const express = require('express');
const router = express.Router();
const fileController = require('../controllers/file.controller');
const { verifyAccessToken } = require('../middleware/auth.middleware');
const { upload } = require('../middleware/upload.middleware');

// Authenticated routes
router.post('/', verifyAccessToken, upload.single('file'), fileController.uploadFile);
router.get('/', verifyAccessToken, fileController.listFiles);
router.get('/:id', verifyAccessToken, fileController.getFileInfo);
router.patch('/:id', verifyAccessToken, fileController.updatePublicStatus);
router.delete('/:id', verifyAccessToken, fileController.deleteFile);
router.get('/:id/download', verifyAccessToken, fileController.downloadFile);

// Public routes
router.get('/public/:id', fileController.getFileInfoNoAuth);
router.get('/public/:id/download', fileController.downloadFileNoAuth);

module.exports = router;
