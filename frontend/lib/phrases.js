// Libreria frasi motivazionali – 3 bucket + alias per final-hooks
// ATTENZIONE: file JS puro (niente <script>, niente <!-- -->)

window.BP_PHRASES = (function(){
  const lite = [
    "Ottimo, {name}! 🎯",
    "Ben fatto, {name}! 🙌",
    "Avanti così, {name}! 🚀",
    "Perfetto, {name}! 🤩",
    "Bel colpo, {name}! 💥",
    "Ci siamo, {name}! 👌",
    "Grande {name}! 🧱",
    "Pezzo dopo pezzo, {name}! 🧩",
    "Molto bene, {name}! 👍",
    "Stai andando bene, {name}! ➡️"
  ];

  const mid = [
    "Che figata, {name}! 🔥",
    "Ma cosa dico grande… grandissimo, {name}! 💪",
    "Super, {name}! ✨",
    "Non ti ferma nessuno, {name}!! 🏎️",
    "Stai andando alla grande, {name}! 📈",
    "Gran progressione, {name}! ⏩",
    "Il ritmo è giusto, {name}! 🥁",
    "Questa spinge, {name}! 🧨",
    "Bello tosto, {name}! 🛡️",
    "Gran focus, {name}! 🎯"
  ];

  const mega = [
    "BOOM! {name}, questo è livello PRO! 🏆",
    "Risultato pazzesco, {name}! 🤯",
    "Clamoroso {name}, così si fa! ⚡",
    "È ufficiale: {name} ON FIRE! 🔥🔥",
    "Top di gamma, {name}! 🥇",
    "Mostruoso upgrade, {name}! 🚀",
    "Record personale in vista, {name}! 🧠",
    "Spacchi tutto, {name}! 💣",
    "Da incorniciare, {name}! 🖼️",
    "Questo alza l’asticella, {name}! 📏"
  ];

  // Costruiamo l’oggetto libreria
  const lib = { lite, mid, mega };

  // Alias per il wiring già usato in final-hooks.js:
  // standard -> lite, rilevante -> mid, grande -> mega
  lib.standard  = lite;
  lib.rilevante = mid;
  lib.grande    = mega;

  // Helper per prendere una frase con sostituzione del nome
  lib.pick = function(level, name){
    const arr = (lib[level] || lite);
    const who = name || (JSON.parse(localStorage.getItem("bp_user")||"{}").name) || "campione";
    const phrase = arr[Math.floor(Math.random()*arr.length)] || "Grande!";
    return phrase.replace(/\{name\}/g, who);
  };

  // Random totale, se serve
  lib.random = function(name){
    const buckets = [lite, mid, mega];
    const arr = buckets[Math.floor(Math.random()*buckets.length)];
    return lib.pick(arr === mega ? "mega" : (arr === mid ? "rilevante" : "standard"), name);
  };

  return lib;
})();
