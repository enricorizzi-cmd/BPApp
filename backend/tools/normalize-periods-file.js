"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULT_INDICATORS = [
  'VSS','VSDPersonale','VSDIndiretto','GI','Telefonate','AppFissati','AppFatti','CorsiLeadership','iProfile','MBS','NNCF'
];

function normalizeBag(bag, baseIndicators){
  const out = { ...(bag||{}) };
  const list = Array.isArray(baseIndicators)&&baseIndicators.length ? baseIndicators : DEFAULT_INDICATORS;
  for(const k of list){ if(out[k]==null) out[k]=0; else out[k]=Number(out[k]||0); }
  if(out.ProvvGI==null) out.ProvvGI = 0;
  if(out.ProvvVSD==null) out.ProvvVSD = 0;
  if(out.TotProvvigioni==null) out.TotProvvigioni = (Number(out.ProvvGI||0) + Number(out.ProvvVSD||0));
  return out;
}

function main(){
  const file = path.join(__dirname, "..", "data", "periods.json");
  const settingsPath = path.join(__dirname, "..", "data", "settings.json");
  let baseIndicators = DEFAULT_INDICATORS;
  try {
    const s = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    if(s && Array.isArray(s.indicators) && s.indicators.length) baseIndicators = s.indicators;
  }catch(_){ }

  const db = JSON.parse(fs.readFileSync(file, 'utf8'));
  if(!db || !Array.isArray(db.periods)){
    console.error('Invalid periods.json structure');
    process.exit(1);
  }
  for(const p of db.periods){
    p.indicatorsPrev = normalizeBag(p.indicatorsPrev, baseIndicators);
    p.indicatorsCons = normalizeBag(p.indicatorsCons, baseIndicators);
  }
  fs.writeFileSync(file, JSON.stringify(db, null, 2));
  console.log('Normalized', db.periods.length, 'periods');
}

main();

