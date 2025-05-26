const { connectToDatabase } = require('./init');

async function getOrCreateCurrentStats(userId, username) {
    const db = await connectToDatabase();
    const stats = db.collection('user_current_stats');

    let user = await stats.findOne({ userId });
    if (!user) {
        const result = await stats.insertOne({
            userId,
            username,
            totalVcHours: 0,
            eventVcHours: 0,
            team: {
                id: null,
                name: null
            },
            lastUpdated: new Date()
        });
        user = await stats.findOne({ _id: result.insertedId });
    }
    return user;
}

async function updateCurrentStats(userId, username, minutes, isEvent, teamRole = null) {
    const user = await getOrCreateCurrentStats(userId, username);
    const hours = minutes / 60;

    const update = {
        $inc: {
            totalVcHours: hours,
            eventVcHours: isEvent ? hours : 0
        },
        $set: {
            username,
            lastUpdated: new Date()
        }
    };

    if (teamRole !== null) {
        update.$set.team = teamRole;
    }

    const db = await connectToDatabase();
    const stats = db.collection('user_current_stats');
    await stats.updateOne({ userId }, update);
}

async function resetEventHours() {
    const db = await connectToDatabase();
    await db.collection('user_current_stats').updateMany({}, {
        $set: {
            eventVcHours: 0,
            lastUpdated: new Date()
        }
    });
}

async function getTopUsers(limit = 10) {
    const db = await connectToDatabase();
    const stats = db.collection('user_current_stats');
    // Fetch all users, sort in JS, and return the top N
    const users = await stats.find().toArray();
    return users
        .sort((a, b) => (b.eventVcHours || 0) - (a.eventVcHours || 0))
        .slice(0, limit);
}

module.exports = {
    getOrCreateCurrentStats,
    updateCurrentStats,
    resetEventHours,
    getTopUsers
}; 