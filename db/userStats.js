const { connectToDatabase } = require('./init');
const { ObjectId } = require('mongodb');
const { logger } = require('../utils/logger');

async function getOrCreateUserStats(userId, username, avatarUrl) {
    const db = await connectToDatabase();
    const stats = db.collection('user_stats');

    let user = await stats.findOne({ _id: userId });
    if (!user) {
        const now = new Date();
        user = {
            _id: userId,
            username,
            avatar_url: avatarUrl,
            total_study_minutes: 0,
            total_event_minutes: 0,
            total_tasks: 0,
            completed_tasks: 0,
            abandoned_tasks: 0,
            completion_percentage: 0,
            current_streak_days: 0,
            longest_streak_days: 0,
            last_study_date: null,
            study_days: [], // Array of { date: "YYYY-MM-DD", minutes: number }
            created_at: now,
            updated_at: now
        };
        await stats.insertOne(user);
    }
    return stats;
}

async function updateUserStats(userId, minutes, completed, isEvent, username, avatarUrl) {
    if (!userId || typeof minutes !== 'number' || minutes < 0) {
        throw new Error('Invalid input parameters');
    }

    const stats = await getOrCreateUserStats(userId, username, avatarUrl);
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    // First, update the study days array
    await stats.updateOne(
        { _id: userId },
        [
            {
                $set: {
                    study_days: {
                        $cond: {
                            if: {
                                $gt: [{
                                    $size: {
                                        $filter: {
                                            input: "$study_days",
                                            as: "day",
                                            cond: { $eq: ["$$day.date", today] }
                                        }
                                    }
                                }, 0]
                            },
                            then: {
                                $map: {
                                    input: "$study_days",
                                    as: "day",
                                    in: {
                                        $cond: {
                                            if: { $eq: ["$$day.date", today] },
                                            then: {
                                                date: "$$day.date",
                                                minutes: { $add: ["$$day.minutes", minutes] }
                                            },
                                            else: "$$day"
                                        }
                                    }
                                }
                            },
                            else: {
                                $concatArrays: [
                                    "$study_days",
                                    [{ date: today, minutes: minutes }]
                                ]
                            }
                        }
                    }
                }
            }
        ]
    );

    const update = {
        $inc: {
            total_study_minutes: minutes,
            total_event_minutes: isEvent ? minutes : 0,
            total_tasks: 1,
            completed_tasks: completed ? 1 : 0,
            abandoned_tasks: !completed ? 1 : 0
        },
        $set: {
            updated_at: now,
            username,
            avatar_url: avatarUrl
        }
    };

    await stats.updateOne({ _id: userId }, update);

    // Update completion percentage
    await stats.updateOne(
        { _id: userId },
        [
            {
                $set: {
                    completion_percentage: {
                        $multiply: [
                            { $divide: ["$completed_tasks", { $max: ["$total_tasks", 1] }] },
                            100
                        ]
                    }
                }
            }
        ]
    );

    // Update streaks
    await updateStreaks(userId, stats);
}

async function updateStreaks(userId, stats) {
    const user = await stats.findOne({ _id: userId });
    if (!user || !user.study_days.length) return;

    // Sort study days by date
    const studyDays = user.study_days.sort((a, b) => a.date.localeCompare(b.date));
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    let currentStreak = 0;
    let longestStreak = user.longest_streak_days || 0;
    let lastStudyDate = user.last_study_date;

    // Check if user already has a streak for today
    const hasStudiedToday = studyDays.some(day => day.date === today);
    const hasStudiedYesterday = studyDays.some(day => day.date === yesterdayStr);

    // If last study was today or yesterday, continue streak
    if (lastStudyDate === today || lastStudyDate === yesterdayStr) {
        currentStreak = user.current_streak_days || 0;
        if (hasStudiedToday && !user.current_streak_days) {
            currentStreak++;
        }
    } else {
        // Reset streak if gap is more than 1 day
        currentStreak = hasStudiedToday ? 1 : 0;
    }

    // Update longest streak if current streak is longer
    if (currentStreak > longestStreak) {
        longestStreak = currentStreak;
    }

    await stats.updateOne(
        { _id: userId },
        {
            $set: {
                current_streak_days: currentStreak,
                longest_streak_days: longestStreak,
                last_study_date: today
            }
        }
    );
}

async function getStudyDays(userId, startDate, endDate) {
    if (!userId || !startDate || !endDate) {
        throw new Error('Missing required parameters');
    }

    try {
        const start = new Date(startDate);
        const end = new Date(endDate);

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            throw new Error('Invalid date format');
        }

        const db = await connectToDatabase();
        const user = await db.collection('user_stats').findOne(
            { _id: userId },
            { projection: { study_days: 1 } }
        );

        if (!user || !user.study_days) return [];

        return user.study_days
            .filter(day => {
                const date = new Date(day.date);
                return date >= start && date <= end;
            })
            .sort((a, b) => a.date.localeCompare(b.date));
    } catch (error) {
        console.error('Error in getStudyDays:', error);
        throw error;
    }
}

async function getStreakInfo(userId) {
    if (!userId) {
        throw new Error('Missing userId parameter');
    }

    try {
        const db = await connectToDatabase();
        const user = await db.collection('user_stats').findOne(
            { _id: userId },
            { projection: { current_streak_days: 1, longest_streak_days: 1, last_study_date: 1 } }
        );

        if (!user) return null;

        return {
            currentStreak: user.current_streak_days,
            longestStreak: user.longest_streak_days,
            lastStudyDate: user.last_study_date
        };
    } catch (error) {
        console.error('Error in getStreakInfo:', error);
        throw error;
    }
}

async function resetEventTime() {
    const db = await connectToDatabase();
    await db.collection('user_stats').updateMany({}, {
        $set: {
            total_event_minutes: 0
        }
    });
}

async function getUserStats(userId) {
    if (!userId) {
        logger.logError(new Error('Missing userId parameter'), {
            action: 'getUserStats',
            userId: null,
            userIdType: 'null'
        });
        throw new Error('Missing userId parameter');
    }

    try {
        logger.logSystem('Connecting to database', {
            userId,
            userIdType: typeof userId
        });

        const db = await connectToDatabase();
        
        logger.logSystem('Database connected, querying user stats', {
            userId,
            userIdType: typeof userId,
            collection: 'user_stats'
        });

        // Convert userId to string to match how it's stored
        const userStats = await db.collection('user_stats').findOne({ _id: userId.toString() });
        
        logger.logSystem('Database query completed', {
            userId,
            userIdType: typeof userId,
            statsFound: !!userStats,
            queryResult: userStats ? {
                _id: userStats._id,
                username: userStats.username,
                total_study_minutes: userStats.total_study_minutes,
                total_event_minutes: userStats.total_event_minutes,
                total_tasks: userStats.total_tasks,
                completed_tasks: userStats.completed_tasks,
                abandoned_tasks: userStats.abandoned_tasks,
                completion_percentage: userStats.completion_percentage,
                current_streak_days: userStats.current_streak_days,
                longest_streak_days: userStats.longest_streak_days,
                study_days_count: userStats.study_days?.length || 0
            } : null
        });
        
        if (!userStats) {
            logger.logSystem('No stats found for user', {
                userId,
                userIdType: typeof userId,
                query: { _id: userId.toString() }
            });
            return null;
        }

        logger.logSystem('Successfully retrieved user stats', {
            userId,
            statsFound: true,
            stats: {
                _id: userStats._id,
                username: userStats.username,
                total_study_minutes: userStats.total_study_minutes,
                total_event_minutes: userStats.total_event_minutes,
                total_tasks: userStats.total_tasks,
                completed_tasks: userStats.completed_tasks,
                abandoned_tasks: userStats.abandoned_tasks,
                completion_percentage: userStats.completion_percentage,
                current_streak_days: userStats.current_streak_days,
                longest_streak_days: userStats.longest_streak_days,
                study_days_count: userStats.study_days?.length || 0
            }
        });

        return userStats;
    } catch (error) {
        logger.logError(error, {
            action: 'getUserStats',
            userId,
            userIdType: typeof userId,
            error: {
                name: error.name,
                message: error.message,
                stack: error.stack
            }
        });
        throw error;
    }
}

async function getLeaderboard(limit = 10) {
    if (typeof limit !== 'number' || limit < 1) {
        throw new Error('Invalid limit parameter');
    }

    const db = await connectToDatabase();
    return await db.collection('user_stats')
        .find({})
        .sort({ total_study_minutes: -1 })
        .limit(limit)
        .toArray();
}

module.exports = {
    getOrCreateUserStats,
    updateUserStats,
    resetEventTime,
    getUserStats,
    getLeaderboard,
    getStudyDays,
    getStreakInfo
};
