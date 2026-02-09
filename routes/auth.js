import express from 'express';
import { register, login, getProfile, updateProfile, setApiKey, hasApiKey, getApiKey } from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Public routes
router.post('/register', register);
router.post('/login', login);

// Protected routes
router.get('/profile', authenticate, getProfile);
router.put('/profile', authenticate, updateProfile);

// API Key management routes
router.post('/api-key', authenticate, setApiKey);
router.get('/api-key/check', authenticate, hasApiKey);
router.get('/api-key', authenticate, getApiKey);

export default router;
