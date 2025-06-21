#!/usr/bin/env node

import cron from 'node-cron';
import { exportUserStatsToGoogleSheets } from './sheets-exporter.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Export statistics tracking
const exportStats = {
  totalExports: 0,
  successfulExports: 0,
  failedExports: 0,
  lastExportTime: null,
  lastError: null,
  startTime: new Date()
};

// Main export function with error handling
const runExport = async () => {
  const startTime = Date.now();
  exportStats.totalExports++;
  
  console.log(`\n🔄 [${new Date().toLocaleString()}] Starting scheduled Google Sheets export...`);
  
  try {
    await exportUserStatsToGoogleSheets();
    
    exportStats.successfulExports++;
    exportStats.lastExportTime = new Date();
    exportStats.lastError = null;
    
    const executionTime = Date.now() - startTime;
    console.log(`✅ [${new Date().toLocaleString()}] Scheduled export completed successfully (${executionTime}ms)`);
    
  } catch (error) {
    exportStats.failedExports++;
    exportStats.lastError = {
      message: error.message,
      timestamp: new Date()
    };
    
    console.error(`❌ [${new Date().toLocaleString()}] Scheduled export failed:`, error.message);
    
    // Log detailed error to file
    const errorLog = `[${new Date().toISOString()}] Export Error: ${error.stack}\n`;
    console.error(errorLog);
  }
};

// Print status function
const printStatus = () => {
  const uptime = Math.floor((Date.now() - exportStats.startTime.getTime()) / 1000);
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = uptime % 60;
  
  console.log('\n📊 Google Sheets Exporter Status:');
  console.log(`⏱️  Uptime: ${hours}h ${minutes}m ${seconds}s`);
  console.log(`📈 Total Exports: ${exportStats.totalExports}`);
  console.log(`✅ Successful: ${exportStats.successfulExports}`);
  console.log(`❌ Failed: ${exportStats.failedExports}`);
  console.log(`📊 Success Rate: ${exportStats.totalExports > 0 ? ((exportStats.successfulExports / exportStats.totalExports) * 100).toFixed(1) : 0}%`);
  console.log(`🕐 Last Export: ${exportStats.lastExportTime ? exportStats.lastExportTime.toLocaleString() : 'Never'}`);
  
  if (exportStats.lastError) {
    console.log(`❌ Last Error: ${exportStats.lastError.message} (${exportStats.lastError.timestamp.toLocaleString()})`);
  }
};

// Handle process termination gracefully
const gracefulShutdown = (signal) => {
  console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
  printStatus();
  process.exit(0);
};

// Set up signal handlers
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Get schedule from environment or default to every 15 minutes
const schedule = process.env.SHEETS_EXPORT_SCHEDULE || '*/15 * * * *';
const scheduleDescription = schedule === '*/15 * * * *' ? 'every 15 minutes' : `custom schedule: ${schedule}`;

console.log('🚀 Starting Google Sheets Exporter Scheduler...');
console.log(`⏰ Schedule: ${scheduleDescription}`);
console.log(`📊 Spreadsheet ID: ${process.env.GOOGLE_SPREADSHEET_ID || 'NOT SET'}`);
console.log(`🔗 MongoDB URI: ${process.env.MONGODB_URI ? 'SET' : 'NOT SET'}`);

// Validate required environment variables
const requiredEnvVars = [
  'MONGODB_URI',
  'GOOGLE_PROJECT_ID',
  'GOOGLE_PRIVATE_KEY',
  'GOOGLE_CLIENT_EMAIL',
  'GOOGLE_SPREADSHEET_ID'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingVars.join(', '));
  console.error('Please check your .env file');
  process.exit(1);
}

// Start the cron job
cron.schedule(schedule, runExport, {
  scheduled: true,
  timezone: "UTC"
});

console.log('✅ Scheduler started successfully');
console.log('💡 Press Ctrl+C to stop the scheduler');

// Run initial export after 5 seconds
setTimeout(() => {
  console.log('\n🔄 Running initial export...');
  runExport();
}, 5000);

// Print status every hour
setInterval(() => {
  printStatus();
}, 60 * 60 * 1000);

// Keep the process alive
process.stdin.resume(); 