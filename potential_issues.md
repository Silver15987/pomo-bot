# Potential Bot Issues and Fixes

## 1. DM Closed Users
**Issue**: Users with closed DMs can stay in VC without task tracking
**Fix**:
```javascript
// In taskPromptHandler.js
if (dmError) {
    // Send VC message
    // Kick user from VC after a short delay
    setTimeout(() => {
        member.voice.disconnect("DMs are required for focus sessions");
    }, 5000);
    return;
}
```

## 2. Task Submission Cleanup
**Issue**: If task submission fails, pending task state might not be cleaned up
**Fix**:
```javascript
// In taskPromptHandler.js
try {
    await saveTask(userId, task, duration, eventLinked, roleId);
} catch (err) {
    // Clean up pending task
    pendingTasks.delete(userId);
    TimeoutManager.clearUserTimeout(userId);
    throw err;
}
```

## 3. Task Completion State
**Issue**: If user leaves VC before responding to completion prompt, task state might not be handled properly
**Fix**:
```javascript
// In taskPromptHandler.js
const reminderTimeout = setTimeout(async () => {
    if (!getActiveVC(userId)) {
        // User left VC, clean up task
        await abandonTask(userId);
        TimeoutManager.clearUserTimeout(userId);
        return;
    }
    // Rest of the timeout handling
}, followupTimeoutMs);
```

## 4. Event Window Changes
**Issue**: If event window changes while users are in VC, their status might not update correctly
**Fix**:
```javascript
// In eventUtils.js
function isWithinEventWindow() {
    const now = new Date();
    const isEvent = now >= new Date(eventStart) && now <= new Date(eventEnd);
    // Log event window status changes
    if (isEvent !== lastEventStatus) {
        console.log(`[DEBUG] Event window status changed to: ${isEvent}`);
        lastEventStatus = isEvent;
    }
    return isEvent;
}
```

## 5. Team Changes During Active Task
**Issue**: If user changes teams during an active task, stats might not update correctly
**Fix**:
```javascript
// In voiceHandler.js
if (oldState.member.roles.cache.find(r => teamRoles.includes(r.id))?.id !== 
    newState.member.roles.cache.find(r => teamRoles.includes(r.id))?.id) {
    // Team changed, update task team
    await updateTaskTeam(userId, newState.member.roles.cache.find(r => teamRoles.includes(r.id))?.id);
}
```

## Flow Analysis Summary

### Working Correctly
- ✅ Disallowed VC check
- ✅ DM permission check
- ✅ Task prompt sending
- ✅ 3-minute timer setup
- ✅ Task validation
- ✅ Existing task check
- ✅ Task saving
- ✅ Timer completion
- ✅ Completion prompt
- ✅ User options
- ✅ Time calculation
- ✅ Stats updates
- ✅ Event tracking
- ✅ Event window check
- ✅ Leaderboard updates
- ✅ Role assignment
- ✅ Team stats tracking
- ✅ Error logging
- ✅ Retry mechanisms
- ✅ Admin permission checks
- ✅ Command execution

### Potential Issues
1. DM closed users can stay in VC
2. Task submission cleanup on failure
3. Task completion state when user leaves
4. Event window changes during active sessions
5. Team changes during active tasks

## Recommendations
1. Implement DM requirement enforcement
2. Add proper cleanup for failed task submissions
3. Improve task state handling for users leaving VC
4. Add event window change detection and handling
5. Add team change detection and handling

## Priority
1. High: DM requirement enforcement
2. Medium: Task submission cleanup
3. Medium: Task completion state
4. Low: Event window changes
5. Low: Team changes during tasks 