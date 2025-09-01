/* BPApp – Targets (Junior/Senior)
   - Target mensile per grade (junior/senior)
   - Scaling automatico per periodo (settimanale/mensile/trimestrale/semestrale/annuale)
   - Arrotondamenti: settimanale ↑500€; altri periodi ↑5.000€ (solo monetari)
   - Conteggi (NNCF, AppFatti, Telefonate) arrotondati all’intero in eccesso
   - API:
       BP.Targets.getMonthly(grade)
       BP.Targets.getForPeriod(grade, periodType)
       BP.Targets.compare(data, target)  -> per-key: {value, target, delta, pct}
       BP.Targets.summarize(stats)       -> % media sulle chiavi con target > 0
       BP.Targets.ALL_KEYS / MONEY_KEYS / COUNT_KEYS
*/
(function () {
  const NS = (window.BP = window.BP || {});
  const TG = (NS.Targets = NS.Targets || {});

  const MONEY_KEYS = ["VSS", "VSDPersonale", "VSDIndiretto", "GI"];
  const COUNT_KEYS = ["NNCF", "AppFatti", "Telefonate"];
  const ALL_KEYS = MONEY_KEYS.concat(COUNT_KEYS);

  const MONTHLY = {
    senior: {
      VSS: 30000,
      VSDPersonale: 15000,
      VSDIndiretto: 5000,
      GI: 15000,
      NNCF: 1,
      AppFatti: 4,
      Telefonate: 0, // non specificato per senior
    },
    junior: {
      VSS: 15000,
      VSDPersonale: 5000,
      VSDIndiretto: 5000,
      GI: 10000,
      NNCF: 4,
      AppFatti: 30,
      Telefonate: 300,
    },
  };

  function roundUp(value, step) {
    const v = Number(value || 0);
    const s = Number(step || 0);
    if (!s) return Math.ceil(v);
    return Math.ceil(v / s) * s;
  }

  function getMultiplier(type) {
    switch (String(type || "mensile").toLowerCase()) {
      case "settimanale":
        return 1 / 4;
      case "mensile":
        return 1;
      case "trimestrale":
        return 3;
      case "semestrale":
        return 6;
      case "annuale":
        return 12;
      default:
        return 1;
    }
  }

  function isMoneyKey(k) {
    return MONEY_KEYS.indexOf(k) >= 0;
  }

  function getMonthly(grade) {
    const g = String(grade || "junior").toLowerCase() === "senior" ? "senior" : "junior";
    return { ...MONTHLY[g] };
  }

  function getForPeriod(grade, periodType) {
    const mul = getMultiplier(periodType);
    const base = getMonthly(grade);
    const out = {};
    for (const k of ALL_KEYS) {
      const v = Number(base[k] || 0) * mul;
      if (isMoneyKey(k)) {
        // arrotondamenti sui monetari
        if (String(periodType).toLowerCase() === "settimanale") out[k] = roundUp(v, 500);
        else out[k] = roundUp(v, 5000);
      } else {
        // arrotonda all'intero in eccesso
        out[k] = Math.ceil(v);
      }
    }
    return out;
  }

  // Confronta dati effettivi (o previsionali) con un target
  // data: { KPI: value }   target: { KPI: value }
  function compare(data, target) {
    const res = {};
    for (const k of ALL_KEYS) {
      const val = Number((data || {})[k] || 0);
      const tgt = Number((target || {})[k] || 0);
      const delta = val - tgt;
      const pct = tgt > 0 ? Math.round((val / tgt) * 100) : (val > 0 ? 100 : 0);
      res[k] = { value: val, target: tgt, delta: delta, pct: Math.max(0, pct) };
    }
    return res;
  }

  // % media complessiva sulle chiavi con target > 0
  function summarize(stats) {
    const vals = [];
    for (const k of ALL_KEYS) {
      const row = (stats || {})[k];
      if (row && row.target > 0) vals.push(Number(row.pct || 0));
    }
    if (!vals.length) return 0;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return Math.round(avg);
  }

  TG.MONEY_KEYS = MONEY_KEYS;
  TG.COUNT_KEYS = COUNT_KEYS;
  TG.ALL_KEYS = ALL_KEYS;
  TG.getMonthly = getMonthly;
  TG.getForPeriod = getForPeriod;
  TG.compare = compare;
  TG.summarize = summarize;
})();
