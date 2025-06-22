// backend/scripts/seedAdmin.js
const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

const seedAdmin = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/customer-management');
    console.log('📱 Connected to MongoDB for seeding...');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ username: 'admin' });
    if (existingAdmin) {
      console.log('⚠️  Admin user already exists!');
      console.log('📧 Email:', existingAdmin.email);
      console.log('👤 Username:', existingAdmin.username);
      console.log('🔐 Role:', existingAdmin.role);
      process.exit(0);
    }

    // Create admin user
    const adminUser = new User({
      username: 'admin',
      email: 'admin@customerms.com',
      password: 'Admin123!', // Change this password after first login
      firstName: 'System',
      lastName: 'Administrator',
      role: 'admin'
    });

    await adminUser.save();
    console.log('✅ Admin user created successfully!');
    console.log('');
    console.log('🔑 Login Credentials:');
    console.log('   Username: admin');
    console.log('   Email: admin@customerms.com');
    console.log('   Password: Admin123!');
    console.log('');
    console.log('⚠️  IMPORTANT: Change the password after first login!');
    console.log('');

    // Create a sample assistant user too
    const assistantUser = new User({
      username: 'assistant',
      email: 'assistant@customerms.com',
      password: 'Assistant123!',
      firstName: 'Sales',
      lastName: 'Assistant',
      role: 'assistant'
    });

    await assistantUser.save();
    console.log('✅ Assistant user created successfully!');
    console.log('');
    console.log('🔑 Assistant Login Credentials:');
    console.log('   Username: assistant');
    console.log('   Email: assistant@customerms.com');
    console.log('   Password: Assistant123!');
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding admin user:', error.message);
    process.exit(1);
  }
};

// Run the seed function
seedAdmin();