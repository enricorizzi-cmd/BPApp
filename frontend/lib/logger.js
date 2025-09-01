/* global pino */
;(function(global){
  'use strict';
  const isDev = ['localhost','127.0.0.1'].includes(global.location.hostname);
  const base = global.pino ? global.pino({ level: isDev ? 'debug' : 'info' }) : console;
  const logger = {
    info: (...args) => (base.info ? base.info(...args) : console.log(...args)),
    error: (...args) => (base.error ? base.error(...args) : console.error(...args)),
    warn: (...args) => (base.warn ? base.warn(...args) : console.warn(...args)),
    debug: (...args) => (base.debug ? base.debug(...args) : console.debug(...args))
  };
  global.logger = logger;
})(window);
