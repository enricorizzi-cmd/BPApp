/**
 * BPApp - Frontend Timezone Utilities
 * 
 * Utility per gestione fusi orari nel frontend:
 * - Conversione da UTC (backend) a locale (display)
 * - Parsing robusto per input utente
 * - Formattazione per UI
 */

/**
 * Converte stringa UTC in Date locale
 */
function parseUTCString(utcString) {
  if (!utcString) return new Date(NaN);
  const date = new Date(utcString);
  return isNaN(date) ? new Date(NaN) : date;
}

/**
 * Converte Date in stringa per display locale
 * Formato: "DD/MM/YYYY HH:MM"
 */
function toLocalDisplay(date) {
  if (!(date instanceof Date) || isNaN(date)) return '—';
  
  const pad = n => (n < 10 ? '0' : '') + n;
  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = date.getFullYear();
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());
  
  return `${day}/${month}/${year} ${hour}:${minute}`;
}

/**
 * Converte Date in stringa per input HTML datetime-local
 * Formato: "YYYY-MM-DDTHH:MM"
 */
function toLocalInputValue(date) {
  if (!(date instanceof Date) || isNaN(date)) return '';
  
  const pad = n => (n < 10 ? '0' : '') + n;
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());
  
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

/**
 * Converte stringa input HTML in Date locale
 * Input: "YYYY-MM-DDTHH:MM" (locale)
 */
function fromLocalInputValue(input) {
  if (!input) return new Date(NaN);
  
  const str = String(input).trim();
  const [datePart, timePart = '00:00'] = str.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = timePart.split(':').map(Number);
  
  if (!year || !month || !day || hour === undefined || minute === undefined) {
    return new Date(NaN);
  }
  
  const localDate = new Date(year, month - 1, day, hour, minute, 0, 0);
  return isNaN(localDate) ? new Date(NaN) : localDate;
}

/**
 * Estrae YYYY-MM-DD locale da Date
 */
function ymdLocal(date) {
  if (!(date instanceof Date) || isNaN(date)) return '';
  
  const pad = n => (n < 10 ? '0' : '') + n;
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  
  return `${year}-${month}-${day}`;
}

/**
 * Estrae HH:MM locale da Date
 */
function timeHMLocal(date) {
  if (!(date instanceof Date) || isNaN(date)) return '';
  
  const pad = n => (n < 10 ? '0' : '') + n;
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());
  
  return `${hour}:${minute}`;
}

/**
 * Calcola durata in minuti tra due Date
 */
function minutesBetween(start, end) {
  if (!(start instanceof Date) || !(end instanceof Date) || isNaN(start) || isNaN(end)) {
    return 0;
  }
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

/**
 * Aggiunge minuti a una Date e restituisce nuova Date
 */
function addMinutes(date, minutes) {
  if (!(date instanceof Date) || isNaN(date) || !isFinite(minutes)) {
    return new Date(NaN);
  }
  return new Date(date.getTime() + minutes * 60000);
}

/**
 * Formatta durata in minuti in formato leggibile
 */
function formatDuration(minutes) {
  if (!isFinite(minutes) || minutes < 0) return '0m';
  
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

/**
 * Converte Date in stringa per ICS (UTC)
 * Formato: "YYYYMMDDTHHMMSSZ"
 */
function toICSUTC(date) {
  if (!(date instanceof Date) || isNaN(date)) return '';
  
  const pad = n => (n < 10 ? '0' : '') + n;
  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  const hour = pad(date.getUTCHours());
  const minute = pad(date.getUTCMinutes());
  const second = pad(date.getUTCSeconds());
  
  return `${year}${month}${day}T${hour}${minute}${second}Z`;
}

/**
 * Estrae YYYY-MM-DD in UTC da Date
 */
function ymdUTC(date) {
  if (!(date instanceof Date) || isNaN(date)) return '';
  
  const pad = n => (n < 10 ? '0' : '') + n;
  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  
  return `${year}-${month}-${day}`;
}

/**
 * Valida che una stringa sia un formato data/ora valido
 */
function isValidDateTime(input) {
  const date = parseUTCString(input);
  return !isNaN(date);
}

// Export per uso in moduli ES6
if (typeof module !== 'undefined' && module.exports) {
module.exports = {
  parseUTCString,
  toLocalDisplay,
  toLocalInputValue,
  fromLocalInputValue,
  ymdLocal,
  ymdUTC,
  timeHMLocal,
  minutesBetween,
  addMinutes,
  formatDuration,
  toICSUTC,
  isValidDateTime
};
}

// Export globale per uso diretto nel browser
if (typeof window !== 'undefined') {
  window.BPTimezone = {
    parseUTCString,
    toLocalDisplay,
    toLocalInputValue,
    fromLocalInputValue,
    ymdLocal,
    ymdUTC,
    timeHMLocal,
    minutesBetween,
    addMinutes,
    formatDuration,
    toICSUTC,
    isValidDateTime
  };
}
