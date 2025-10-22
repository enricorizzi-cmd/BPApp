module.exports = {
  apps: [
    {
      name: 'bp-backend',
      script: 'server.js',
      instances: 1, // keep 1 with SQLite (WAL)
      exec_mode: 'fork',
      watch: false,
      env: {
        NODE_ENV: 'production',
        TZ: 'Europe/Rome',
        PORT: 3001,
        // CORS_ORIGIN: 'https://app.example.com',
        // BP_JWT_SECRET: 'change_me',
        // VAPID_PUBLIC_KEY: '',
        // VAPID_PRIVATE_KEY: '',
        // VAPID_SUBJECT: 'mailto:admin@example.com',
        // SMTP_URL: '',
        // SMTP_FROM: 'no-reply@example.com'
      },
      max_memory_restart: '300M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true
    }
  ]
};

