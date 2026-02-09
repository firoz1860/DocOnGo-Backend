import mongoose from "mongoose";

// Define MongoDB schema for conversations
const ConversationSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, index: true },
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    default: null // Allow null for anonymous users
  },
  isAnonymous: { type: Boolean, default: true },
  messages: [
    {
      role: { type: String, enum: ["user", "assistant", "system"] },
      content: { type: String },
      timestamp: { type: Date, default: Date.now }
    }
  ],
  stage: { type: String, default: "greeting" },
  detectedSymptoms: [String],
  title: { type: String, default: "New Conversation" }, // For displaying in chat history
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  prescription: {
    generatedAt: { type: Date },
    disclaimer: { type: String },
    data: {
      description_of_issue: { type: String },
      ai_analysis: { type: String },
      medicines: [{
        name: { type: String },
        dosage: { type: String },
        duration: { type: String },
        purpose: { type: String },
        prescription_required: { type: Boolean },
        indian_availability: { type: String },
        notes: { type: String }
      }],
      general_tips: [{ type: String }],
      diagnostic_tests: [{ type: String }],
      emergency_signs: [{ type: String }],
      follow_up: { type: String }
    }
  }
});

// Create MongoDB model
const Conversation = mongoose.model("Conversation", ConversationSchema);
// Export the model
export default Conversation;