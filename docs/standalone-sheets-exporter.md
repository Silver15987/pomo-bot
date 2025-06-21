# Standalone Google Sheets Exporter

This is a completely independent Google Sheets exporter that runs separately from your Discord bot. It connects directly to your MongoDB database and exports user statistics to Google Sheets.

## Features

- ✅ **Completely Independent** - Runs separately from Discord bot
- ✅ **Error Isolation** - Never crashes the main bot
- ✅ **Scheduled Exports** - Runs every 15 minutes by default
- ✅ **Manual Export** - Can be triggered manually
- ✅ **Multiple Sheets** - Creates All Users, Summary, and Top Performers sheets
- ✅ **Detailed Logging** - Comprehensive error handling and logging
- ✅ **Graceful Shutdown** - Handles process termination properly

## Quick Start

### 1. Test Manual Export
```bash
npm run export-sheets
```

### 2. Start Scheduled Exporter
```bash
npm run sheets-scheduler
```

## Configuration

### Environment Variables
Add these to your `.env` file:

```env
# MongoDB
MONGODB_URI=your_mongodb_connection_string

# Google Sheets API
GOOGLE_PROJECT_ID=your_project_id
GOOGLE_PRIVATE_KEY_ID=your_private_key_id
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour private key\n-----END PRIVATE KEY-----\n"
GOOGLE_CLIENT_EMAIL=your_service_account_email
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_X509_CERT_URL=your_cert_url

# Google Sheets
GOOGLE_SPREADSHEET_ID=your_spreadsheet_id

# Optional: Custom schedule (default: every 15 minutes)
SHEETS_EXPORT_SCHEDULE="*/15 * * * *"
```

### Schedule Configuration
The default schedule is every 15 minutes. You can customize it:

```env
# Every 5 minutes
SHEETS_EXPORT_SCHEDULE="*/5 * * * *"

# Every hour
SHEETS_EXPORT_SCHEDULE="0 * * * *"

# Every day at 2 AM
SHEETS_EXPORT_SCHEDULE="0 2 * * *"
```

## Usage

### Manual Export
Run a one-time export:
```bash
npm run export-sheets
```

### Scheduled Exporter
Start the continuous scheduler:
```bash
npm run sheets-scheduler
```

The scheduler will:
- Run initial export after 5 seconds
- Continue on the configured schedule
- Print status every hour
- Handle graceful shutdown with Ctrl+C

### Output
Both scripts provide detailed console output:
```
🔄 Starting Google Sheets export...
✅ Connected to MongoDB
📊 Found 25 user records to export
✅ Updated sheet: All Users
✅ Updated sheet: Summary
✅ Updated sheet: Top Performers
✅ Google Sheets export completed successfully
📈 Exported 25 user records
⏱️ Execution time: 2345ms
🔌 MongoDB connection closed
```

## Sheet Structure

### 1. "All Users" Sheet
Complete user statistics:
- User ID, Username
- Study times (in hours)
- Sessions, streaks, tasks
- Event roles, dates

### 2. "Summary" Sheet
Overall statistics:
- Total users, active users
- Total study time, sessions, tasks
- Completion rates, averages

### 3. "Top Performers" Sheet
Leaderboard of top 20 users by study time.

## Error Handling

The exporter includes comprehensive error handling:

- **MongoDB Connection Errors** - Logged and process exits gracefully
- **Google Sheets API Errors** - Logged with detailed error messages
- **Data Processing Errors** - Individual errors don't stop the process
- **Network Errors** - Retry logic and timeout handling

## Monitoring

### Scheduler Status
The scheduler prints status every hour:
```
📊 Google Sheets Exporter Status:
⏱️  Uptime: 2h 15m 30s
📈 Total Exports: 9
✅ Successful: 8
❌ Failed: 1
📊 Success Rate: 88.9%
🕐 Last Export: 12/15/2024, 2:30:45 PM
```

### Logs
All errors and operations are logged to console with timestamps.

## Deployment Options

### 1. Local Development
```bash
npm run sheets-scheduler
```

### 2. Production (PM2)
```bash
pm2 start sheets-scheduler.js --name "sheets-exporter"
pm2 save
pm2 startup
```

### 3. Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["npm", "run", "sheets-scheduler"]
```

### 4. Cron Job (Linux/Mac)
```bash
# Add to crontab
*/15 * * * * cd /path/to/pomo-bot && npm run export-sheets
```

## Troubleshooting

### Common Issues

1. **"Missing required environment variables"**
   - Check your `.env` file
   - Ensure all Google Sheets credentials are set

2. **"MongoDB connection failed"**
   - Verify your MongoDB URI
   - Check network connectivity

3. **"Permission denied" on Google Sheets**
   - Share the sheet with your service account email
   - Verify the spreadsheet ID

4. **"API not enabled"**
   - Enable Google Sheets API in Google Cloud Console

### Debug Mode
For detailed debugging, you can modify the scripts to include more verbose logging.

## Security Notes

- Keep your service account JSON file secure
- Never commit credentials to version control
- Use environment variables for all sensitive data
- Regularly rotate service account keys

## Performance

- **Typical Export Time**: 1-5 seconds for 100+ users
- **Memory Usage**: Minimal (connects, exports, disconnects)
- **API Quota**: Well within free tier limits
- **Database Impact**: Read-only operations only 