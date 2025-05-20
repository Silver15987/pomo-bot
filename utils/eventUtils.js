const { eventStart, eventEnd } = require('../config/event-config.json');

function isWithinEventWindow() {
    const now = new Date();
    return now >= new Date(eventStart) && now <= new Date(eventEnd);
}

module.exports = { isWithinEventWindow };
