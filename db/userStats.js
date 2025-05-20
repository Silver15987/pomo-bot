const { connectToDatabase } = require('./init');

async function getOrCreateUserStats(userId) {
    const db = await connectToDatabase();
    const stats = db.collection('user_stats');

    let user = await stats.findOne({ userId });
    if (!user) {
        await stats.insertOne({
            userId,
            totalVcMinutes: 0,
            eventMinutes: 0,
            completedTaskMinutes: 0,
            completedTasksEventMinutes: 0
        });
    }
    return stats;
}

async function updateUserStats(userId, minutes, completed, isEvent) {
    const stats = await getOrCreateUserStats(userId);

    const update = {
        $inc: {
            totalVcMinutes: minutes,
            eventMinutes: isEvent ? minutes : 0,
            completedTaskMinutes: completed ? minutes : 0,
            completedTasksEventMinutes: (completed && isEvent) ? minutes : 0
        }
    };

    await stats.updateOne({ userId }, update);
}

async function resetEventTime() {
    const db = await connectToDatabase();
    await db.collection('user_stats').updateMany({}, {
        $set: {
            eventMinutes: 0,
            completedTasksEventMinutes: 0
        }
    });
}

module.exports = { getOrCreateUserStats, updateUserStats, resetEventTime };
