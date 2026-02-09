import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { JsonOutputParser } from "@langchain/core/output_parsers";
import Logger from "../../middleware/logger.js";
import ConversationModel from "../../models/conversation.js";

const PRESCRIPTION_SYSTEM_PROMPT = `
You are Dr. AI, a medical assistant based in India, tasked with generating a comprehensive prescription based on a complete consultation conversation.

Your task is to analyze the entire conversation history and metadata to create a detailed prescription in JSON format.

IMPORTANT GUIDELINES FOR INDIA:
- Suggest only medicines that are commonly available in India
- Include both generic names and popular Indian brand names (e.g., "Paracetamol (Crocin, Calpol)")
- Common Indian OTC medicines: Paracetamol (Crocin, Dolo), Ibuprofen (Brufen, Combiflam), Cetirizine (Zyrtec, Cetcip), ORS (Electral, Jeevan Jal)
- Consider Indian medical practices and dosages commonly prescribed in India
- Include medicines available over-the-counter (OTC) and those requiring prescription
- For prescription medicines, clearly mention "Prescription Required - Consult Doctor"
- Use dosages and frequencies commonly prescribed in Indian medical practice
- Consider cost-effectiveness for Indian patients

You MUST format your response as a valid JSON object with this exact structure:
{
  "description_of_issue": "A clear, concise summary of the patient's condition based on the conversation (2-3 sentences)",
  "ai_analysis": "Your detailed medical analysis considering symptoms, history, and context (4-5 sentences explaining the likely condition and reasoning)",
  "medicines": [
    {
      "name": "Generic Name (Popular Indian Brand Names)",
      "dosage": "Specific dosage with frequency (e.g., 500mg twice daily)",
      "duration": "How long to take (e.g., 5-7 days)",
      "purpose": "What this medicine is for (e.g., Pain relief and fever reduction)",
      "prescription_required": true/false,
      "indian_availability": "Easily available/Common/Prescription needed",
      "notes": "Any special instructions, timing, or warnings"
    }
  ],
  "general_tips": [
    "Specific lifestyle recommendations",
    "Dietary suggestions with Indian context",
    "Activity modifications",
    "Home remedies common in India",
    "When to seek immediate medical attention"
  ],
  "diagnostic_tests": [
    "List of recommended tests if any (use Indian medical system context)"
  ],
  "emergency_signs": [
    "Specific warning signs that require immediate medical attention"
  ],
  "follow_up": "When to follow up and with whom (consider Indian healthcare system)"
}

IMPORTANT DISCLAIMERS TO INCLUDE:
- This is an AI-generated prescription for informational purposes
- Always consult with a qualified healthcare provider before taking any medicines
- For prescription medicines, a doctor's consultation is mandatory
- In case of emergency symptoms, contact emergency services immediately

Remember:
- Be thorough but practical
- Consider Indian medical context
- Prioritize patient safety
- Include appropriate disclaimers
- Suggest readily available Indian medicines
- Consider cost-effectiveness for Indian patients
`;

class PrescriptionChain {
  constructor(apiKey = null) {
    Logger.info("Initializing PrescriptionChain with Gemini...");

    if (!apiKey) {
      throw new Error("Gemini API key is required");
    }

    this.model = new ChatGoogleGenerativeAI({
      model: "gemini-2.0-flash-exp",
      apiKey: apiKey,
      temperature: 0.5
    });

    this.outputParser = new JsonOutputParser();
  }

  /**
   * Format conversation history for analysis
   */
  formatConversationHistory(messages) {
    return messages
      .filter(msg => msg.role !== "system")
      .map(msg => `${msg.role === "user" ? "Patient" : "Dr. AI"}: ${msg.content}`)
      .join("\n");
  }

  /**
   * Format metadata for analysis
   */
  formatMetadata(conversation) {
    return `
Current Stage: ${conversation.stage || 'Unknown'}
Detected Symptoms: ${conversation.detectedSymptoms?.join(', ') || 'None recorded'}
Conversation Created: ${conversation.createdAt}
Last Updated: ${conversation.updatedAt}
Total Messages: ${conversation.messages?.length || 0}
`;
  }

  /**
   * Generate prescription based on conversation
   */
  async generatePrescription(sessionId) {
    try {
      Logger.info(`Generating prescription for session: ${sessionId}`);
      
      // Get the complete conversation from database
      const conversation = await ConversationModel.findOne({ sessionId });
      
      if (!conversation) {
        throw new Error("Conversation not found");
      }

      // Format the conversation history and metadata
      const conversationHistory = this.formatConversationHistory(conversation.messages);
      const metadata = this.formatMetadata(conversation);
      
      // Create the complete prompt
      const fullPrompt = `
${PRESCRIPTION_SYSTEM_PROMPT}

CONVERSATION HISTORY:
${conversationHistory}

METADATA:
${metadata}

Based on the above conversation and metadata, generate a comprehensive prescription in the specified JSON format. Ensure all medicines suggested are available in India and include appropriate disclaimers.
`;

      // Get response from the model
      const messages = [
        { role: "system", content: fullPrompt },
        { role: "user", content: "Please generate a comprehensive prescription based on the conversation above." }
      ];
      
      const modelResponse = await this.model.invoke(messages);
      const responseText = modelResponse.content;
      
      // Parse the response as JSON
      let prescription;
      try {
        prescription = await this.outputParser.invoke(responseText);
      } catch (error) {
        Logger.warn("Failed to parse prescription response as JSON:", error.message);
        Logger.warn("Raw response:", responseText);
        
        // Try to extract JSON from the response text manually
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            prescription = JSON.parse(jsonMatch[0]);
          } catch (parseError) {
            Logger.error("Failed to parse extracted JSON:", parseError);
            throw new Error("Failed to generate valid prescription format");
          }
        } else {
          throw new Error("No valid JSON found in prescription response");
        }
      }

      // Validate the prescription structure
      const requiredFields = ['description_of_issue', 'ai_analysis', 'medicines', 'general_tips'];
      for (const field of requiredFields) {
        if (!prescription[field]) {
          Logger.warn(`Missing required field in prescription: ${field}`);
        }
      }

      Logger.info("Prescription generated successfully");
      return prescription;
      
    } catch (error) {
      Logger.error("Error generating prescription:", error);
      throw error;
    }
  }
}

export default PrescriptionChain;

export const createPrescriptionChain = (apiKey) => {
  return new PrescriptionChain(apiKey);
};
