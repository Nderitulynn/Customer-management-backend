const { MongoClient } = require('mongodb');
require('dotenv').config();

// Collection names array
const COLLECTIONS = [
  'users',
  'customers', 
  'orders',
  'whatsapp_chats',
  'notifications',
  'financial_data',
  'analytics'
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
    { key: { createdAt: 1 }, options: {} }
  ],
  orders: [
    { key: { customerId: 1 }, options: {} },
    { key: { status: 1 }, options: {} },
    { key: { createdAt: 1 }, options: {} },
    { key: { orderNumber: 1 }, options: { unique: true } }
  ],
  whatsapp_chats: [
    { key: { customerId: 1 }, options: {} },
    { key: { assignedTo: 1 }, options: {} },
    { key: { timestamp: 1 }, options: {} }
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
      console.log('✅ Customers indexes created (phone, email, createdAt)');
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
    
    // WhatsApp chats collection indexes
    try {
      const whatsappCollection = db.collection('whatsapp_chats');
      for (const indexDef of INDEX_DEFINITIONS.whatsapp_chats) {
        await whatsappCollection.createIndex(indexDef.key, indexDef.options);
      }
      console.log('✅ WhatsApp chats indexes created (customerId, assignedTo, timestamp)');
    } catch (error) {
      if (error.code !== 85) {
        console.log(`⚠️  WhatsApp chats indexes: ${error.message}`);
      } else {
        console.log('ℹ️  WhatsApp chats indexes already exist');
      }
    }
    
    // Success message
    console.log('\n🎉 Database setup completed successfully!');
    console.log('📊 Database: customer-management');
    console.log('🗂️  Collections created: ' + COLLECTIONS.length);
    console.log('🔗 MongoDB URI: ' + process.env.MONGODB_URI.replace(/\/\/.*@/, '//***:***@'));
    console.log('\n✨ You can now check MongoDB Compass to see your collections!');
    
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