module.exports = {
  apps: [
    {
      name: 'attendance-backend',
      cwd: '/home/bylinelm/workflow.bylinelms.com/backend',
      script: 'server.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
        PORT: 3011,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3011,
      },
      watch: false,
      max_memory_restart: '512M',
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      restart_delay: 3000,
      max_restarts: 10,
    },

    // ─── salary-service ────────────────────────────────────────────────────────
    // Separate deployable: own DB, own JWT secret, own B2 bucket.
    // Deploy with: pm2 start ecosystem.config.js --only salary-service --env production
    // NEVER start without --env production on the server — the default `env` block
    // runs NODE_ENV=development which silently enables dev-mode behaviour.
    // This is the same issue found in the AMS audit — mitigated here by making the
    // dev default obvious and the production flag explicit in the deploy command.
    {
      name: 'salary-service',
      cwd: '/home/bylinelm/payroll.bylinelms.com/salary-service',
      script: 'server.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
        PORT: 3012,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3012,
      },
      watch: false,
      max_memory_restart: '384M',
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      restart_delay: 3000,
      max_restarts: 10,
    },
  ],
};
