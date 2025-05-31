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
    console.log(`[DEBUG] ====== UPDATING USER STATS ======`);
    console.log(`[DEBUG] User: ${username} (${userId})`);
    console.log(`[DEBUG] Minutes to add: ${minutes}`);
    console.log(`[DEBUG] Hours to add: ${(minutes / 60).toFixed(4)}`);
    console.log(`[DEBUG] Is event time: ${isEvent}`);
    
    const user = await getOrCreateCurrentStats(userId, username);
    const hours = minutes / 60;
    
    console.log(`[DEBUG] Current stats before update:`);
    console.log(`[DEBUG] - Total VC Hours: ${user.totalVcHours.toFixed(4)}`);
    console.log(`[DEBUG] - Event VC Hours: ${user.eventVcHours.toFixed(4)}`);

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

    console.log(`[DEBUG] Update operation:`);
    console.log(`[DEBUG] - Adding to total hours: ${hours.toFixed(4)}`);
    console.log(`[DEBUG] - Adding to event hours: ${(isEvent ? hours : 0).toFixed(4)}`);

    const db = await connectToDatabase();
    const stats = db.collection('user_current_stats');
    await stats.updateOne({ userId }, update);
    
    // Fetch and log the updated stats
    const updatedUser = await stats.findOne({ userId });
    console.log(`[DEBUG] Updated stats after change:`);
    console.log(`[DEBUG] - Total VC Hours: ${updatedUser.totalVcHours.toFixed(4)}`);
    console.log(`[DEBUG] - Event VC Hours: ${updatedUser.eventVcHours.toFixed(4)}`);
    console.log(`[DEBUG] - Hours added: ${hours.toFixed(4)}`);
    console.log(`[DEBUG] - Event hours added: ${(isEvent ? hours : 0).toFixed(4)}`);
    console.log(`[DEBUG] ====== END STATS UPDATE ======`);
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
    
    return await stats.aggregate([
        { $sort: { totalVcHours: -1 } },
        { $limit: limit }
    ]).toArray();
}

async function getTopEventUsers(limit = 10) {
    const db = await connectToDatabase();
    const stats = db.collection('user_current_stats');
    
    // If limit is provided, get top users by individual event hours
    if (limit) {
        return await stats.aggregate([
            { $sort: { eventVcHours: -1 } },
            { $limit: limit }
        ]).toArray();
    }
    
    // If no limit, get all users with event hours
    return await stats.find({ eventVcHours: { $gt: 0 } }).toArray();
}

module.exports = {
    getOrCreateCurrentStats,
    updateCurrentStats,
    resetEventHours,
    getTopUsers,
    getTopEventUsers
}; 