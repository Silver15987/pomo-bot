# Update Username Handling for Discord's New Username Policy

## Description
Discord has recently updated their username policy, removing the discriminator (#) system. We need to update our bot to handle the new username format correctly.

## Current Behavior
- The bot uses `user.username` directly from Discord.js user objects
- This can lead to null values in the database for username fields
- The code doesn't account for Discord's new username system

## Expected Behavior
- The bot should use the new username properties in this priority order:
  1. `user.globalName` (new global display name)
  2. `user.displayName` (fallback to display name)
  3. `user.username` (legacy fallback)
- All username fields in the database should have valid values
- The bot should maintain backward compatibility while supporting the new system

## Affected Components
- `handlers/voiceHandler.js`
- `db/userStats.js`
- `db/userCurrentStats.js`
- Any other components that handle user information

## Proposed Changes
1. Update voice handler to use the correct username property:
```javascript
const username = user.globalName || user.displayName || user.username;
```

2. Update all references to `user.username` to use the new `username` variable

3. Add proper null checks for the username field

4. Create a cleanup script to update existing records in the database

## Additional Notes
- This change is necessary to comply with Discord's new username policy
- The update should be backward compatible
- Consider adding logging to track username changes
- May need to update leaderboard and other display components to handle the new format

## Labels
- enhancement
- bug
- discord-api
- database

## Priority
Medium - This affects user data storage and display but doesn't break core functionality 