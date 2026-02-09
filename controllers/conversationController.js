import { createConversationChain } from '../langchain/chains/conversation.js';
import { createPrescriptionChain } from '../langchain/chains/prescription.js';
import Logger from '../middleware/logger.js';
import mongoose from 'mongoose';
import Conversation from '../models/conversation.js';

// Helper function to get API key from request
const getApiKey = (req) => {
  // For anonymous users, expect API key in request body or headers
  if (!req.user) {
    return req.body.apiKey || req.headers['x-gemini-api-key'];
  }
  
  // For logged-in users, get decrypted API key from user document
  return req.user.decryptApiKey();
};

export const chat = async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    const user = req.user; // This will be null for anonymous users
    
    if (!message || !sessionId) {
      return res.status(400).json({ 
        error: 'Message and sessionId are required' 
      });
    }

    // Get API key
    const apiKey = getApiKey(req);
    
    if (!apiKey) {
      return res.status(400).json({
        error: 'Gemini API key required',
        message: user 
          ? 'Please set your Gemini API key in profile settings' 
          : 'Please provide your Gemini API key'
      });
    }
    
    Logger.info(`Processing chat request for session: ${sessionId}, user: ${user ? user._id : 'anonymous'}`);
    
    // Create conversation chain with user's API key
    const conversationChain = createConversationChain(apiKey);
    
    // Get response from the conversation chain
    const { message: responseMessage, metadata } = await conversationChain.getResponse(message, sessionId);
    
    // Update conversation with user info if logged in
    // Use $set to only update specific fields without affecting stage
    if (user) {
      const updateData = { 
        userId: user._id,
        isAnonymous: false
      };
      
      // For new conversations, set the title
      const existingConversation = await Conversation.findOne({ sessionId });
      if (!existingConversation || !existingConversation.title) {
        updateData.title = message.length > 50 ? message.substring(0, 47) + '...' : message;
      }
      
      await Conversation.findOneAndUpdate(
        { sessionId },
        { $set: updateData },
        { upsert: false } // Don't create new conversation, chain already handles this
      );
    }
    
    // Return the response with metadata
    res.json({
      message: responseMessage,
      metadata
    });
  } catch (error) {
    Logger.error('Error in chat endpoint:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Something went wrong processing your request'
    });
  }
};

// No streaming endpoint for now as requested

export const reset = async (req, res) => {
  try {
    const { sessionId } = req.body;
    const user = req.user;
    
    if (!sessionId) {
      return res.status(400).json({ 
        error: 'SessionId is required' 
      });
    }

    // Get API key
    const apiKey = getApiKey(req);
    
    if (!apiKey) {
      return res.status(400).json({
        error: 'Gemini API key required',
        message: user 
          ? 'Please set your Gemini API key in profile settings' 
          : 'Please provide your Gemini API key'
      });
    }
    
    Logger.info(`Resetting conversation for session: ${sessionId}`);
    
    // Create conversation chain with user's API key
    const conversationChain = createConversationChain(apiKey);
    
    // Reset the conversation in the database
    const result = await conversationChain.resetConversation(sessionId);
    
    res.json({ 
      success: true, 
      message: 'Conversation reset successfully'
    });
  } catch (error) {
    Logger.error('Error in reset endpoint:', error);
    res.status(500).json({ 
      error: 'Internal server error' 
    });
  }
};

export const status = async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Get conversation from MongoDB
    const conversation = await mongoose.model("Conversation").findOne({ sessionId });
    
    if (conversation) {
      // Return conversation details
      res.json({ 
        exists: true, 
        stage: conversation.stage,
        messagesCount: conversation.messages.length,
        detectedSymptoms: conversation.detectedSymptoms,
        lastUpdated: conversation.updatedAt
      });
    } else {
      res.json({ 
        exists: false, 
        message: 'No conversation found for this session' 
      });
    }
  } catch (error) {
    Logger.error('Error in status endpoint:', error);
    res.status(500).json({ 
      error: 'Internal server error' 
    });
  }
};

// Get user's chat history (only for authenticated users)
export const getUserChats = async (req, res) => {
  try {
    const user = req.user;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const conversations = await Conversation.find({ 
      userId: user._id,
      isAnonymous: false 
    })
    .sort({ updatedAt: -1 })
    .skip(skip)
    .limit(limit)
    .select('sessionId title stage detectedSymptoms createdAt updatedAt messages');

    // Count total conversations for pagination
    const total = await Conversation.countDocuments({ 
      userId: user._id,
      isAnonymous: false 
    });

    // Format conversations for frontend
    const formattedChats = conversations.map(conv => ({
      sessionId: conv.sessionId,
      title: conv.title,
      stage: conv.stage,
      detectedSymptoms: conv.detectedSymptoms,
      messageCount: conv.messages.length,
      lastMessage: conv.messages.length > 0 ? conv.messages[conv.messages.length - 1].content : '',
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt
    }));

    res.json({
      success: true,
      data: {
        chats: formattedChats,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    Logger.error('Error getting user chats:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

// Get specific conversation details
export const getConversation = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const user = req.user;

    // Find conversation
    const conversation = await Conversation.findOne({ sessionId });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    // Check if user has access to this conversation
    if (conversation.userId && user && conversation.userId.toString() !== user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this conversation'
      });
    }

    // If conversation belongs to a user but request is anonymous, deny access
    if (conversation.userId && !user) {
      return res.status(403).json({
        success: false,
        message: 'Authentication required to access this conversation'
      });
    }

    res.json({
      success: true,
      data: {
        conversation: {
          sessionId: conversation.sessionId,
          title: conversation.title,
          stage: conversation.stage,
          detectedSymptoms: conversation.detectedSymptoms,
          messages: conversation.messages,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt,
          isAnonymous: conversation.isAnonymous
        }
      }
    });
  } catch (error) {
    Logger.error('Error getting conversation:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

// Delete a conversation (only for authenticated users)
export const deleteConversation = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const user = req.user;

    const conversation = await Conversation.findOne({ sessionId });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    // Check if user owns this conversation
    if (!conversation.userId || conversation.userId.toString() !== user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    await Conversation.findOneAndDelete({ sessionId });

    res.json({
      success: true,
      message: 'Conversation deleted successfully'
    });
  } catch (error) {
    Logger.error('Error deleting conversation:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

// Update conversation title
export const updateConversationTitle = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { title } = req.body;
    const user = req.user;

    if (!title || title.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Title is required'
      });
    }

    const conversation = await Conversation.findOne({ sessionId });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    // Check if user owns this conversation
    if (!conversation.userId || conversation.userId.toString() !== user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    conversation.title = title.trim();
    await conversation.save();

    res.json({
      success: true,
      message: 'Conversation title updated successfully',
      data: {
        title: conversation.title
      }
    });
  } catch (error) {
    Logger.error('Error updating conversation title:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

export const generatePrescription = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const user = req.user;
    
    if (!sessionId) {
      return res.status(400).json({ 
        error: 'SessionId is required' 
      });
    }

    // Get API key
    const apiKey = getApiKey(req);
    
    if (!apiKey) {
      return res.status(400).json({
        error: 'Gemini API key required',
        message: user 
          ? 'Please set your Gemini API key in profile settings' 
          : 'Please provide your Gemini API key'
      });
    }
    
    Logger.info(`Generating prescription for session: ${sessionId}, user: ${user ? user._id : 'anonymous'}`);
    
    // Check if conversation exists
    const conversation = await Conversation.findOne({ sessionId });
    if (!conversation) {
      return res.status(404).json({
        error: 'Conversation not found',
        message: 'Please ensure you have a valid conversation session'
      });
    }
    
    // Check if user owns this conversation (if user is logged in)
    if (user && conversation.userId && conversation.userId.toString() !== user._id.toString()) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only generate prescriptions for your own conversations'
      });
    }
    
    // Check if conversation has enough content for prescription
    if (!conversation.messages || conversation.messages.length < 4) {
      return res.status(400).json({
        error: 'Insufficient conversation data',
        message: 'Please have a more detailed conversation before generating a prescription'
      });
    }
    
    // Check if prescription already exists
    if (conversation.prescription && conversation.prescription.data && conversation.prescription.disclaimer) {
      Logger.info(`Returning existing prescription for session: ${sessionId}`);
      return res.json({
        success: true,
        sessionId,
        generatedAt: conversation.prescription.generatedAt?.toISOString(),
        disclaimer: conversation.prescription.disclaimer,
        prescription: conversation.prescription.data,
        cached: true
      });
    }
    
    // Create prescription chain with user's API key
    const prescriptionChain = createPrescriptionChain(apiKey);
    
    // Generate the prescription using the AI chain
    const prescription = await prescriptionChain.generatePrescription(sessionId);
    
    // Add disclaimer and metadata
    const disclaimerText = "This AI-generated prescription is for informational purposes only. Always consult with a qualified healthcare provider before taking any medicines. For prescription medicines, a doctor's consultation is mandatory.";
    
    const response = {
      success: true,
      sessionId,
      generatedAt: new Date().toISOString(),
      disclaimer: disclaimerText,
      prescription: prescription
    };

    // Store the prescription in the conversation using the new schema structure
    conversation.prescription = {
      generatedAt: new Date(),
      disclaimer: disclaimerText,
      data: prescription
    };
    await conversation.save();
    
    Logger.info(`Prescription generated successfully for session: ${sessionId}`);
    
    res.json(response);
  } catch (error) {
    Logger.error('Error generating prescription:', error);
    
    if (error.message === "Conversation not found") {
      return res.status(404).json({
        error: 'Conversation not found',
        message: 'The specified conversation could not be found'
      });
    }
    
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to generate prescription. Please try again later.'
    });
  }
};

export const getPrescription = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const user = req.user;
    
    if (!sessionId) {
      return res.status(400).json({ 
        error: 'SessionId is required' 
      });
    }
    
    // Check if conversation exists
    const conversation = await Conversation.findOne({ sessionId });
    if (!conversation) {
      return res.status(404).json({
        error: 'Conversation not found',
        message: 'Please ensure you have a valid conversation session'
      });
    }
    
    // Check if user owns this conversation (if user is logged in)
    if (user && conversation.userId && conversation.userId.toString() !== user._id.toString()) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only access prescriptions for your own conversations'
      });
    }
    
    // Check if prescription exists
    if (!conversation.prescription || !conversation.prescription.data) {
      return res.status(404).json({
        error: 'Prescription not found',
        message: 'No prescription has been generated for this conversation yet'
      });
    }
    
    const response = {
      success: true,
      sessionId,
      generatedAt: conversation.prescription.generatedAt.toISOString(),
      disclaimer: conversation.prescription.disclaimer,
      prescription: conversation.prescription.data
    };
    
    res.json(response);
  } catch (error) {
    Logger.error('Error retrieving prescription:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve prescription. Please try again later.'
    });
  }
};
