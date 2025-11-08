const express = require('express');
const router = express.Router();
const fileController = require('../controllers/file.controller');
const { verifyAccessToken } = require('../middleware/auth.middleware');
const { upload } = require('../middleware/upload.middleware');

router.post('/upload', verifyAccessToken,upload.single('file'), fileController.uploadFile);
router.get('/download/:id', verifyAccessToken, fileController.downloadFile);
router.get('/', verifyAccessToken, fileController.listFiles);
router.delete('/:id', verifyAccessToken, fileController.deleteFile);

module.exports = router;
