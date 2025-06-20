#!/usr/bin/env node

import { config } from 'dotenv';
import { runAllTests } from './test/sessionTimeTests.js';

// Load environment variables
config();

console.log('🚀 Pomo-Bot Session Testing Suite');
console.log('='.repeat(50));
console.log('Testing session time tracking and database integrity...\n');

// Ensure we have required environment variables
if (!process.env.MONGODB_URI) {
  console.error('❌ MONGODB_URI environment variable is required');
  process.exit(1);
}

// Run the tests
runAllTests().catch(error => {
  console.error('❌ Test suite failed:', error);
  process.exit(1);
}); 