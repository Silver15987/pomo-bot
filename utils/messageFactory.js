const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

class MessageFactory {
    static dmClosedMessages = [
        {
            title: "🔒 DM Lockdown Detected!",
            body: "I can't slide into your DMs! To use the focus session feature, you'll need to open your DMs to me. You can stay in the VC, but you won't get any updates or task tracking until you do!",
            footer: "How to fix: User Settings > Privacy & Safety > Server Privacy Defaults > Allow direct messages from server members",
            action: "Enable DMs to get the full focus session experience!"
        },
        {
            title: "🚫 DM Access Denied!",
            body: "Looks like your DMs are on lockdown! While you can chill in the VC, you'll miss out on all the task tracking and updates. Time to open those DMs!",
            footer: "Quick fix: Server Settings > Privacy > Allow direct messages from server members",
            action: "Open your DMs to unlock the full focus session features!"
        },
        {
            title: "📬 DM Delivery Failed!",
            body: "I tried to send you a DM but hit a wall! You can stay in the VC, but you'll be missing out on all the task tracking goodness. Time to open those DMs!",
            footer: "Fix it: Click your profile > Privacy Settings > Server Privacy > Enable DMs",
            action: "Let me into your DMs to get the full focus session experience!"
        },
        {
            title: "🔐 DM Vault Locked!",
            body: "Your DMs are like a fortress! While you can hang in the VC, you'll miss all the task tracking and updates. Time to lower the drawbridge!",
            footer: "Solution: Server Settings > Privacy > Enable direct messages",
            action: "Open your DMs to get the complete focus session experience!"
        },
        {
            title: "🚪 DM Door Closed!",
            body: "I can't knock on your DM door! You can stay in the VC, but you'll miss out on all the task tracking and updates. Time to open up!",
            footer: "How to fix: User Settings > Privacy & Safety > Server Privacy Defaults > Allow direct messages from server members",
            action: "Open your DMs to get the full focus session features!"
        }
    ];

    static focusMessages = [
        {
            title: "🧠 Focus Mode: Activated!",
            body: "Drop your task and how long you'll battle it out (1–180 mins).",
            footer: "No word in 3 minutes? You'll be yeeted out of VC like last season's to-do list.",
            action: "What's your mission?"
        },
        {
            title: "🎯 Mission Briefing!",
            body: "What's your task, agent? And how long will your operation last? (1–180 mins)",
            footer: "Fail to report in 3 minutes and you'll be silently extracted from VC.",
            action: "Ready for your mission?"
        },
        {
            title: "📋 Productivity Police Incoming!",
            body: "Tell me what you're working on and for how long (1–180 mins), or I'll assume you're AFK-surfing the multiverse.",
            footer: "3 minutes of silence = VC exile.",
            action: "What's your task?"
        },
        {
            title: "🕒 Time to Get Sht Done!",
            body: "What's the plan, champ? Task + time (1–180 mins).",
            footer: "If you ghost me for 3 minutes, the bot gods shall smite you from VC.",
            action: "Let's get started!"
        },
        {
            title: "🧘 Zen Mode Check-in",
            body: "Before we vibe into the flow zone, tell me your task and focus time (1–180 mins).",
            footer: "Stay silent for 3 minutes and I'll assume enlightenment... elsewhere. VC buh-bye.",
            action: "What's your focus?"
        }
    ];

    static getRandomDmClosedMessage(userId) {
        const message = this.dmClosedMessages[Math.floor(Math.random() * this.dmClosedMessages.length)];
        return {
            content: `<@${userId}>`,
            embeds: [
                new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle(message.title)
                    .setDescription(message.body)
                    .setFooter({ text: message.footer })
                    .addFields({ name: 'Action Required', value: message.action })
            ],
            allowedMentions: { users: [userId] }
        };
    }

    static getRandomFocusMessage(userId) {
        const message = this.focusMessages[Math.floor(Math.random() * this.focusMessages.length)];
        return {
            embeds: [
                new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle(message.title)
                    .setDescription(message.body)
                    .setFooter({ text: message.footer })
                    .addFields({ name: 'Ready?', value: message.action })
            ],
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`openTaskModal-${userId}`)
                        .setLabel("Enter Task")
                        .setStyle(ButtonStyle.Primary)
                )
            ]
        };
    }
}

module.exports = MessageFactory; 