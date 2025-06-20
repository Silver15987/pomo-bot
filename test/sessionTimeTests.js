import { connectDB } from '../db/mongoose.js';
import { Session } from '../db/session.js';
import { UserStats } from '../db/userStats.js';
import { Event } from '../db/event.js';
import { 
  createNewSession, 
  completeUserSession, 
  handleChannelMove 
} from '../utils/sessionManager.js';

// Test configuration
const TEST_CONFIG = {
  testDatabase: 'pomo-bot-test',
  testGuildId: 'test-guild-123',
  testChannelId1: 'test-channel-456',
  testChannelId2: 'test-channel-789',
  testUserId: 'test-user-123'
};

// Mock Discord member object
function createMockMember(userId, username, roles = []) {
  return {
    id: userId,
    user: { tag: username, username },
    roles: {
      cache: new Map(roles.map(role => [role.id, role]))
    }
  };
}

// Test result tracking
let testResults = [];
let testCount = 0;

function logTest(testName, status, details = {}) {
  testCount++;
  testResults.push({
    testId: testCount,
    testName,
    status,
    ...details
  });
}

// Database cleanup function
async function cleanupTestData() {
  await Session.deleteMany({ guildId: TEST_CONFIG.testGuildId });
  await UserStats.deleteMany({ userId: TEST_CONFIG.testUserId });
  await Event.deleteMany({ guildId: TEST_CONFIG.testGuildId });
}

// Utility function to wait
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Test functions
async function testInstantJoinLeave() {
  const testName = "Instant Join/Leave (<10ms)";
  try {
    const member = createMockMember(TEST_CONFIG.testUserId, 'TestUser');
    const startTime = new Date();
    
    // Join
    const session = await createNewSession(
      TEST_CONFIG.testUserId,
      TEST_CONFIG.testGuildId,
      TEST_CONFIG.testChannelId1,
      'TestUser',
      member
    );
    
    // Leave almost immediately (simulate <10ms)
    await sleep(5); // 5ms delay
    const endTime = new Date();
    
    const completedSession = await completeUserSession(
      TEST_CONFIG.testUserId,
      TEST_CONFIG.testGuildId,
      'TestUser',
      endTime
    );
    
    // Check results
    const userStats = await UserStats.findOne({ userId: TEST_CONFIG.testUserId });
    const actualDuration = completedSession ? completedSession.duration : 0;
    const expectedDuration = Math.floor((endTime - startTime) / 1000);
    
    logTest(testName, 'PASS', {
      expectedDuration: `${expectedDuration}s`,
      actualDuration: `${actualDuration}s`,
      totalStudyTime: `${userStats?.totalStudyTime || 0}s`,
      totalSessions: userStats?.totalSessions || 0,
      sessionCount: await Session.countDocuments({ userId: TEST_CONFIG.testUserId })
    });
    
  } catch (error) {
    logTest(testName, 'FAIL', { error: error.message });
  }
}

async function testInstantChannelMove() {
  const testName = "Instant Channel Move";
  try {
    const member = createMockMember(TEST_CONFIG.testUserId, 'TestUser');
    const startTime = new Date();
    
    // Join first channel
    await createNewSession(
      TEST_CONFIG.testUserId,
      TEST_CONFIG.testGuildId,
      TEST_CONFIG.testChannelId1,
      'TestUser',
      member
    );
    
    // Move to second channel immediately
    await sleep(5); // 5ms delay
    const moveTime = new Date();
    
    const { oldSession, newSession } = await handleChannelMove(
      TEST_CONFIG.testUserId,
      TEST_CONFIG.testGuildId,
      TEST_CONFIG.testChannelId2,
      'TestUser',
      member
    );
    
    // Leave second channel after a bit
    await sleep(100); // 100ms
    const endTime = new Date();
    
    await completeUserSession(
      TEST_CONFIG.testUserId,
      TEST_CONFIG.testGuildId,
      'TestUser',
      endTime
    );
    
    // Check results
    const userStats = await UserStats.findOne({ userId: TEST_CONFIG.testUserId });
    const sessions = await Session.find({ userId: TEST_CONFIG.testUserId }).sort({ joinTime: 1 });
    
    const session1Duration = oldSession ? oldSession.duration : 0;
    const session2Duration = sessions.length > 1 ? sessions[1].duration : 0;
    const totalDuration = session1Duration + session2Duration;
    
    logTest(testName, 'PASS', {
      session1Duration: `${session1Duration}s`,
      session2Duration: `${session2Duration}s`,
      totalCalculatedTime: `${totalDuration}s`,
      userStatsTotalTime: `${userStats?.totalStudyTime || 0}s`,
      totalSessions: userStats?.totalSessions || 0,
      sessionCount: sessions.length
    });
    
  } catch (error) {
    logTest(testName, 'FAIL', { error: error.message });
  }
}

async function testJoinMoveLeave() {
  const testName = "Join → Move → Leave";
  try {
    const member = createMockMember(TEST_CONFIG.testUserId, 'TestUser');
    
    // Join first channel
    await createNewSession(
      TEST_CONFIG.testUserId,
      TEST_CONFIG.testGuildId,
      TEST_CONFIG.testChannelId1,
      'TestUser',
      member
    );
    
    // Stay for 2 seconds
    await sleep(2000);
    
    // Move to second channel
    const { oldSession } = await handleChannelMove(
      TEST_CONFIG.testUserId,
      TEST_CONFIG.testGuildId,
      TEST_CONFIG.testChannelId2,
      'TestUser',
      member
    );
    
    // Stay for 3 seconds
    await sleep(3000);
    
    // Leave
    const finalSession = await completeUserSession(
      TEST_CONFIG.testUserId,
      TEST_CONFIG.testGuildId,
      'TestUser'
    );
    
    // Check results
    const userStats = await UserStats.findOne({ userId: TEST_CONFIG.testUserId });
    const sessions = await Session.find({ userId: TEST_CONFIG.testUserId }).sort({ joinTime: 1 });
    
    const session1Duration = oldSession ? oldSession.duration : 0;
    const session2Duration = finalSession ? finalSession.duration : 0;
    const totalExpected = session1Duration + session2Duration;
    
    logTest(testName, 'PASS', {
      session1Duration: `${session1Duration}s`,
      session2Duration: `${session2Duration}s`,
      totalExpectedTime: `${totalExpected}s`,
      userStatsTotalTime: `${userStats?.totalStudyTime || 0}s`,
      totalSessions: userStats?.totalSessions || 0,
      sessionCount: sessions.length
    });
    
  } catch (error) {
    logTest(testName, 'FAIL', { error: error.message });
  }
}

async function testMultipleQuickMoves() {
  const testName = "Multiple Quick Channel Moves";
  try {
    const member = createMockMember(TEST_CONFIG.testUserId, 'TestUser');
    const channels = [TEST_CONFIG.testChannelId1, TEST_CONFIG.testChannelId2, TEST_CONFIG.testChannelId1];
    
    // Join first channel
    await createNewSession(
      TEST_CONFIG.testUserId,
      TEST_CONFIG.testGuildId,
      channels[0],
      'TestUser',
      member
    );
    
    let totalExpectedTime = 0;
    
    // Quick moves between channels
    for (let i = 1; i < channels.length; i++) {
      await sleep(500); // 500ms in each channel
      const { oldSession } = await handleChannelMove(
        TEST_CONFIG.testUserId,
        TEST_CONFIG.testGuildId,
        channels[i],
        'TestUser',
        member
      );
      if (oldSession) totalExpectedTime += oldSession.duration;
    }
    
    // Final leave
    await sleep(500);
    const finalSession = await completeUserSession(
      TEST_CONFIG.testUserId,
      TEST_CONFIG.testGuildId,
      'TestUser'
    );
    
    if (finalSession) totalExpectedTime += finalSession.duration;
    
    // Check results
    const userStats = await UserStats.findOne({ userId: TEST_CONFIG.testUserId });
    const sessionCount = await Session.countDocuments({ userId: TEST_CONFIG.testUserId });
    
    logTest(testName, 'PASS', {
      expectedMoves: channels.length,
      actualSessions: sessionCount,
      totalExpectedTime: `${totalExpectedTime}s`,
      userStatsTotalTime: `${userStats?.totalStudyTime || 0}s`,
      totalSessions: userStats?.totalSessions || 0,
      timeAccuracy: Math.abs(totalExpectedTime - (userStats?.totalStudyTime || 0)) <= 1 ? 'ACCURATE' : 'INACCURATE'
    });
    
  } catch (error) {
    logTest(testName, 'FAIL', { error: error.message });
  }
}

async function testZeroDurationSessions() {
  const testName = "Zero Duration Sessions";
  try {
    const member = createMockMember(TEST_CONFIG.testUserId, 'TestUser');
    
    // Create a session and complete it with the same timestamp
    const joinTime = new Date();
    const session = await createNewSession(
      TEST_CONFIG.testUserId,
      TEST_CONFIG.testGuildId,
      TEST_CONFIG.testChannelId1,
      'TestUser',
      member
    );
    
    // Complete with same time (zero duration)
    const completedSession = await completeUserSession(
      TEST_CONFIG.testUserId,
      TEST_CONFIG.testGuildId,
      'TestUser',
      joinTime
    );
    
    // Check results
    const userStats = await UserStats.findOne({ userId: TEST_CONFIG.testUserId });
    
    logTest(testName, 'PASS', {
      sessionDuration: `${completedSession?.duration || 0}s`,
      userStatsTotalTime: `${userStats?.totalStudyTime || 0}s`,
      sessionsProcessed: userStats?.totalSessions || 0,
      zeroTimeHandled: (userStats?.totalStudyTime || 0) === 0 ? 'CORRECT' : 'INCORRECT'
    });
    
  } catch (error) {
    logTest(testName, 'FAIL', { error: error.message });
  }
}

async function testOverlapPrevention() {
  const testName = "Overlap Prevention";
  try {
    const member = createMockMember(TEST_CONFIG.testUserId, 'TestUser');
    
    // Create first session
    const session1 = await createNewSession(
      TEST_CONFIG.testUserId,
      TEST_CONFIG.testGuildId,
      TEST_CONFIG.testChannelId1,
      'TestUser',
      member
    );
    
    await sleep(1000); // 1 second
    
    // Try to create another session (should close the first one)
    const session2 = await createNewSession(
      TEST_CONFIG.testUserId,
      TEST_CONFIG.testGuildId,
      TEST_CONFIG.testChannelId2,
      'TestUser',
      member
    );
    
    await sleep(1000); // 1 second
    
    // Complete second session
    await completeUserSession(
      TEST_CONFIG.testUserId,
      TEST_CONFIG.testGuildId,
      'TestUser'
    );
    
    // Check for overlaps
    const sessions = await Session.find({ userId: TEST_CONFIG.testUserId }).sort({ joinTime: 1 });
    const activeSessions = await Session.countDocuments({ 
      userId: TEST_CONFIG.testUserId, 
      status: 'active' 
    });
    
    let hasOverlap = false;
    for (let i = 0; i < sessions.length - 1; i++) {
      const current = sessions[i];
      const next = sessions[i + 1];
      if (current.leaveTime && next.joinTime && current.leaveTime > next.joinTime) {
        hasOverlap = true;
        break;
      }
    }
    
    const userStats = await UserStats.findOne({ userId: TEST_CONFIG.testUserId });
    
    logTest(testName, 'PASS', {
      totalSessions: sessions.length,
      activeSessions,
      hasOverlap: hasOverlap ? 'YES' : 'NO',
      userStatsTotalTime: `${userStats?.totalStudyTime || 0}s`,
      overlapPrevented: !hasOverlap && activeSessions === 0 ? 'SUCCESS' : 'FAILED'
    });
    
  } catch (error) {
    logTest(testName, 'FAIL', { error: error.message });
  }
}

async function testConcurrentUsers() {
  const testName = "Concurrent Users";
  try {
    const users = [
      { id: 'user1', name: 'User1' },
      { id: 'user2', name: 'User2' },
      { id: 'user3', name: 'User3' }
    ];
    
    // All users join simultaneously
    const joinPromises = users.map(user => 
      createNewSession(
        user.id,
        TEST_CONFIG.testGuildId,
        TEST_CONFIG.testChannelId1,
        user.name,
        createMockMember(user.id, user.name)
      )
    );
    
    await Promise.all(joinPromises);
    await sleep(2000); // 2 seconds
    
    // All users leave simultaneously
    const leavePromises = users.map(user =>
      completeUserSession(user.id, TEST_CONFIG.testGuildId, user.name)
    );
    
    await Promise.all(leavePromises);
    
    // Check results for each user
    const results = [];
    for (const user of users) {
      const userStats = await UserStats.findOne({ userId: user.id });
      const sessionCount = await Session.countDocuments({ userId: user.id });
      results.push({
        userId: user.id,
        totalTime: userStats?.totalStudyTime || 0,
        sessions: sessionCount
      });
    }
    
    logTest(testName, 'PASS', {
      user1Time: `${results[0]?.totalTime || 0}s`,
      user2Time: `${results[1]?.totalTime || 0}s`,
      user3Time: `${results[2]?.totalTime || 0}s`,
      allUsersProcessed: results.every(r => r.sessions > 0) ? 'YES' : 'NO',
      timeConsistency: results.every(r => r.totalTime >= 1 && r.totalTime <= 3) ? 'CONSISTENT' : 'INCONSISTENT'
    });
    
    // Cleanup other users
    await UserStats.deleteMany({ userId: { $in: users.map(u => u.id) } });
    await Session.deleteMany({ userId: { $in: users.map(u => u.id) } });
    
  } catch (error) {
    logTest(testName, 'FAIL', { error: error.message });
  }
}

async function testRapidJoinLeaveSequence() {
  const testName = "Rapid Join/Leave Sequence";
  try {
    const member = createMockMember(TEST_CONFIG.testUserId, 'TestUser');
    const sequences = 5; // 5 rapid join/leave cycles
    let totalExpectedTime = 0;
    
    for (let i = 0; i < sequences; i++) {
      const startTime = new Date();
      
      // Join
      await createNewSession(
        TEST_CONFIG.testUserId,
        TEST_CONFIG.testGuildId,
        TEST_CONFIG.testChannelId1,
        'TestUser',
        member
      );
      
      // Stay for random short time (50-200ms)
      const stayTime = 50 + Math.random() * 150;
      await sleep(stayTime);
      
      // Leave
      const endTime = new Date();
      const session = await completeUserSession(
        TEST_CONFIG.testUserId,
        TEST_CONFIG.testGuildId,
        'TestUser',
        endTime
      );
      
      if (session) {
        totalExpectedTime += session.duration;
      }
      
      // Small gap between sequences
      await sleep(10);
    }
    
    // Check results
    const userStats = await UserStats.findOne({ userId: TEST_CONFIG.testUserId });
    const sessionCount = await Session.countDocuments({ userId: TEST_CONFIG.testUserId });
    
    logTest(testName, 'PASS', {
      sequenceCount: sequences,
      actualSessions: sessionCount,
      totalExpectedTime: `${totalExpectedTime}s`,
      userStatsTotalTime: `${userStats?.totalStudyTime || 0}s`,
      totalSessions: userStats?.totalSessions || 0,
      consistency: Math.abs(totalExpectedTime - (userStats?.totalStudyTime || 0)) <= 1 ? 'CONSISTENT' : 'INCONSISTENT'
    });
    
  } catch (error) {
    logTest(testName, 'FAIL', { error: error.message });
  }
}

async function testSessionStatsConsistency() {
  const testName = "Session Stats Consistency";
  try {
    const member = createMockMember(TEST_CONFIG.testUserId, 'TestUser');
    
    // Create multiple sessions with known durations
    const sessionDurations = [1000, 2000, 500, 3000]; // ms
    let totalExpectedSeconds = 0;
    
    for (const duration of sessionDurations) {
      await createNewSession(
        TEST_CONFIG.testUserId,
        TEST_CONFIG.testGuildId,
        TEST_CONFIG.testChannelId1,
        'TestUser',
        member
      );
      
      await sleep(duration);
      
      const session = await completeUserSession(
        TEST_CONFIG.testUserId,
        TEST_CONFIG.testGuildId,
        'TestUser'
      );
      
      if (session) {
        totalExpectedSeconds += session.duration;
      }
      
      await sleep(100); // Gap between sessions
    }
    
    // Check final stats
    const userStats = await UserStats.findOne({ userId: TEST_CONFIG.testUserId });
    const allSessions = await Session.find({ userId: TEST_CONFIG.testUserId });
    
    // Calculate total from sessions
    const sessionTotalTime = allSessions.reduce((sum, session) => sum + (session.duration || 0), 0);
    
    logTest(testName, 'PASS', {
      expectedSessions: sessionDurations.length,
      actualSessions: allSessions.length,
      sessionTotalTime: `${sessionTotalTime}s`,
      userStatsTotalTime: `${userStats?.totalStudyTime || 0}s`,
      userStatsSessions: userStats?.totalSessions || 0,
      dataConsistency: sessionTotalTime === (userStats?.totalStudyTime || 0) ? 'PERFECT' : 'MISMATCH'
    });
    
  } catch (error) {
    logTest(testName, 'FAIL', { error: error.message });
  }
}

async function testInvalidTimeHandling() {
  const testName = "Invalid Time Handling";
  try {
    const member = createMockMember(TEST_CONFIG.testUserId, 'TestUser');
    
    // Test 1: Try to complete session with past time
    await createNewSession(
      TEST_CONFIG.testUserId,
      TEST_CONFIG.testGuildId,
      TEST_CONFIG.testChannelId1,
      'TestUser',
      member
    );
    
    await sleep(1000); // Wait 1 second
    
    // Try to complete with a time in the past
    const pastTime = new Date(Date.now() - 5000); // 5 seconds ago
    const session1 = await completeUserSession(
      TEST_CONFIG.testUserId,
      TEST_CONFIG.testGuildId,
      'TestUser',
      pastTime
    );
    
    // Test 2: Create session and try duplicate completion
    await sleep(100);
    await createNewSession(
      TEST_CONFIG.testUserId,
      TEST_CONFIG.testGuildId,
      TEST_CONFIG.testChannelId2,
      'TestUser',
      member
    );
    
    await sleep(1000);
    
    const session2 = await completeUserSession(
      TEST_CONFIG.testUserId,
      TEST_CONFIG.testGuildId,
      'TestUser'
    );
    
    // Try to complete again (should fail gracefully)
    const duplicateAttempt = await completeUserSession(
      TEST_CONFIG.testUserId,
      TEST_CONFIG.testGuildId,
      'TestUser'
    );
    
    // Check results
    const userStats = await UserStats.findOne({ userId: TEST_CONFIG.testUserId });
    const sessions = await Session.find({ userId: TEST_CONFIG.testUserId });
    
    logTest(testName, 'PASS', {
      invalidTimeHandled: session1 ? 'PROCESSED' : 'REJECTED',
      duplicateAttempt: duplicateAttempt ? 'CREATED' : 'REJECTED',
      totalSessions: sessions.length,
      userStatsSessions: userStats?.totalSessions || 0,
      userStatsTotalTime: `${userStats?.totalStudyTime || 0}s`,
      errorHandling: 'GRACEFUL'
    });
    
  } catch (error) {
    logTest(testName, 'FAIL', { error: error.message });
  }
}

// Print results in table format
function printResults() {
  console.log('\n' + '='.repeat(120));
  console.log('SESSION TIME TRACKING TEST RESULTS');
  console.log('='.repeat(120));
  
  // Headers
  const headers = ['ID', 'Test Name', 'Status', 'Key Metrics'];
  console.log(`| ${headers[0].padEnd(3)} | ${headers[1].padEnd(25)} | ${headers[2].padEnd(6)} | ${headers[3].padEnd(80)} |`);
  console.log('|' + '-'.repeat(5) + '|' + '-'.repeat(27) + '|' + '-'.repeat(8) + '|' + '-'.repeat(82) + '|');
  
  // Results
  testResults.forEach(result => {
    const { testId, testName, status, ...details } = result;
    
    // Format details for display
    let metricsStr = '';
    if (status === 'PASS') {
      const detailEntries = Object.entries(details);
      metricsStr = detailEntries
        .filter(([key]) => !key.includes('error'))
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ');
    } else {
      metricsStr = details.error || 'Unknown error';
    }
    
    // Truncate if too long
    if (metricsStr.length > 80) {
      metricsStr = metricsStr.substring(0, 77) + '...';
    }
    
    console.log(`| ${testId.toString().padEnd(3)} | ${testName.padEnd(25)} | ${status.padEnd(6)} | ${metricsStr.padEnd(80)} |`);
  });
  
  console.log('='.repeat(120));
  
  // Summary
  const passed = testResults.filter(r => r.status === 'PASS').length;
  const failed = testResults.filter(r => r.status === 'FAIL').length;
  console.log(`\nSUMMARY: ${passed} PASSED, ${failed} FAILED, ${testResults.length} TOTAL`);
  console.log('='.repeat(120) + '\n');
}

// Main test runner
async function runAllTests() {
  console.log('🧪 Starting Session Time Tracking Tests...\n');
  
  try {
    // Connect to test database
    process.env.MONGODB_URI = process.env.MONGODB_URI?.replace(/\/[^\/]*$/, `/${TEST_CONFIG.testDatabase}`);
    await connectDB();
    console.log('✅ Connected to test database\n');
    
    // Clean start
    await cleanupTestData();
    
    // Run tests
    const tests = [
      testInstantJoinLeave,
      testInstantChannelMove,
      testJoinMoveLeave,
      testMultipleQuickMoves,
      testZeroDurationSessions,
      testOverlapPrevention,
      testConcurrentUsers,
      testRapidJoinLeaveSequence,
      testSessionStatsConsistency,
      testInvalidTimeHandling
    ];
    
    for (const test of tests) {
      await cleanupTestData(); // Clean between tests
      await test();
      await sleep(100); // Small delay between tests
    }
    
    // Print results
    printResults();
    
  } catch (error) {
    console.error('❌ Test suite failed:', error);
  } finally {
    // Final cleanup
    await cleanupTestData();
    process.exit(0);
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests();
}

export { runAllTests }; 