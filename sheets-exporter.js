#!/usr/bin/env node

import dotenv from 'dotenv';
import { google } from 'googleapis';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();

// MongoDB connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
};

// Google Sheets authentication
const getGoogleSheetsAuth = () => {
  try {
    const credentials = {
      type: process.env.GOOGLE_SERVICE_ACCOUNT_TYPE || 'service_account',
      project_id: process.env.GOOGLE_PROJECT_ID,
      private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      client_id: process.env.GOOGLE_CLIENT_ID,
      auth_uri: process.env.GOOGLE_AUTH_URI || 'https://accounts.google.com/o/oauth2/auth',
      token_uri: process.env.GOOGLE_TOKEN_URI || 'https://oauth2.googleapis.com/token',
      auth_provider_x509_cert_url: process.env.GOOGLE_AUTH_PROVIDER_X509_CERT_URL || 'https://www.googleapis.com/oauth2/v1/certs',
      client_x509_cert_url: process.env.GOOGLE_CLIENT_X509_CERT_URL
    };

    // Validate required credentials
    const requiredFields = ['project_id', 'private_key', 'client_email'];
    const missingFields = requiredFields.filter(field => !credentials[field]);
    
    if (missingFields.length > 0) {
      throw new Error(`Missing required Google Sheets credentials: ${missingFields.join(', ')}`);
    }

    return new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
  } catch (error) {
    console.error('❌ Google Sheets authentication failed:', error);
    throw error;
  }
};

// Data transformation utilities
const secondsToHours = (seconds) => (seconds / 3600).toFixed(2);

const formatDate = (date) => {
  if (!date) return 'Never';
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

const calculateTaskCompletionRate = (totalTasks, completedTasks) => {
  if (totalTasks === 0) return '0%';
  return `${((completedTasks / totalTasks) * 100).toFixed(1)}%`;
};

const transformUserStatsForSheets = (userStatsArray) => {
  const headers = [
    'User ID',
    'Username',
    'Total Study Time (Hours)',
    'Event Study Time (Hours)',
    'Total Sessions',
    'Current Streak',
    'Longest Streak',
    'Study Days Count',
    'Last Study Day',
    'Total Tasks',
    'Completed Tasks',
    'Task Completion Rate',
    'Current Event Role',
    'Last Updated'
  ];

  const dataRows = userStatsArray.map(stats => [
    stats.userId || '',
    stats.username || '',
    secondsToHours(stats.totalStudyTime || 0),
    secondsToHours(stats.eventStudyTime || 0),
    stats.totalSessions || 0,
    stats.currentStreak || 0,
    stats.longestStreak || 0,
    (Array.isArray(stats.studyDays) ? stats.studyDays.length : 0),
    formatDate(stats.lastStudyDay),
    stats.totalTasks || 0,
    stats.completedTasks || 0,
    calculateTaskCompletionRate(stats.totalTasks || 0, stats.completedTasks || 0),
    stats.currentEventRole || 'None',
    formatDate(stats.lastUpdated)
  ]);

  return [headers, ...dataRows];
};

const getSummaryStats = (userStatsArray) => {
  const totalUsers = userStatsArray.length;
  const activeUsers = userStatsArray.filter(stats => stats.totalStudyTime > 0).length;
  const totalStudyTime = userStatsArray.reduce((sum, stats) => sum + stats.totalStudyTime, 0);
  const totalSessions = userStatsArray.reduce((sum, stats) => sum + stats.totalSessions, 0);
  const totalTasks = userStatsArray.reduce((sum, stats) => sum + stats.totalTasks, 0);
  const completedTasks = userStatsArray.reduce((sum, stats) => sum + stats.completedTasks, 0);

  return {
    totalUsers,
    activeUsers,
    totalStudyTimeHours: secondsToHours(totalStudyTime),
    totalSessions,
    totalTasks,
    completedTasks,
    taskCompletionRate: calculateTaskCompletionRate(totalTasks, completedTasks),
    averageStudyTimePerUser: totalUsers > 0 ? secondsToHours(totalStudyTime / totalUsers) : '0.00',
    averageSessionsPerUser: totalUsers > 0 ? (totalSessions / totalUsers).toFixed(1) : '0'
  };
};

const getTopPerformers = (userStatsArray, limit = 20) => {
  return userStatsArray
    .filter(stats => stats.totalStudyTime > 0)
    .sort((a, b) => b.totalStudyTime - a.totalStudyTime)
    .slice(0, limit)
    .map((stats, index) => ({
      rank: index + 1,
      username: stats.username,
      totalStudyTime: secondsToHours(stats.totalStudyTime),
      totalSessions: stats.totalSessions,
      currentStreak: stats.currentStreak,
      longestStreak: stats.longestStreak
    }));
};

// Google Sheets operations
class GoogleSheetsExporter {
  constructor() {
    this.auth = getGoogleSheetsAuth();
    this.sheets = google.sheets({ version: 'v4', auth: this.auth });
    this.spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
    
    if (!this.spreadsheetId) {
      throw new Error('GOOGLE_SPREADSHEET_ID environment variable is required');
    }
  }

  async ensureSheetsExist() {
    try {
      // Get existing sheets
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId
      });
      
      const existingSheets = response.data.sheets.map(sheet => sheet.properties.title);
      const requiredSheets = ['All Users', 'Summary', 'Top Performers'];
      const missingSheets = requiredSheets.filter(sheetName => !existingSheets.includes(sheetName));
      
      if (missingSheets.length > 0) {
        console.log(`📝 Creating missing sheets: ${missingSheets.join(', ')}`);
        
        const requests = missingSheets.map(sheetName => ({
          addSheet: {
            properties: {
              title: sheetName
            }
          }
        }));
        
        await this.sheets.spreadsheets.batchUpdate({
          spreadsheetId: this.spreadsheetId,
          resource: {
            requests: requests
          }
        });
        
        console.log('✅ Sheets created successfully');
      } else {
        console.log('✅ All required sheets already exist');
      }
    } catch (error) {
      console.error('❌ Error ensuring sheets exist:', error);
      throw error;
    }
  }

  async updateSheetData(sheetName, data) {
    try {
      // Clear existing data
      await this.sheets.spreadsheets.values.clear({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A:Z`
      });

      // Add new data
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A1`,
        valueInputOption: 'RAW',
        resource: { values: data }
      });

      console.log(`✅ Updated sheet: ${sheetName}`);
    } catch (error) {
      console.error(`❌ Error updating sheet ${sheetName}:`, error);
      throw error;
    }
  }

  async addSummarySheet(userStatsArray) {
    const summary = getSummaryStats(userStatsArray);
    
    const summaryData = [
      ['Pomo Bot - Summary Statistics'],
      [''],
      ['Metric', 'Value'],
      ['Total Users', summary.totalUsers],
      ['Active Users', summary.activeUsers],
      ['Total Study Time (Hours)', summary.totalStudyTimeHours],
      ['Total Sessions', summary.totalSessions],
      ['Total Tasks', summary.totalTasks],
      ['Completed Tasks', summary.completedTasks],
      ['Task Completion Rate', summary.taskCompletionRate],
      ['Average Study Time per User (Hours)', summary.averageStudyTimePerUser],
      ['Average Sessions per User', summary.averageSessionsPerUser],
      [''],
      ['Last Updated', new Date().toLocaleString()]
    ];

    await this.updateSheetData('Summary', summaryData);
  }

  async addTopPerformersSheet(userStatsArray) {
    const topPerformers = getTopPerformers(userStatsArray, 20);
    
    const leaderboardData = [
      ['Pomo Bot - Top Performers'],
      [''],
      ['Rank', 'Username', 'Study Time (Hours)', 'Sessions', 'Current Streak', 'Longest Streak'],
      ...topPerformers.map(performer => [
        performer.rank,
        performer.username,
        performer.totalStudyTime,
        performer.totalSessions,
        performer.currentStreak,
        performer.longestStreak
      ]),
      [''],
      ['Last Updated', new Date().toLocaleString()]
    ];

    await this.updateSheetData('Top Performers', leaderboardData);
  }
}

// Main export function
const exportUserStatsToGoogleSheets = async () => {
  const startTime = Date.now();
  console.log('🔄 Starting Google Sheets export...');

  try {
    // Connect to MongoDB
    await connectDB();

    // Get the raw collection instead of using Mongoose model
    const db = mongoose.connection.db;
    const collection = db.collection('userstats');
    
    // Get all user stats
    const allUserStats = await collection.find({}).toArray();
    
    if (allUserStats.length === 0) {
      console.log('⚠️ No user stats found to export');
      return;
    }

    console.log(`📊 Found ${allUserStats.length} user records to export`);
    
    // Debug: Log first record to see structure
    if (allUserStats.length > 0) {
      console.log('🔍 Sample record structure:', {
        userId: allUserStats[0].userId,
        username: allUserStats[0].username,
        totalStudyTime: allUserStats[0].totalStudyTime,
        studyDaysCount: allUserStats[0].studyDays ? allUserStats[0].studyDays.length : 'undefined'
      });
    }

    // Initialize Google Sheets exporter
    const exporter = new GoogleSheetsExporter();

    // Ensure required sheets exist
    await exporter.ensureSheetsExist();

    // Transform data for sheets
    const sheetData = transformUserStatsForSheets(allUserStats);
    
    // Update sheets
    await exporter.updateSheetData('All Users', sheetData);
    await exporter.addSummarySheet(allUserStats);
    await exporter.addTopPerformersSheet(allUserStats);

    const executionTime = Date.now() - startTime;
    console.log(`✅ Google Sheets export completed successfully`);
    console.log(`📈 Exported ${allUserStats.length} user records`);
    console.log(`⏱️ Execution time: ${executionTime}ms`);

  } catch (error) {
    console.error('❌ Google Sheets export failed:', error);
    throw error;
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log('🔌 MongoDB connection closed');
  }
};

// Check if this script is being run directly
const __filename = fileURLToPath(import.meta.url);
const isDirectExecution = process.argv[1] === __filename;

if (isDirectExecution) {
  console.log('🚀 Starting standalone Google Sheets export...');
  exportUserStatsToGoogleSheets()
    .then(() => {
      console.log('🎉 Export process completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Export process failed:', error);
      process.exit(1);
    });
}

// Export for use in other modules
export { exportUserStatsToGoogleSheets }; 