const { eventStart, eventEnd, ignoreList } = require('../config/event-config.json');
const { disallowedVoiceChannels } = require('../config/channel-config.json');

function isWithinEventWindow() {
    const now = new Date();
    return now >= new Date(eventStart) && now <= new Date(eventEnd);
}

function shouldIgnoreChannel(channelId) {
    // If the channel is in the disallowed list, ignore it
    if (disallowedVoiceChannels.includes(channelId)) {
        return true;
    }
    // Otherwise, don't ignore it (it's event-linked)
    return false;
}

module.exports = { 
    isWithinEventWindow,
    shouldIgnoreChannel
};
