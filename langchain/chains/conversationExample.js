// Example usage of the ConversationChain
import ConversationChain, { createConversationChain } from './conversation.js';

// Example 1: Using the streaming response
async function exampleStreamingConversation() {
  const chain = createConversationChain();
  
  console.log("=== AI Doctor Streaming Conversation ===");
  
  // Simulate a conversation
  const userInputs = [
    "Hello, I've been having some chest pain",
    "It started yesterday morning and feels like a sharp pain",
    "It's about a 7 out of 10 in intensity",
    "No, I don't have any heart conditions in my family"
  ];
  
  for (const input of userInputs) {
    console.log(`\nPatient: ${input}`);
    console.log("Dr. AI: ");
    
    // Stream the response
    for await (const chunk of chain.streamResponse(input)) {
      process.stdout.write(chunk);
    }
    console.log("\n");
    
    // Show current stage
    console.log(`[Current Stage: ${chain.getCurrentStage()}]`);
  }
}

// Example 2: Using regular response (non-streaming)
async function exampleRegularConversation() {
  const chain = createConversationChain();
  
  console.log("=== AI Doctor Regular Conversation ===");
  
  const response1 = await chain.getResponse("Hi, I have a headache that won't go away");
  console.log("Dr. AI:", response1);
  
  const response2 = await chain.getResponse("It's been going on for 3 days now");
  console.log("Dr. AI:", response2);
  
  // Get conversation summary
  console.log("Conversation Summary:", chain.getConversationSummary());
}

// Example 3: Emergency detection
async function exampleEmergencyDetection() {
  const chain = createConversationChain();
  
  console.log("=== Emergency Detection Example ===");
  
  const emergencyInput = "I'm having severe chest pain and difficulty breathing";
  const response = await chain.getResponse(emergencyInput);
  console.log("Emergency Response:", response);
}

// Export examples for testing
export {
  exampleStreamingConversation,
  exampleRegularConversation,
  exampleEmergencyDetection
};

// Usage examples (uncomment to test):
// exampleStreamingConversation();
// exampleRegularConversation();
// exampleEmergencyDetection();
