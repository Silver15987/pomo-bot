#!/bin/bash

# Pull latest changes
git pull

# Install dependencies
npm install

# Restart the bot
pm2 restart pomo-bot

# Log the update
echo "Bot updated at $(date)" >> logs/updates.log 