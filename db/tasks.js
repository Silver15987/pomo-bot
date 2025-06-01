const { connectToDatabase } = require('./init');

async function saveTask(userId, task, durationMinutes, eventLinked, teamRole) {
    const db = await connectToDatabase();
    const tasks = db.collection('tasks');

    const result = await tasks.insertOne({
        userId,
        task,
        durationMinutes,
        startTime: new Date(),
        endTime: null,
        actualDuration: 0,
        lastVCState: true,
        completed: false,
        abandoned: false,
        interrupted: false,
        eventLinked,
        teamRole
    });

    console.log(`DEBUG — task saved for ${userId}:`, result.insertedId);
}

async function updateTaskDuration(userId, actualDuration) {
    const db = await connectToDatabase();
    const tasks = db.collection('tasks');

    await tasks.updateOne(
        { userId, completed: false, abandoned: false },
        { 
            $set: { 
                endTime: new Date(),
                actualDuration: actualDuration,
                interrupted: true
            }
        }
    );
}

async function markTaskComplete(userId) {
    const db = await connectToDatabase();
    const tasks = db.collection('tasks');

    // First get the task to calculate duration
    const task = await tasks.findOne({ userId, completed: false, abandoned: false });
    if (!task) return;

    const endTime = new Date();
    const startTime = task.startTime;
    const durationMs = endTime - startTime;
    const actualDuration = Math.floor(durationMs / (1000 * 60)); // Convert to minutes

    await tasks.updateOne(
        { userId, completed: false, abandoned: false },
        { 
            $set: { 
                completed: true,
                endTime: endTime,
                actualDuration: actualDuration
            }
        }
    );
}

async function abandonTask(userId) {
    const db = await connectToDatabase();
    const tasks = db.collection('tasks');

    // First get the task to calculate duration
    const task = await tasks.findOne({ userId, completed: false, abandoned: false });
    if (!task) return;

    const endTime = new Date();
    const startTime = task.startTime;
    const durationMs = endTime - startTime;
    const actualDuration = Math.floor(durationMs / (1000 * 60)); // Convert to minutes

    await tasks.updateOne(
        { userId, completed: false, abandoned: false },
        { 
            $set: { 
                abandoned: true,
                endTime: endTime,
                actualDuration: actualDuration
            }
        }
    );
}

async function resumeInterruptedTask(userId) {
    const db = await connectToDatabase();
    const tasks = db.collection('tasks');

    await tasks.updateOne(
        { userId, interrupted: true, completed: false, abandoned: false },
        { 
            $set: { 
                startTime: new Date(),
                interrupted: false,
                lastVCState: true
            }
        }
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

async function getInterruptedTasks(userId) {
    const db = await connectToDatabase();
    const tasks = db.collection('tasks');

    return await tasks.find({
        userId,
        interrupted: true,
        completed: false,
        abandoned: false
    }).toArray();
}

module.exports = {
    saveTask,
    markTaskComplete,
    abandonTask,
    extendTaskDuration,
    getUserActiveTask,
    updateTaskDuration,
    resumeInterruptedTask,
    getInterruptedTasks
};
