"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULT_INDICATORS = [
  "VSS",
  "VSDPersonale",
  "VSDIndiretto",
  "GI",
  "Telefonate",
  "AppFissati",
  "AppFatti",
  "CorsiLeadership",
  "iProfile",
  "MBS",
  "NNCF",
];

function normalizeBag(bag, baseIndicators) {
  const out = { ...(bag || {}) };
  const list = Array.isArray(baseIndicators) && baseIndicators.length ? baseIndicators : DEFAULT_INDICATORS;
  // Ensure numeric values for all indicators without branching
  list.forEach((k) => {
    out[k] = Number(out[k] ?? 0);
  });
  // Coerce provision fields and derive total when missing
  out.ProvvGI = Number(out.ProvvGI ?? 0);
  out.ProvvVSD = Number(out.ProvvVSD ?? 0);
  out.TotProvvigioni = Number(out.TotProvvigioni ?? out.ProvvGI + out.ProvvVSD);
  return out;
}

function normalizeDateToMidnightUTC(dateStr){
  try{
    const d = new Date(dateStr);
    if (!isFinite(d.getTime())) return dateStr; // lascia intatti i non validi
    // se già 00:00Z, mantieni il giorno e forza 00:00:00.000Z
    if (d.getUTCHours()===0 && d.getUTCMinutes()===0 && d.getUTCSeconds()===0 && d.getUTCMilliseconds()===0) {
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0,0,0,0)).toISOString();
    }
    // altrimenti, porta a mezzanotte Z del giorno successivo (tipico per dati salvati a 22/23Z)
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()+1, 0,0,0,0));
    return next.toISOString();
  }catch(_){ return dateStr; }
}

function readBaseIndicators(settingsPath) {
  try {
    const s = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    if (s && Array.isArray(s.indicators) && s.indicators.length) return s.indicators;
  } catch (_) {}
  return DEFAULT_INDICATORS;
}

function normalizePeriod(p, baseIndicators) {
  if (p.type && typeof p.type === "string") p.type = p.type.toLowerCase();
  if (p.startDate) p.startDate = normalizeDateToMidnightUTC(p.startDate);
  if (p.endDate) p.endDate = normalizeDateToMidnightUTC(p.endDate);
  p.indicatorsPrev = normalizeBag(p.indicatorsPrev, baseIndicators);
  p.indicatorsCons = normalizeBag(p.indicatorsCons, baseIndicators);
}

function main() {
  const file = path.join(__dirname, "..", "data", "periods.json");
  const settingsPath = path.join(__dirname, "..", "data", "settings.json");
  const baseIndicators = readBaseIndicators(settingsPath);

  const db = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!db || !Array.isArray(db.periods)) {
    console.error("Invalid periods.json structure");
    process.exit(1);
  }
  db.periods.forEach((p) => normalizePeriod(p, baseIndicators));
  fs.writeFileSync(file, JSON.stringify(db, null, 2));
  console.log("Normalized", db.periods.length, "periods (dates + indicators)");
}

main();
