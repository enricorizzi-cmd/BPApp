// Production logger - minimizza log verbosi in produzione
const isProduction = process.env.NODE_ENV === 'production';
const logLevel = process.env.LOG_LEVEL || (isProduction ? 'warn' : 'info');

// Livelli di log
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

const currentLevel = levels[logLevel] || levels.info;

// Logger ottimizzato per produzione
const productionLogger = {
  error: (...args) => {
    if (currentLevel >= levels.error) {
      console.error('[BP]', ...args);
    }
  },
  
  warn: (...args) => {
    if (currentLevel >= levels.warn) {
      console.warn('[BP]', ...args);
    }
  },
  
  info: (...args) => {
    if (currentLevel >= levels.info) {
      console.log('[BP]', ...args);
    }
  },
  
  debug: (...args) => {
    if (currentLevel >= levels.debug) {
      console.log('[BP]', ...args);
    }
  },
  
  // Log di avvio compatto
  startup: (modules) => {
    if (isProduction) {
      const status = Object.entries(modules)
        .map(([name, status]) => `${name}:${status ? '✓' : '✗'}`)
        .join(' ');
      console.log(`[BP] Ready - ${status} Port ${process.env.PORT || 10000}`);
    } else {
      console.log('[BP] Startup complete:', modules);
    }
  },
  
  // Log di errore critico (sempre visibile)
  critical: (...args) => {
    console.error('[BP] CRITICAL:', ...args);
  }
};

module.exports = productionLogger;
