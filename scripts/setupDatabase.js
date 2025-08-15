const { MongoClient } = require('mongodb');
require('dotenv').config();

// Collection names array - Updated to include messages and remove whatsapp_chats
const COLLECTIONS = [
  'users',
  'customers', 
  'orders',
  'messages',      // ADDED: Messages collection for customer-assistant communication
  'notifications',
  'financial_data',
  'analytics',
  'system_settings'  // For assignment tracking and other settings
];

// Index definitions for each collection
const INDEX_DEFINITIONS = {
  users: [
    { key: { username: 1 }, options: { unique: true } },
    { key: { email: 1 }, options: { unique: true } }
  ],
  customers: [
    { key: { phone: 1 }, options: {} },
    { key: { email: 1 }, options: {} },
    { key: { createdAt: 1 }, options: {} },
    { key: { assignedAssistantId: 1 }, options: {} }  // ADDED: For assistant assignment
  ],
  orders: [
    { key: { customerId: 1 }, options: {} },
    { key: { status: 1 }, options: {} },
    { key: { createdAt: 1 }, options: {} },
    { key: { orderNumber: 1 }, options: { unique: true } }
  ],
  messages: [
    // Core access patterns
    { key: { customerId: 1 }, options: {} },                    // Customer dashboard queries
    { key: { assistantId: 1 }, options: {} },                   // Assistant dashboard queries
    { key: { parentMessageId: 1 }, options: {} },               // Threading/replies
    
    // Status and filtering
    { key: { status: 1 }, options: {} },                        // Filter by read/unread
    { key: { priority: 1 }, options: {} },                      // Filter by priority
    { key: { messageType: 1 }, options: {} },                   // Filter initial vs replies
    
    // Time-based queries
    { key: { createdAt: 1 }, options: {} },                     // Chronological sorting
    { key: { updatedAt: 1 }, options: {} },                     // Recently updated
    { key: { readAt: 1 }, options: {} },                        // Read tracking
    
    // Compound indexes for common query patterns
    { key: { customerId: 1, status: 1 }, options: {} },         // Customer's unread messages
    { key: { assistantId: 1, status: 1 }, options: {} },        // Assistant's unread messages
    { key: { customerId: 1, createdAt: -1 }, options: {} },     // Customer's recent messages
    { key: { assistantId: 1, createdAt: -1 }, options: {} },    // Assistant's recent messages
    { key: { parentMessageId: 1, createdAt: 1 }, options: {} }, // Thread chronology
    
    // Search functionality
    { key: { subject: 'text', content: 'text' }, options: { name: 'message_text_search' } }  // Full-text search
  ],
  system_settings: [
    { key: { key: 1 }, options: { unique: true } }  // For key-value pairs
  ]
};

async function setupDatabase() {
  let client;
  
  try {
    // Check if MONGODB_URI exists
    if (!process.env.MONGODB_URI) {
      throw new Error('❌ MONGODB_URI not found in environment variables');
    }

    console.log('🚀 Connecting to MongoDB...');
    
    // Connect to MongoDB
    client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    
    console.log('✅ Connected to MongoDB successfully');
    
    // Get database reference
    const db = client.db('customer-management');
    console.log('📊 Using database: customer-management');
    
    // Create collections
    console.log('\n📁 Creating collections...');
    for (const collectionName of COLLECTIONS) {
      try {
        await db.createCollection(collectionName);
        console.log(`✅ Created collection: ${collectionName}`);
      } catch (error) {
        // Handle collection already exists error (code 48)
        if (error.code === 48) {
          console.log(`ℹ️  Collection already exists: ${collectionName}`);
        } else {
          throw error;
        }
      }
    }
    
    // Create indexes
    console.log('\n📇 Creating database indexes...');
    
    // Users collection indexes
    try {
      const usersCollection = db.collection('users');
      for (const indexDef of INDEX_DEFINITIONS.users) {
        await usersCollection.createIndex(indexDef.key, indexDef.options);
      }
      console.log('✅ Users indexes created (username, email - unique)');
    } catch (error) {
      if (error.code !== 85) { // Index already exists
        console.log(`⚠️  Users indexes: ${error.message}`);
      } else {
        console.log('ℹ️  Users indexes already exist');
      }
    }
    
    // Customers collection indexes
    try {
      const customersCollection = db.collection('customers');
      for (const indexDef of INDEX_DEFINITIONS.customers) {
        await customersCollection.createIndex(indexDef.key, indexDef.options);
      }
      console.log('✅ Customers indexes created (phone, email, createdAt, assignedAssistantId)');
    } catch (error) {
      if (error.code !== 85) {
        console.log(`⚠️  Customers indexes: ${error.message}`);
      } else {
        console.log('ℹ️  Customers indexes already exist');
      }
    }
    
    // Orders collection indexes
    try {
      const ordersCollection = db.collection('orders');
      for (const indexDef of INDEX_DEFINITIONS.orders) {
        await ordersCollection.createIndex(indexDef.key, indexDef.options);
      }
      console.log('✅ Orders indexes created (customerId, status, createdAt, orderNumber - unique)');
    } catch (error) {
      if (error.code !== 85) {
        console.log(`⚠️  Orders indexes: ${error.message}`);
      } else {
        console.log('ℹ️  Orders indexes already exist');
      }
    }
    
    // Messages collection indexes - NEW
    try {
      const messagesCollection = db.collection('messages');
      for (const indexDef of INDEX_DEFINITIONS.messages) {
        await messagesCollection.createIndex(indexDef.key, indexDef.options);
      }
      console.log('✅ Messages indexes created:');
      console.log('   📧 Core access: customerId, assistantId, parentMessageId');
      console.log('   🏷️  Filtering: status, priority, messageType');
      console.log('   ⏰ Time-based: createdAt, updatedAt, readAt');
      console.log('   🔍 Compound: customer+status, assistant+status, thread chronology');
      console.log('   🔎 Full-text search: subject and content');
    } catch (error) {
      if (error.code !== 85) {
        console.log(`⚠️  Messages indexes: ${error.message}`);
      } else {
        console.log('ℹ️  Messages indexes already exist');
      }
    }
    
    // System settings collection indexes
    try {
      const settingsCollection = db.collection('system_settings');
      for (const indexDef of INDEX_DEFINITIONS.system_settings) {
        await settingsCollection.createIndex(indexDef.key, indexDef.options);
      }
      console.log('✅ System settings indexes created (key - unique)');
    } catch (error) {
      if (error.code !== 85) {
        console.log(`⚠️  System settings indexes: ${error.message}`);
      } else {
        console.log('ℹ️  System settings indexes already exist');
      }
    }
    
    // Success message
    console.log('\n🎉 Database setup completed successfully!');
    console.log('📊 Database: customer-management');
    console.log('🗂️  Collections created: ' + COLLECTIONS.length);
    console.log('🔗 MongoDB URI: ' + process.env.MONGODB_URI.replace(/\/\/.*@/, '//***:***@'));
    
    console.log('\n📋 Collections Summary:');
    console.log('   ✅ users - User authentication and roles');
    console.log('   ✅ customers - Customer information and assistant assignments');
    console.log('   ✅ orders - Order management');
    console.log('   ✅ messages - Customer-assistant messaging system');
    console.log('   ✅ notifications - System notifications');
    console.log('   ✅ financial_data - Financial information');
    console.log('   ✅ analytics - Analytics and reporting');
    console.log('   ✅ system_settings - System configuration');
    
    console.log('\n✨ You can now check MongoDB Compass to see your collections!');
    console.log('🚀 Ready for messaging system implementation');
    
  } catch (error) {
    console.error('❌ Database setup failed:');
    console.error('Error:', error.message);
    
    if (error.code) {
      console.error('Error Code:', error.code);
    }
    
    // Provide helpful hints for common errors
    if (error.message.includes('ENOTFOUND') || error.message.includes('connection')) {
      console.log('\n💡 Troubleshooting tips:');
      console.log('   • Check your internet connection');
      console.log('   • Verify MONGODB_URI in your .env file');
      console.log('   • Ensure MongoDB Atlas cluster is running');
      console.log('   • Check if your IP is whitelisted in MongoDB Atlas');
    }
    
    throw error;
    
  } finally {
    // Always close the connection
    if (client) {
      await client.close();
      console.log('🔌 MongoDB connection closed');
    }
  }
}

// Run if called directly
if (require.main === module) {
  setupDatabase()
    .then(() => {
      console.log('\n✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Script failed:', error.message);
      process.exit(1);
    });
}

module.exports = { setupDatabase };