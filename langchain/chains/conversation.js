import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { JsonOutputParser } from "@langchain/core/output_parsers";
import { DOCTOR_STAGES, EMERGENCY_KEYWORDS, EMERGENCY_RESPONSE } from "../prompts/conversation.js";
import Logger from "../../middleware/logger.js";
import ConversationModel from "../../models/conversation.js";

// Define all stages in order
const STAGE_ORDER = [
  DOCTOR_STAGES.GREETING,
  DOCTOR_STAGES.SYMPTOM_COLLECTION,
  DOCTOR_STAGES.DETAILED_ASSESSMENT,
  DOCTOR_STAGES.MEDICAL_HISTORY,
  DOCTOR_STAGES.RECOMMENDATIONS,
  DOCTOR_STAGES.FOLLOW_UP,
];

// Create the master system prompt with all stage descriptions
const MASTER_SYSTEM_PROMPT = `
You are Dr. AI, a virtual doctor assistant designed to help patients assess their symptoms and provide medical guidance.

IMPORTANT: You MUST format your response as a valid JSON object with the following structure:
{
  "message": "Your response message to the user",
  "current_stage": "current_stage_name",
  "next_stage": boolean (true if ready to move to next stage, false otherwise),
  "detected_symptoms": ["symptom1", "symptom2", ...],
  "confidence_level": number between 0-1,
  "suggested_followup": "A follow-up question or recommendation"
}

Here are the stages of our consultation process:

1. GREETING: Introduce yourself and ask about the patient's main concern.
2. SYMPTOM_COLLECTION: Gather initial symptoms and basic information.
3. DETAILED_ASSESSMENT: Ask targeted questions to better understand symptoms.
4. MEDICAL_HISTORY: Inquire about relevant medical history, allergies, medications.
6. RECOMMENDATIONS: Suggest home care, medications, or professional consultation.
7. FOLLOW_UP: Discuss follow-up care and answer remaining questions.

Current stage: {stage}
Previous messages: {history}

Remember to:
1. Be empathetic and professional
2. Only move to the next stage when you have sufficient information
3. If you detect any emergency symptoms, immediately advise seeking urgent medical care
4. Maintain appropriate medical tone throughout the conversation
5. Set next_stage to true only when ready to advance to the next stage
6. Include current_stage in your response to indicate which stage you're currently in
7. ALWAYS respond in the required JSON format
`;

class ConversationChain {
  constructor(apiKey = null) {
    Logger.info("Initializing ConversationChain with Gemini...");

    if (!apiKey) {
      throw new Error("Gemini API key is required");
    }

    this.model = new ChatGoogleGenerativeAI({
      model: "gemini-2.0-flash-exp",
      apiKey: apiKey,
      temperature: 0.7
    });

    this.outputParser = new JsonOutputParser();
  }

  /**
   * Detect emergency keywords in the user's input
   */
  detectEmergency(input) {
    const lower = input.toLowerCase();
    return EMERGENCY_KEYWORDS.some((word) => lower.includes(word));
  }

  /**
   * Handle emergency situations
   */
  handleEmergency(input) {
    if (this.detectEmergency(input)) {
      return {
        message: EMERGENCY_RESPONSE,
        metadata: {
          stage: "emergency",
          current_stage: "emergency",
          next_stage: false,
          detected_symptoms: ["emergency"],
          confidence_level: 1.0,
          suggested_followup: "Please seek immediate medical attention."
        }
      };
    }
    return null;
  }

  /**
   * Get or create a conversation document in MongoDB
   */
  async getConversation(sessionId) {
    // Find existing conversation or create new one
    let conversation = await ConversationModel.findOne({ sessionId });
    
    if (!conversation) {
      conversation = new ConversationModel({
        sessionId,
        stage: STAGE_ORDER[0],
        messages: [
          {
            role: "system",
            content: MASTER_SYSTEM_PROMPT.replace("{stage}", STAGE_ORDER[0]).replace("{history}", ""),
            timestamp: new Date()
          }
        ],
        detectedSymptoms: []
      });
      await conversation.save();
    }
    
    return conversation;
  }

  /**
   * Format conversation history for the AI prompt
   */
  formatHistory(messages) {
    return messages
      .filter(msg => msg.role !== "system")
      .map(msg => `${msg.role === "user" ? "User" : "Doctor"}: ${msg.content}`)
      .join("\n");
  }

  /**
   * Process the AI response
   */
  async processResponse(response, conversation) {
    try {
      // The response should already be parsed as a JavaScript object
      const parsedResponse = response;

      // Update detected symptoms
      if (parsedResponse.detected_symptoms && Array.isArray(parsedResponse.detected_symptoms)) {
        // Add new symptoms without duplicates
        const newSymptoms = parsedResponse.detected_symptoms.filter(
          symptom => !conversation.detectedSymptoms.includes(symptom)
        );
        
        conversation.detectedSymptoms.push(...newSymptoms);
      }

      Logger.info("Current Stage:", parsedResponse.current_stage);
      // Update the current stage from AI response if provided
      if (parsedResponse.current_stage && STAGE_ORDER.includes(parsedResponse.current_stage.toLowerCase())) {
        conversation.stage = parsedResponse.current_stage;
        Logger.info(`Current stage from AI: ${conversation.stage}`);
      }

      // Save the changes
      conversation.updatedAt = new Date();
      await conversation.save();
      
      // Return processed response with metadata
      return {
        message: parsedResponse.message || "I'm processing your information.",
        metadata: {
          stage: conversation.stage,
          current_stage: parsedResponse.current_stage || conversation.stage,
          next_stage: parsedResponse.next_stage || false,
          detected_symptoms: conversation.detectedSymptoms,
          confidence_level: parsedResponse.confidence_level || 0.5,
          suggested_followup: parsedResponse.suggested_followup || ""
        }
      };
    } catch (error) {
      Logger.error("Error processing response:", error);
      return {
        message: "I apologize, but I'm having trouble processing your information. Could you please rephrase?",
        metadata: {
          stage: conversation.stage,
          current_stage: conversation.stage,
          next_stage: false,
          detected_symptoms: conversation.detectedSymptoms,
          confidence_level: 0,
          suggested_followup: "Could you please provide more details about your symptoms?"
        }
      };
    }
  }

  /**
   * Get response to user input
   */
  async getResponse(input, sessionId) {
    try {
      // Check for emergency
      const emergency = this.handleEmergency(input);
      if (emergency) return emergency;
      
      // Get conversation from database
      const conversation = await this.getConversation(sessionId);
      
      // Format conversation history
      const history = this.formatHistory(conversation.messages);
      
      // Create the full system message by directly substituting the variables
      const fullSystemMessage = MASTER_SYSTEM_PROMPT
        .replace("{stage}", conversation.stage)
        .replace("{history}", history);
      
      // Use a simple approach without template variables
      const messages = [
        { role: "system", content: fullSystemMessage },
        { role: "user", content: input }
      ];
      
      // Get response directly from the model
      const modelResponse = await this.model.invoke(messages);
      
      // Get the response text from the model
      const responseText = modelResponse.content;
      
      // Try to parse as JSON, or create a basic response object if parsing fails
      let response;
      try {
        response = await this.outputParser.invoke(responseText);
      } catch (error) {
        Logger.warn("Failed to parse AI response as JSON:", error.message);
        Logger.warn("Raw response:", responseText);
        
        // Try to extract JSON from the response text manually
        let extractedMessage = responseText;
        
        // Look for JSON object in the response
        const jsonMatch = responseText.match(/\{[\s\S]*?\}/);
        if (jsonMatch) {
          try {
            const parsedJson = JSON.parse(jsonMatch[0]);
            if (parsedJson.message) {
              extractedMessage = parsedJson.message;
            }
          } catch (parseError) {
            Logger.warn("Failed to parse extracted JSON:", parseError);
          }
        }
        
        // If still no valid message, try regex patterns
        if (extractedMessage === responseText) {
          const messagePatterns = [
            /["']message["']\s*:\s*["'](.*?)["']/,
            /message:\s*["'](.*?)["']/,
            /message["']\s*:\s*["'](.*?)["']/
          ];
          
          for (const pattern of messagePatterns) {
            const match = responseText.match(pattern);
            if (match && match[1]) {
              extractedMessage = match[1];
              break;
            }
          }
        }
        
        // If we still have JSON-like text, treat the whole response as the message
        if (extractedMessage === responseText && responseText.includes('{')) {
          extractedMessage = "I'm processing your information. Could you please provide more details about your symptoms?";
        }
        
        response = {
          message: extractedMessage,
          current_stage: conversation.stage,
          next_stage: false,
          detected_symptoms: [],
          confidence_level: 0.5,
          suggested_followup: "Could you please tell me more about your symptoms?"
        };
      }

      // Save messages to conversation history - use the parsed message content, not the raw response
      conversation.messages.push(
        { role: "user", content: input, timestamp: new Date() },
        { role: "assistant", content: response.message, timestamp: new Date() }
      );
      
      // Process and return response
      return this.processResponse(response, conversation);
    } catch (error) {
      Logger.error("Error in conversation chain:", error);
      // Try to get current stage if conversation exists
      const stage = conversation ? conversation.stage : "error";
      
      return {
        message: "I apologize, but I'm experiencing technical difficulties. Please try again in a moment.",
        metadata: {
          stage: stage,
          current_stage: stage,
          next_stage: false,
          detected_symptoms: conversation ? conversation.detectedSymptoms : [],
          confidence_level: 0,
          suggested_followup: "Could you please try again with a simpler description?"
        }
      };
    }
  }

  /**
   * Reset conversation
   */
  async resetConversation(sessionId) {
    await ConversationModel.deleteOne({ sessionId });
    Logger.info(`Conversation reset for session: ${sessionId}`);
    return { success: true, message: "Conversation has been reset." };
  }
}

export default ConversationChain;

export const createConversationChain = (apiKey) => {
  return new ConversationChain(apiKey);
};
