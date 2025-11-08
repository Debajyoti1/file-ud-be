const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { verifyAccessToken } = require('../middleware/auth.middleware');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/refresh', authController.refresh);
router.get('/me', verifyAccessToken, authController.getMyInfo);
router.post('/logout', authController.logout);

module.exports = router;
