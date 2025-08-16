const { MongoClient } = require('mongodb');
require('dotenv').config();

// Collection names array - Updated to include messages and remove whatsapp_chats
const COLLECTIONS = [
  'users',
  'customers', 
  'orders',
  'messages',      // ADDED: Messages collection for customer-assistant communication
  'notifications',
  'analytics',
  'system_settings'  // For assignment tracking and other settings
];

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
    
    // Create collections only (no manual index creation)
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
    console.log('   ✅ analytics - Analytics and reporting');
    console.log('   ✅ system_settings - System configuration');
    
    console.log('\n📇 Index Management:');
    console.log('   🔧 Indexes will be automatically created by Mongoose based on schema definitions');
    console.log('   📝 Define indexes in your Mongoose schemas using:');
    console.log('      • field: { type: String, index: true }');
    console.log('      • field: { type: String, unique: true }');
    console.log('      • schema.index({ field1: 1, field2: -1 })');
    
    console.log('\n✨ You can now check MongoDB Compass to see your collections!');
    console.log('🚀 Ready for Mongoose schema initialization');
    
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