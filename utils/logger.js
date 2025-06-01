const fs = require('fs');
const path = require('path');
const { format } = require('util');

// Log types for categorization
const LOG_TYPES = {
    VC: 'voice_channel',
    TASK: 'task',
    MODAL: 'modal',
    ERROR: 'error',
    ROLE: 'role',
    STATS: 'stats',
    SYSTEM: 'system'
};

// Log levels
const LOG_LEVELS = {
    INFO: 'INFO',
    WARN: 'WARN',
    ERROR: 'ERROR',
    DEBUG: 'DEBUG'
};

class Logger {
    constructor() {
        this.logDir = path.join(process.cwd(), 'logs');
        this.ensureLogDirectory();
    }

    ensureLogDirectory() {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    getLogFilePath() {
        const today = new Date().toISOString().split('T')[0];
        return path.join(this.logDir, `${today}.log`);
    }

    formatLogEntry(type, level, message, data = {}) {
        const timestamp = new Date().toISOString();
        return JSON.stringify({
            timestamp,
            type,
            level,
            message,
            data
        }) + '\n';
    }

    log(type, level, message, data = {}) {
        const logEntry = this.formatLogEntry(type, level, message, data);
        const logFile = this.getLogFilePath();

        // Log to file
        fs.appendFileSync(logFile, logEntry);

        // Log to console
        console.log(`[${level}] ${type}: ${message}`, data);
    }

    // Voice Channel Logs
    logVCJoin(userId, username, channelId, channelName) {
        this.log(LOG_TYPES.VC, LOG_LEVELS.INFO, 'User joined voice channel', {
            userId,
            username,
            channelId,
            channelName,
            action: 'join'
        });
    }

    logVCLeave(userId, username, channelId, channelName, duration) {
        this.log(LOG_TYPES.VC, LOG_LEVELS.INFO, 'User left voice channel', {
            userId,
            username,
            channelId,
            channelName,
            duration,
            action: 'leave'
        });
    }

    // Task Logs
    logTaskCreate(userId, username, taskId, taskDescription) {
        this.log(LOG_TYPES.TASK, LOG_LEVELS.INFO, 'Task created', {
            userId,
            username,
            taskId,
            taskDescription,
            action: 'create'
        });
    }

    logTaskComplete(userId, username, taskId, taskDescription, duration) {
        this.log(LOG_TYPES.TASK, LOG_LEVELS.INFO, 'Task completed', {
            userId,
            username,
            taskId,
            taskDescription,
            duration,
            action: 'complete'
        });
    }

    logTaskAbandon(userId, username, taskId, taskDescription, duration) {
        this.log(LOG_TYPES.TASK, LOG_LEVELS.INFO, 'Task abandoned', {
            userId,
            username,
            taskId,
            taskDescription,
            duration,
            action: 'abandon'
        });
    }

    // Modal Logs
    logModalOpen(userId, username, modalId, modalType) {
        this.log(LOG_TYPES.MODAL, LOG_LEVELS.INFO, 'Modal opened', {
            userId,
            username,
            modalId,
            modalType,
            action: 'open'
        });
    }

    logModalSubmit(userId, username, modalId, modalType, data) {
        this.log(LOG_TYPES.MODAL, LOG_LEVELS.INFO, 'Modal submitted', {
            userId,
            username,
            modalId,
            modalType,
            data,
            action: 'submit'
        });
    }

    // Role Logs
    logRoleAssign(userId, username, roleId, roleName) {
        this.log(LOG_TYPES.ROLE, LOG_LEVELS.INFO, 'Role assigned', {
            userId,
            username,
            roleId,
            roleName,
            action: 'assign'
        });
    }

    logRoleRemove(userId, username, roleId, roleName) {
        this.log(LOG_TYPES.ROLE, LOG_LEVELS.INFO, 'Role removed', {
            userId,
            username,
            roleId,
            roleName,
            action: 'remove'
        });
    }

    // Stats Logs
    logStatsUpdate(userId, username, stats) {
        this.log(LOG_TYPES.STATS, LOG_LEVELS.INFO, 'User stats updated', {
            userId,
            username,
            stats,
            action: 'update'
        });
    }

    // Error Logs
    logError(error, context = {}) {
        this.log(LOG_TYPES.ERROR, LOG_LEVELS.ERROR, error.message, {
            error: {
                name: error.name,
                stack: error.stack,
                ...context
            }
        });
    }

    // System Logs
    logSystem(message, data = {}) {
        this.log(LOG_TYPES.SYSTEM, LOG_LEVELS.INFO, message, data);
    }
}

// Create a singleton instance
const logger = new Logger();

module.exports = {
    logger,
    LOG_TYPES,
    LOG_LEVELS
}; 