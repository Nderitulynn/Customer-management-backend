const { ObjectId } = require('mongodb');
const connectDB = require('../config/database');

class AssignmentService {
  
  /**
   * Get all available assistants (users with assistant role)
   * @returns {Array} Array of assistant users
   */
  async getAvailableAssistants() {
    try {
      const db = await connectDB();
      const assistants = await db.collection('users')
        .find({ 
          role: 'assistant',  // Changed from 'ASSISTANT' to 'assistant' to match database
          isActive: { $ne: false } // Exclude deactivated users
        })
        .toArray();
      
      console.log(`📋 Found ${assistants.length} available assistants`);
      return assistants;
    } catch (error) {
      console.error('❌ Error getting available assistants:', error);
      throw new Error('Failed to fetch available assistants');
    }
  }

  /**
   * Get the last assigned assistant from system settings
   * @returns {ObjectId|null} Assistant ID or null if none assigned yet
   */
  async getLastAssignedAssistant() {
    try {
      const db = await connectDB();
      const setting = await db.collection('system_settings')
        .findOne({ key: 'lastAssignedAssistant' });
      
      if (setting && setting.value) {
        console.log(`📖 Last assigned assistant: ${setting.value}`);
        return new ObjectId(setting.value);
      }
      
      console.log('📖 No previous assignment found');
      return null;
    } catch (error) {
      console.error('❌ Error getting last assigned assistant:', error);
      throw new Error('Failed to get last assigned assistant');
    }
  }

  /**
   * Determine the next assistant to receive an order (alternating logic)
   * @returns {ObjectId} Next assistant's user ID
   */
  async getNextAssistant() {
    try {
      console.log('🔄 Determining next assistant...');
      
      // Get all available assistants
      const assistants = await this.getAvailableAssistants();
      
      // Check if we have assistants
      if (!assistants || assistants.length === 0) {
        throw new Error('No available assistants found');
      }
      
      // If only one assistant, always assign to them
      if (assistants.length === 1) {
        console.log('👤 Only one assistant available, assigning to them');
        return assistants[0]._id;
      }
      
      // Get last assigned assistant
      const lastAssignedId = await this.getLastAssignedAssistant();
      
      // If no previous assignment, assign to first assistant
      if (!lastAssignedId) {
        console.log('🎯 First assignment, selecting first assistant');
        return assistants[0]._id;
      }
      
      // Find the index of the last assigned assistant
      const lastAssignedIndex = assistants.findIndex(
        assistant => assistant._id.toString() === lastAssignedId.toString()
      );
      
      // If last assigned assistant not found in current assistants, assign to first
      if (lastAssignedIndex === -1) {
        console.log('⚠️  Last assigned assistant not found, selecting first assistant');
        return assistants[0]._id;
      }
      
      // Alternate: select the next assistant (or wrap to first if at end)
      const nextIndex = (lastAssignedIndex + 1) % assistants.length;
      const nextAssistant = assistants[nextIndex];
      
      console.log(`🔄 Alternating from assistant ${lastAssignedIndex} to assistant ${nextIndex}`);
      return nextAssistant._id;
      
    } catch (error) {
      console.error('❌ Error determining next assistant:', error);
      throw new Error('Failed to determine next assistant');
    }
  }

  /**
   * Update the last assigned assistant in system settings
   * @param {ObjectId} assistantId - ID of the assistant who received the order
   */
  async updateLastAssignedAssistant(assistantId) {
    try {
      const db = await connectDB();
      
      const result = await db.collection('system_settings').updateOne(
        { key: 'lastAssignedAssistant' },
        { 
          $set: { 
            value: new ObjectId(assistantId),
            updatedAt: new Date()
          }
        },
        { upsert: true } // Create if doesn't exist
      );
      
      if (result.acknowledged) {
        console.log(`✅ Updated last assigned assistant to: ${assistantId}`);
      } else {
        throw new Error('Failed to update assignment record');
      }
      
    } catch (error) {
      console.error('❌ Error updating last assigned assistant:', error);
      throw new Error('Failed to update last assigned assistant');
    }
  }

  /**
   * Main method to assign an order to the next available assistant
   * This combines getting next assistant and updating the record
   * @returns {ObjectId} Assistant ID who should receive the order
   */
  async assignOrderToAssistant() {
    try {
      console.log('🎯 Starting order assignment process...');
      
      // Get the next assistant
      const nextAssistantId = await this.getNextAssistant();
      
      // Update the last assigned record
      await this.updateLastAssignedAssistant(nextAssistantId);
      
      console.log(`✅ Order assigned to assistant: ${nextAssistantId}`);
      return nextAssistantId;
      
    } catch (error) {
      console.error('❌ Order assignment failed:', error);
      throw new Error(`Order assignment failed: ${error.message}`);
    }
  }

  /**
   * Get assignment statistics (useful for debugging/monitoring)
   * @returns {Object} Assignment statistics
   */
  async getAssignmentStats() {
    try {
      const assistants = await this.getAvailableAssistants();
      const lastAssigned = await this.getLastAssignedAssistant();
      
      return {
        totalAssistants: assistants.length,
        assistantIds: assistants.map(a => a._id.toString()),
        lastAssignedId: lastAssigned ? lastAssigned.toString() : null,
        lastAssignedName: lastAssigned ? 
          assistants.find(a => a._id.toString() === lastAssigned.toString())?.username || 'Unknown'
          : 'None'
      };
    } catch (error) {
      console.error('❌ Error getting assignment stats:', error);
      return { error: error.message };
    }
  }
}

module.exports = new AssignmentService();