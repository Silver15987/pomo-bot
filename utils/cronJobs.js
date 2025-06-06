import cron from 'node-cron';
import { Event } from '../db/event.js';
import { UserStats } from '../db/userStats.js';

// Monitoring stats
const cronStats = {
  lastRun: null,
  lastError: null,
  totalRuns: 0,
  successfulRuns: 0,
  failedRuns: 0,
  averageExecutionTime: 0
};

const calculateDailyChange = (currentStats, previousStats) => {
  if (!previousStats) return 0;
  const previousTeam = previousStats.find(t => t.roleId === currentStats._id);
  return previousTeam ? currentStats.totalTime - previousTeam.totalTime : 0;
};

const updateEventStats = async () => {
  const startTime = Date.now();
  cronStats.lastRun = new Date();
  cronStats.totalRuns++;

  try {
    console.log('🔄 Starting event stats update...');
    
    // Get all active events
    const activeEvents = await Event.find({
      status: 'active',
      endDate: { $gt: new Date() }
    });

    console.log(`📊 Found ${activeEvents.length} active events to update`);

    for (const event of activeEvents) {
      try {
        console.log(`\n📈 Updating stats for event: ${event.name}`);
        
        // Get current team stats for comparison
        const previousStats = [...event.teamStats];
        
        // Calculate new stats
        const teamStats = await UserStats.aggregate([
          {
            $match: {
              currentEventRole: { $in: event.targetRoles }
            }
          },
          {
            $group: {
              _id: '$currentEventRole',
              totalTime: { $sum: '$eventStudyTime' },
              memberCount: { $count: {} },
              members: {
                $push: {
                  userId: '$userId',
                  username: '$username',
                  totalTime: '$eventStudyTime',
                  sessions: '$totalSessions'
                }
              }
            }
          }
        ]);

        // Update event with new stats
        event.teamStats = teamStats.map(team => ({
          roleId: team._id,
          totalTime: team.totalTime,
          memberCount: team.memberCount,
          dailyChange: calculateDailyChange(team, previousStats),
          lastUpdated: new Date(),
          topMembers: team.members
            .sort((a, b) => b.totalTime - a.totalTime)
            .slice(0, 3)
        }));

        event.lastUpdated = new Date();
        await event.save();

        console.log(`✅ Successfully updated ${event.name}`);
      } catch (eventError) {
        console.error(`❌ Error updating event ${event.name}:`, eventError);
        // Continue with next event even if one fails
      }
    }

    // Update monitoring stats
    const executionTime = Date.now() - startTime;
    cronStats.successfulRuns++;
    cronStats.averageExecutionTime = 
      (cronStats.averageExecutionTime * (cronStats.successfulRuns - 1) + executionTime) 
      / cronStats.successfulRuns;

    console.log('\n📊 Update completed successfully');
    console.log(`⏱️ Execution time: ${executionTime}ms`);
    console.log(`📈 Updated ${activeEvents.length} events`);

  } catch (error) {
    cronStats.failedRuns++;
    cronStats.lastError = {
      message: error.message,
      timestamp: new Date()
    };
    console.error('❌ Error in event stats update:', error);
  }
};

// Admin command to view cronjob status
export const getCronStatus = () => {
  return {
    lastRun: cronStats.lastRun,
    lastError: cronStats.lastError,
    totalRuns: cronStats.totalRuns,
    successfulRuns: cronStats.successfulRuns,
    failedRuns: cronStats.failedRuns,
    averageExecutionTime: cronStats.averageExecutionTime,
    uptime: cronStats.lastRun ? 
      Math.floor((Date.now() - cronStats.lastRun.getTime()) / 1000) : null
  };
};

// Start the cronjob
export const startEventStatsCron = () => {
  // Run every 15 minutes
  cron.schedule('*/15 * * * *', updateEventStats);
  console.log('⏰ Event stats update job scheduled (running every 15 minutes)');
  
  // Run initial update
  updateEventStats();
}; 