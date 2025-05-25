module.exports = {
  apps: [{
    name: "pomo-bot",
    script: "index.js",
    watch: false,
    env: {
      "NODE_ENV": "production",
    },
    error_file: "logs/err.log",
    out_file: "logs/out.log",
    time: true,
    instances: 1,
    exec_mode: "fork",
    max_memory_restart: "1G",
    restart_delay: 5000,
    exp_backoff_restart_delay: 100,
    max_restarts: 5,
    min_uptime: "10s"
  }]
} 