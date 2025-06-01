# Fix Null Username Values in Database

## Description
The bot is currently saving null values for username and avatar_url fields in the user statistics database. This needs to be fixed to ensure proper data storage and display.

## Current Behavior
```json
{
  "_id": "1137564967491612683",
  "username": null,
  "avatar_url": null,
  "total_study_minutes": 130,
  "total_event_minutes": 0,
  "total_tasks": 2,
  "completed_tasks": 2,
  "abandoned_tasks": 1,
  "completion_percentage": 100,
  "current_streak_days": 1,
  "longest_streak_days": 1,
  "last_study_date": "2025-06-01",
  "study_days": [
    {
      "date": "2025-06-01",
      "minutes": 130
    }
  ]
}
```

## Expected Behavior
- Username and avatar_url fields should never be null
- All user statistics should have valid username and avatar information
- Leaderboard and other displays should show correct user information

## Root Cause
The issue occurs in the voice handler when a user leaves a voice channel. The code is trying to access user information from `newState` when it should be using `oldState`, as the user information might not be available in the new state.

## Proposed Fix
1. Update user information retrieval in voice handler:
```javascript
const user = oldState.member?.user || newState.member?.user;
```

2. Add proper null checks before saving:
```javascript
if (!user.username || !user.displayAvatarURL) {
    console.log(`[DEBUG] WARNING: Missing user information for ${memberId}`);
    return;
}
```

3. Create a database cleanup script to:
   - Find all records with null username/avatar_url
   - Attempt to fetch current user information from Discord
   - Update the records with valid information
   - Log any records that couldn't be updated

## Affected Components
- `handlers/voiceHandler.js`
- `db/userStats.js`
- `db/userCurrentStats.js`
- Database records

## Labels
- bug
- database
- high-priority

## Priority
High - This affects data integrity and user experience in the leaderboard and statistics displays 