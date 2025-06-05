# Event Overlap Validation

## Description
Currently, users can create multiple events that overlap in time, which can lead to scheduling conflicts and confusion. We need to implement validation to prevent overlapping events.

## Current Behavior
- Users can create multiple events with overlapping timeframes
- No validation is performed to check for existing events during the same period
- This can lead to double-booking and scheduling conflicts

## Expected Behavior
- When creating a new event, the system should check for any existing events that overlap with the proposed timeframe
- An event should be considered overlapping if:
  - It starts during an existing event
  - It ends during an existing event
  - It completely contains an existing event
  - It is completely contained within an existing event
- If an overlap is detected, the event creation should be prevented with a clear error message
- The error message should show details of the conflicting events

## Implementation Details
1. Add a method to the Event model to find overlapping events:
```javascript
static async findOverlappingEvents(guildId, startDate, endDate) {
  return this.find({
    guildId,
    $or: [
      // Event starts during an existing event
      { startDate: { $lt: endDate }, endDate: { $gt: startDate } },
      // Event ends during an existing event
      { startDate: { $lt: endDate }, endDate: { $gt: startDate } },
      // Event completely contains an existing event
      { startDate: { $lte: startDate }, endDate: { $gte: endDate } },
      // Event is completely contained within an existing event
      { startDate: { $gte: startDate }, endDate: { $lte: endDate } }
    ]
  });
}
```

2. Add validation in the event creation modal submission handler:
```javascript
const overlappingEvents = await Event.findOverlappingEvents(
  interaction.guildId,
  startDate,
  endDate
);

if (overlappingEvents.length > 0) {
  const eventList = overlappingEvents
    .map(e => `- ${e.name} (${e.startDate} to ${e.endDate})`)
    .join('\n');
  
  await interaction.reply({
    content: `❌ This event overlaps with existing events:\n${eventList}`,
    ephemeral: true
  });
  return;
}
```

## Acceptance Criteria
- [ ] Users cannot create events that overlap with existing events
- [ ] Clear error messages are shown when overlap is detected
- [ ] Error messages include details of conflicting events
- [ ] Validation works for all types of overlaps (start, end, complete, contained)
- [ ] Validation is performed server-side for security
- [ ] Error handling is graceful and user-friendly

## Additional Notes
- Consider adding a visual calendar view to help users see existing events
- May want to add an option for admins to override overlap validation in special cases
- Consider adding a "force create" option for events that must overlap (with appropriate warnings)

## Labels
- enhancement
- validation
- user-experience
- high-priority

## Priority
High - This is a critical feature for preventing scheduling conflicts and maintaining event integrity. 