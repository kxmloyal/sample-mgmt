const { createLogger, format, transports } = require('winston');
require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

const LOG_DIR = path.join(__dirname, process.env.LOG_DIR || 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const logger = createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.json()
  ),
  transports: [
    new transports.DailyRotateFile({
      dirname: LOG_DIR,
      filename: 'app-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '30d',
      maxSize: '20m'
    }),
    new transports.Console({
      format: format.combine(
        ...(process.stdout.isTTY ? [format.colorize()] : []),
        format.printf(({ timestamp, level, message, stack }) => {
          const base = `${timestamp} [${level}] ${message}`;
          return stack ? base + '\n' + stack : base;
        })
      )
    })
  ]
});

const morganStream = {
  write: (msg) => logger.info(msg.trim())
};

module.exports = { logger, morganStream };
