// API Route handler for AI Doctor conversations
import express from 'express';
import {
  chat,
  reset,
  status,
  getUserChats,
  getConversation,
  deleteConversation,
  updateConversationTitle,
  generatePrescription,
  getPrescription
} from '../controllers/conversationController.js';
import { authenticate, optionalAuthenticate } from '../middleware/auth.js';

const router = express.Router();

// Main chat endpoint - supports both anonymous and authenticated users
router.post('/chat', optionalAuthenticate, chat);

// Reset conversation - supports both anonymous and authenticated users
router.post('/reset', optionalAuthenticate, reset);

// Get conversation status - supports both anonymous and authenticated users
router.get('/status/:sessionId', optionalAuthenticate, status);

// Get specific conversation details - supports both anonymous and authenticated users
router.get('/:sessionId', optionalAuthenticate, getConversation);

// Protected routes (require authentication)
router.get('/user/chats', authenticate, getUserChats);
router.delete('/:sessionId', authenticate, deleteConversation);
router.put('/:sessionId/title', authenticate, updateConversationTitle);

// Prescription generation - supports both anonymous and authenticated users
router.post('/:sessionId/prescription', optionalAuthenticate, generatePrescription);

// Get existing prescription - supports both anonymous and authenticated users  
router.get('/:sessionId/prescription', optionalAuthenticate, getPrescription);

export default router;
