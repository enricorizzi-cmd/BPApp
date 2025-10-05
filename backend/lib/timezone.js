/**
 * BPApp - Timezone Management Utilities
 * 
 * Standard unificato per gestione fusi orari:
 * - Salvataggio: sempre UTC (ISO string con Z)
 * - Display: conversione al timezone locale utente
 * - Parsing: robusto con fallback
 * 
 * API:
 *   parseDateTime(input) -> Date (UTC)
 *   toUTCString(date) -> ISO string UTC
 *   toLocalDisplay(date) -> string locale per display
 *   toLocalInputValue(date) -> string per input HTML
 *   fromLocalInputValue(input) -> Date UTC
 *   ymdUTC(date) -> YYYY-MM-DD in UTC
 *   timeHMUTC(date) -> HH:MM in UTC
 */

const TIMEZONE_ITALY = 'Europe/Rome';

/**
 * Converte qualsiasi input di data/ora in Date UTC
 * Gestisce: ISO strings, "YYYY-MM-DDTHH:MM", Date objects
 */
function parseDateTime(input) {
  if (!input) return new Date(NaN);
  
  // Se è già un Date object
  if (input instanceof Date) {
    return isNaN(input) ? new Date(NaN) : input;
  }
  
  const str = String(input).trim();
  
  // Se è già ISO con timezone (Z o offset)
  if (/[Zz]|[+-]\d{2}:\d{2}$/.test(str)) {
    const d = new Date(str);
    return isNaN(d) ? new Date(NaN) : d;
  }
  
  // Pattern "YYYY-MM-DDTHH:MM" o "YYYY-MM-DD HH:MM"
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d{3}))?$/);
  if (match) {
    const [, year, month, day, hour, minute, second = '0', millisecond = '0'] = match;
    // Crea Date locale, poi converte a UTC
    const localDate = new Date(
      parseInt(year), 
      parseInt(month) - 1, 
      parseInt(day), 
      parseInt(hour), 
      parseInt(minute), 
      parseInt(second), 
      parseInt(millisecond)
    );
    return isNaN(localDate) ? new Date(NaN) : localDate;
  }
  
  // Fallback: prova parsing diretto
  const d = new Date(str);
  return isNaN(d) ? new Date(NaN) : d;
}

/**
 * Converte Date in stringa ISO UTC
 */
function toUTCString(date) {
  if (!(date instanceof Date) || isNaN(date)) return null;
  return date.toISOString();
}

/**
 * Converte Date UTC in stringa per display locale
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
 * Converte Date UTC in stringa per input HTML datetime-local
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
 * Converte stringa input HTML in Date UTC
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
  
  // Crea Date locale, che viene automaticamente gestito come locale dal sistema
  const localDate = new Date(year, month - 1, day, hour, minute, 0, 0);
  return isNaN(localDate) ? new Date(NaN) : localDate;
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
 * Estrae HH:MM in UTC da Date
 */
function timeHMUTC(date) {
  if (!(date instanceof Date) || isNaN(date)) return '';
  
  const pad = n => (n < 10 ? '0' : '') + n;
  const hour = pad(date.getUTCHours());
  const minute = pad(date.getUTCMinutes());
  
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
 * Verifica se due intervalli di tempo si sovrappongono
 */
function timeRangesOverlap(start1, end1, start2, end2) {
  const s1 = parseDateTime(start1);
  const e1 = parseDateTime(end1);
  const s2 = parseDateTime(start2);
  const e2 = parseDateTime(end2);
  
  if (isNaN(s1) || isNaN(e1) || isNaN(s2) || isNaN(e2)) {
    return false;
  }
  
  return s1 < e2 && s2 < e1;
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
 * Valida che una stringa sia un formato data/ora valido
 */
function isValidDateTime(input) {
  const date = parseDateTime(input);
  return !isNaN(date);
}

module.exports = {
  parseDateTime,
  toUTCString,
  toLocalDisplay,
  toLocalInputValue,
  fromLocalInputValue,
  ymdUTC,
  timeHMUTC,
  minutesBetween,
  addMinutes,
  timeRangesOverlap,
  toICSUTC,
  isValidDateTime
};
