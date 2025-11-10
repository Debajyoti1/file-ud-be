const express = require('express');
const router = express.Router();
const fileController = require('../controllers/file.controller');
const { verifyAccessToken } = require('../middleware/auth.middleware');
const { upload } = require('../middleware/upload.middleware');
const {rateLimit} = require('../middleware/ratelimit.middleware');


router.post('/',rateLimit({ prefix: 'upload', limit: 10, window: 300 }), verifyAccessToken, upload.single('file'), fileController.uploadFile);
router.get('/',rateLimit({ prefix: 'list', limit: 100, window: 300 }) ,verifyAccessToken, fileController.listFiles);
router.get('/:id',rateLimit({ prefix: 'info', limit: 50, window: 300 }), fileController.getFileInfo);
router.patch('/:id',rateLimit({ prefix: 'update', limit: 100, window: 300 }), verifyAccessToken, fileController.updatePublicStatus);
router.delete('/:id',rateLimit({ prefix: 'delete', limit: 100, window: 300 }), verifyAccessToken, fileController.deleteFile);
router.get('/:id/download',rateLimit({ prefix: 'download', limit: 50, window: 300 }), fileController.downloadFile);

module.exports = router;
