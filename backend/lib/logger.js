const { createLogger, transports, format } = require('winston');

const devFormat = format.combine(
  format.colorize(),
  format.timestamp(),
  format.printf(({ timestamp, level, message }) => `${timestamp} ${level}: ${message}`)
);

const prodFormat = format.combine(
  format.timestamp(),
  format.json()
);

const logger = createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  transports: [
    new transports.Console({
      format: process.env.NODE_ENV === 'production' ? prodFormat : devFormat,
    }),
  ],
});

module.exports = logger;
