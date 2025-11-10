const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { verifyAccessToken } = require('../middleware/auth.middleware');
const {rateLimit} = require('../middleware/ratelimit.middleware');

router.post('/register', rateLimit({ prefix: 'register', limit: 10, window: 300 }), authController.register);
router.post('/login', rateLimit({ prefix: 'login', limit: 30, window: 300 }), authController.login);
router.post('/refresh',rateLimit({ prefix: 'refresh', limit: 5, window: 300 }), authController.refresh);
router.get('/me',rateLimit({ prefix: 'me', limit: 30, window: 300 }), verifyAccessToken, authController.getMyInfo);
router.post('/logout', authController.logout);

module.exports = router;
