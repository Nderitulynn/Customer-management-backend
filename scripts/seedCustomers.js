// backend/scripts/seedCustomers.js
const mongoose = require('mongoose');
const Customer = require('../models/Customer');
require('dotenv').config();

const sampleCustomers = [
  {
    firstName: 'Grace',
    lastName: 'Wanjiku',
    email: 'grace.wanjiku@email.com',
    phone: '0712345678',
    createdBy: null, // We'll set this after creating admin user
    dateOfBirth: new Date('1990-05-15'),
    address: {
      street: '123 Craft Lane',
      city: 'Nairobi',
      county: 'Nairobi',
      postalCode: '00100',
      country: 'Kenya'
    },
    interests: ['wall-hangings', 'plant-hangers'],
    skillLevel: 'beginner',
    preferredWorkshopTypes: ['in-person'],
    communicationPreference: 'whatsapp',
    totalSpent: 15675, // ~156.75 USD in KES (1 USD ≈ 100 KES)
    loyaltyPoints: 157,
    orderHistory: [
      {
        orderId: 'ORD-001',
        date: new Date('2024-01-15'),
        amount: 8999, // ~89.99 USD
        items: ['Macrame Wall Hanging Kit', 'Cotton Cord 3mm'],
        status: 'completed'
      },
      {
        orderId: 'ORD-002',
        date: new Date('2024-02-20'),
        amount: 6676, // ~66.76 USD
        items: ['Plant Hanger Kit', 'Wooden Beads Set'],
        status: 'completed'
      }
    ]
  },
  {
    firstName: 'Michael',
    lastName: 'Kimani',
    email: 'michael.kimani@email.com',
    phone: '0723456789',
    createdBy: null,
    dateOfBirth: new Date('1985-08-22'),
    address: {
      street: '456 Maker Street',
      city: 'Mombasa',
      county: 'Mombasa',
      postalCode: '80100',
      country: 'Kenya'
    },
    interests: ['keychains', 'jewelry'],
    skillLevel: 'intermediate',
    preferredWorkshopTypes: ['online', 'in-person'],
    communicationPreference: 'sms',
    totalSpent: 34250, // ~342.50 USD
    loyaltyPoints: 343,
    orderHistory: [
      {
        orderId: 'ORD-003',
        date: new Date('2024-01-10'),
        amount: 12500, // ~125.00 USD
        items: ['Advanced Jewelry Kit', 'Premium Cord Bundle'],
        status: 'completed'
      },
      {
        orderId: 'ORD-004',
        date: new Date('2024-02-14'),
        amount: 8999, // ~89.99 USD
        items: ['Keychain Making Kit', 'Metal Rings Set'],
        status: 'completed'
      },
      {
        orderId: 'ORD-005',
        date: new Date('2024-03-05'),
        amount: 12751, // ~127.51 USD
        items: ['Bohemian Bracelet Kit', 'Colorful Cord Set'],
        status: 'completed'
      }
    ]
  },
  {
    firstName: 'Sarah',
    lastName: 'Achieng',
    email: 'sarah.achieng@email.com',
    phone: '0734567890',
    createdBy: null,
    dateOfBirth: new Date('1992-12-03'),
    address: {
      street: '789 Creative Ave',
      city: 'Kisumu',
      county: 'Kisumu',
      postalCode: '40100',
      country: 'Kenya'
    },
    interests: ['wall-hangings', 'plant-hangers', 'bags'],
    skillLevel: 'advanced',
    preferredWorkshopTypes: ['in-person'],
    communicationPreference: 'whatsapp',
    totalSpent: 67825, // ~678.25 USD - VIP customer
    loyaltyPoints: 678,
    orderHistory: [
      {
        orderId: 'ORD-006',
        date: new Date('2024-01-05'),
        amount: 19999, // ~199.99 USD
        items: ['Large Wall Art Kit', 'Premium Natural Cord'],
        status: 'completed'
      },
      {
        orderId: 'ORD-007',
        date: new Date('2024-01-20'),
        amount: 15675, // ~156.75 USD
        items: ['Hanging Garden Kit', 'Ceramic Planters Set'],
        status: 'completed'
      },
      {
        orderId: 'ORD-008',
        date: new Date('2024-02-28'),
        amount: 32151, // ~321.51 USD
        items: ['Macrame Bag Kit', 'Leather Handles', 'Waxed Cord Bundle'],
        status: 'completed'
      }
    ]
  },
  {
    firstName: 'David',
    lastName: 'Mwangi',
    email: 'david.mwangi@email.com',
    phone: '0745678901',
    createdBy: null,
    dateOfBirth: new Date('1988-04-17'),
    address: {
      street: '321 Artisan Blvd',
      city: 'Nakuru',
      county: 'Nakuru',
      postalCode: '20100',
      country: 'Kenya'
    },
    interests: ['keychains'],
    skillLevel: 'beginner',
    preferredWorkshopTypes: ['online'],
    communicationPreference: 'email',
    totalSpent: 4599, // ~45.99 USD
    loyaltyPoints: 46,
    orderHistory: [
      {
        orderId: 'ORD-009',
        date: new Date('2024-03-10'),
        amount: 4599, // ~45.99 USD
        items: ['Beginner Keychain Kit'],
        status: 'completed'
      }
    ]
  },
  {
    firstName: 'Faith',
    lastName: 'Njeri',
    email: 'faith.njeri@email.com',
    phone: '0756789012',
    createdBy: null,
    dateOfBirth: new Date('1995-07-28'),
    address: {
      street: '654 Hobby Lane',
      city: 'Eldoret',
      county: 'Uasin Gishu',
      postalCode: '30100',
      country: 'Kenya'
    },
    interests: ['wall-hangings', 'jewelry', 'bags'],
    skillLevel: 'intermediate',
    preferredWorkshopTypes: ['in-person', 'online'],
    communicationPreference: 'whatsapp',
    totalSpent: 52375, // ~523.75 USD - VIP customer
    loyaltyPoints: 524,
    orderHistory: [
      {
        orderId: 'ORD-010',
        date: new Date('2024-01-25'),
        amount: 17850, // ~178.50 USD
        items: ['Boho Wall Hanging Kit', 'Feather Accessories'],
        status: 'completed'
      },
      {
        orderId: 'ORD-011',
        date: new Date('2024-02-15'),
        amount: 13425, // ~134.25 USD
        items: ['Earring Making Kit', 'Gemstone Beads'],
        status: 'completed'
      },
      {
        orderId: 'ORD-012',
        date: new Date('2024-03-01'),
        amount: 21100, // ~211.00 USD
        items: ['Crossbody Bag Kit', 'Adjustable Straps'],
        status: 'completed'
      }
    ]
  },
  {
    firstName: 'James',
    lastName: 'Otieno',
    email: 'james.otieno@email.com',
    phone: '0767890123',
    createdBy: null,
    dateOfBirth: new Date('1987-11-12'),
    address: {
      street: '890 Workshop Street',
      city: 'Thika',
      county: 'Kiambu',
      postalCode: '01000',
      country: 'Kenya'
    },
    interests: ['home-decor', 'wall-hangings'],
    skillLevel: 'intermediate',
    preferredWorkshopTypes: ['online'],
    communicationPreference: 'whatsapp',
    totalSpent: 28450, // ~284.50 USD
    loyaltyPoints: 285,
    orderHistory: [
      {
        orderId: 'ORD-013',
        date: new Date('2024-02-05'),
        amount: 15200, // ~152.00 USD
        items: ['Home Decor Kit', 'Natural Fiber Bundle'],
        status: 'completed'
      },
      {
        orderId: 'ORD-014',
        date: new Date('2024-03-15'),
        amount: 13250, // ~132.50 USD
        items: ['Modern Wall Art Kit', 'Colored Rope Set'],
        status: 'completed'
      }
    ]
  },
  {
    firstName: 'Mary',
    lastName: 'Wambui',
    email: 'mary.wambui@email.com',
    phone: '0778901234',
    createdBy: null,
    dateOfBirth: new Date('1993-03-08'),
    address: {
      street: '234 Craft Center',
      city: 'Nyeri',
      county: 'Nyeri',
      postalCode: '10100',
      country: 'Kenya'
    },
    interests: ['bags', 'jewelry', 'keychains'],
    skillLevel: 'advanced',
    preferredWorkshopTypes: ['in-person'],
    communicationPreference: 'phone',
    totalSpent: 41200, // ~412.00 USD
    loyaltyPoints: 412,
    orderHistory: [
      {
        orderId: 'ORD-015',
        date: new Date('2024-01-12'),
        amount: 18500, // ~185.00 USD
        items: ['Premium Bag Kit', 'Leather Accents'],
        status: 'completed'
      },
      {
        orderId: 'ORD-016',
        date: new Date('2024-02-22'),
        amount: 12300, // ~123.00 USD
        items: ['Jewelry Starter Kit', 'Semi-precious Stones'],
        status: 'completed'
      },
      {
        orderId: 'ORD-017',
        date: new Date('2024-03-18'),
        amount: 10400, // ~104.00 USD
        items: ['Custom Keychain Kit', 'Personalization Tools'],
        status: 'completed'
      }
    ]
  }
];

const seedCustomers = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/customer-management');
    console.log('📱 Connected to MongoDB for customer seeding...');

    // Import User model to get admin user
    const User = require('../models/User');
    
    // Find admin user to use as createdBy
    const adminUser = await User.findOne({ role: 'admin' });
    if (!adminUser) {
      console.log('❌ Admin user not found! Please run: npm run seed:admin first');
      process.exit(1);
    }

    // Set createdBy for all sample customers
    sampleCustomers.forEach(customer => {
      customer.createdBy = adminUser._id;
    });

    // Clear existing customers (optional - comment out if you want to keep existing data)
    await Customer.deleteMany({});
    console.log('🗑️  Cleared existing customer data');

    // Insert sample customers
    const customers = await Customer.insertMany(sampleCustomers);
    console.log(`✅ Successfully created ${customers.length} sample customers!`);
    
    console.log('\n📊 Customer Summary:');
    customers.forEach((customer, index) => {
      console.log(`${index + 1}. ${customer.firstName} ${customer.lastName} - ${customer.email}`);
      console.log(`   Phone: ${customer.formattedPhone} | Skill: ${customer.skillLevel}`);
      console.log(`   Spent: KES ${customer.totalSpent.toLocaleString('en-KE')} | Segment: ${customer.segment}`);
      console.log(`   Location: ${customer.address.city}, ${customer.address.county}`);
    });

    console.log('\n🇰🇪 Kenyan customer data ready for your dashboard!');
    console.log('💡 Phone numbers are stored in local format (07xxxxxxxx) but can be displayed as +254 format');
    console.log('💰 Amounts are in KES (Kenyan Shillings) - approximately 100 KES = 1 USD');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding customers:', error.message);
    process.exit(1);
  }
};

// Run the seed function
seedCustomers();