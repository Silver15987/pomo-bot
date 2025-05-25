const { pendingTasks } = require('../sessionState');

class TimeoutManager {
    static clearUserTimeout(userId) {
        const entry = pendingTasks.get(userId);
        if (entry?.timeout) {
            console.log(`[DEBUG] Clearing timeout for user ${userId}`);
            clearTimeout(entry.timeout);
            return true;
        }
        return false;
    }

    static setUserTimeout(userId, timeout, message) {
        // Clear any existing timeout first
        this.clearUserTimeout(userId);
        
        console.log(`[DEBUG] Setting new timeout for user ${userId}`);
        pendingTasks.set(userId, { timeout, message });
        return true;
    }

    static validateUserState(userId, guild) {
        if (!userId || !guild) {
            console.log(`[DEBUG] Invalid user state: userId=${userId}, guild=${guild?.id}`);
            return false;
        }

        return true;
    }

    static async validateVoiceState(userId, guild) {
        if (!this.validateUserState(userId, guild)) {
            return false;
        }

        try {
            const member = await guild.members.fetch(userId);
            if (!member?.voice?.channelId) {
                console.log(`[DEBUG] User ${userId} not in voice channel`);
                return false;
            }
            return true;
        } catch (err) {
            console.error(`[DEBUG] Error validating voice state for ${userId}:`, err.message);
            return false;
        }
    }
}

module.exports = TimeoutManager; 