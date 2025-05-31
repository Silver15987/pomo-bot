class MessageFactory {
    static #dmClosedMessages = [
        {
            title: "🔒 Knock knock... oh wait, your DMs are locked",
            body: "I tried sliding into your inbox with some shiny task tracking features and gentle reminders but the door's shut",
            footer: "You're free to chill in the voice channel but I won't be able to send you updates, prompts, or track your tasks",
            action: "➡️ Enable DMs to unlock full functionality"
        },
        {
            title: "🚫 Whoops Your DMs are tighter than Fort Knox",
            body: "Right now I can't reach you to log your tasks, remind you of deadlines, or nudge you when it's break time",
            footer: "You're technically in the VC party but without DMs you're missing out on the good snacks",
            action: "📬 Turn on DMs so I can do my job properly"
        },
        {
            title: "🤖 Running in silent mode because your DMs ghosted me",
            body: "I've got cool features like task submission, timer updates, and follow ups but they're stuck in a queue",
            footer: "If you'd like the full productivity experience a quick DM settings change is all it takes",
            action: "🛠️ Go to your privacy settings and let me message you"
        },
        {
            title: "🍕 You're in the VC but I'm outside like a pizza guy with no doorbell",
            body: "I've got task tracking, reminders, and accountability tools hot and ready but I can't drop them off",
            footer: "Without DM access I can't follow up or guide you through your session",
            action: "💡 Enable DMs so your productivity order gets delivered"
        },
        {
            title: "🚷 Your DMs are like an exclusive club and I'm stuck outside without the password",
            body: "I'm here to help with task management, nudges, and session wrap ups but I need access to your DMs",
            footer: "Otherwise I just awkwardly sit here while you wonder why nothing's working",
            action: "🔓 Open up your DMs to get started"
        }
    ];

    static getRandomDmClosedMessage() {
        const randomIndex = Math.floor(Math.random() * this.#dmClosedMessages.length);
        const message = this.#dmClosedMessages[randomIndex];
        return `${message.title}\n\n${message.body}\n\n${message.footer}\n\n${message.action}`;
    }
}

module.exports = MessageFactory; 