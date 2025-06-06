# Voice Channel Session Tracking

## Description
Implement automatic session tracking when users join and leave voice channels, with special handling for event-linked sessions and server's VC creation feature.

## Core Features

### Session Creation (On VC Join)
- Automatically create session when user joins a VC
- Store basic information:
  - User ID
  - Channel ID
  - Join timestamp
  - Server ID
  - Event linkage status (if applicable)
- Handle server's VC creation feature:
  - Detect when user is moved to a new VC
  - Prevent micro-sessions (< 1 second)
  - Link related sessions if user is moved between VCs

### Session Updates (On VC Leave)
- Update session with:
  - Leave timestamp
  - Total duration
  - Final channel ID (if moved)
- Calculate accurate session duration
- Handle edge cases:
  - Server disconnects
  - User disconnects
  - Channel deletions
  - Server restarts

### Event Integration
- Check if session is within event timeframe
- Verify user has required event roles
- Link session to event if conditions met
- Track event participation statistics

## Technical Implementation

### Database Schema
```javascript
const sessionSchema = new Schema({
  userId: { type: String, required: true },
  guildId: { type: String, required: true },
  channelId: { type: String, required: true },
  joinTime: { type: Date, required: true },
  leaveTime: Date,
  duration: Number, // in seconds
  isEventLinked: { type: Boolean, default: false },
  eventId: String,
  status: {
    type: String,
    enum: ['active', 'completed', 'cancelled'],
    default: 'active'
  },
  relatedSessions: [{
    sessionId: String,
    channelId: String,
    joinTime: Date,
    leaveTime: Date,
    duration: Number
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Indexes for efficient querying
sessionSchema.index({ userId: 1, guildId: 1 });
sessionSchema.index({ guildId: 1, joinTime: 1 });
sessionSchema.index({ eventId: 1 });
```

### Event Handlers

#### Voice State Update Handler
```javascript
async function handleVoiceStateUpdate(oldState, newState) {
  // User joined a VC
  if (!oldState.channelId && newState.channelId) {
    // Check if this is a new VC creation
    const isNewVC = await checkIfNewVC(newState.channelId);
    
    if (isNewVC) {
      // Handle new VC creation case
      await handleNewVCCreation(newState);
    } else {
      // Normal VC join
      await createSession(newState);
    }
  }
  
  // User left a VC
  if (oldState.channelId && !newState.channelId) {
    await updateSession(oldState);
  }
  
  // User moved between VCs
  if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
    await handleChannelMove(oldState, newState);
  }
}
```

### Session Management Functions

#### Create Session
```javascript
async function createSession(voiceState) {
  const session = new Session({
    userId: voiceState.member.id,
    guildId: voiceState.guild.id,
    channelId: voiceState.channelId,
    joinTime: new Date(),
    status: 'active'
  });

  // Check for event linkage
  const eventLink = await checkEventLinkage(voiceState);
  if (eventLink) {
    session.isEventLinked = true;
    session.eventId = eventLink.eventId;
  }

  await session.save();
  return session;
}
```

#### Update Session
```javascript
async function updateSession(voiceState) {
  const session = await Session.findOne({
    userId: voiceState.member.id,
    guildId: voiceState.guild.id,
    status: 'active'
  });

  if (!session) return;

  const leaveTime = new Date();
  const duration = Math.floor((leaveTime - session.joinTime) / 1000);

  // Only update if session was longer than 1 second
  if (duration >= 1) {
    session.leaveTime = leaveTime;
    session.duration = duration;
    session.status = 'completed';
    await session.save();
  } else {
    // Delete micro-sessions
    await session.delete();
  }
}
```

#### Handle Channel Move
```javascript
async function handleChannelMove(oldState, newState) {
  const session = await Session.findOne({
    userId: oldState.member.id,
    guildId: oldState.guild.id,
    status: 'active'
  });

  if (!session) return;

  // Update current session
  session.leaveTime = new Date();
  session.duration = Math.floor((session.leaveTime - session.joinTime) / 1000);
  session.status = 'completed';
  
  // Add to related sessions
  session.relatedSessions.push({
    sessionId: session._id,
    channelId: oldState.channelId,
    joinTime: session.joinTime,
    leaveTime: session.leaveTime,
    duration: session.duration
  });

  await session.save();

  // Create new session for new channel
  await createSession(newState);
}
```

## Acceptance Criteria
- [ ] Sessions are created when users join VCs
- [ ] Sessions are updated when users leave VCs
- [ ] Micro-sessions (< 1 second) are handled appropriately
- [ ] Event-linked sessions are properly tracked
- [ ] Channel moves are handled correctly
- [ ] Session durations are calculated accurately
- [ ] Related sessions are linked properly
- [ ] Edge cases are handled gracefully
- [ ] Database queries are optimized
- [ ] Error handling is implemented

## Edge Cases to Handle
1. Server disconnects during session
2. User disconnects unexpectedly
3. Channel is deleted during session
4. Server restarts during session
5. User is moved between VCs rapidly
6. Multiple VC creations in quick succession
7. Event times change during session
8. User roles change during session

## Labels
- feature
- voice-channels
- session-tracking
- high-priority

## Priority
High - This is a core feature for tracking user participation in voice channels and events. 