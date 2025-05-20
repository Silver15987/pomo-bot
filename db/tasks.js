const { connectToDatabase } = require('./init');

async function saveTask(userId, task, durationMinutes, eventLinked, teamRole) {
    const db = await connectToDatabase();
    const tasks = db.collection('tasks');

    const result = await tasks.insertOne({
        userId,
        task,
        durationMinutes,
        startTime: new Date(),
        completed: false,
        abandoned: false,
        eventLinked,
        teamRole
    });

    console.log(`DEBUG — task saved for ${userId}:`, result.insertedId);
}


async function markTaskComplete(userId) {
    const db = await connectToDatabase();
    const tasks = db.collection('tasks');

    await tasks.updateOne(
        { userId, completed: false, abandoned: false },
        { $set: { completed: true } }
    );
}

async function abandonTask(userId) {
    const db = await connectToDatabase();
    const tasks = db.collection('tasks');

    await tasks.updateOne(
        { userId, completed: false, abandoned: false },
        { $set: { abandoned: true } }
    );
}

async function extendTaskDuration(userId, extraMinutes) {
    const db = await connectToDatabase();
    const tasks = db.collection('tasks');

    await tasks.updateOne(
        { userId, completed: false, abandoned: false },
        { $inc: { durationMinutes: extraMinutes } }
    );
}

async function getUserActiveTask(userId) {
    const db = await connectToDatabase();
    const tasks = db.collection('tasks');

    return await tasks.findOne({
        userId,
        completed: false,
        abandoned: false
    });
}

module.exports = {
    saveTask,
    markTaskComplete,
    abandonTask,
    extendTaskDuration,
    getUserActiveTask
};
