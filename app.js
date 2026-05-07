
/************************************************
 * SIMULATION PICKING — VERSION PROPRE
 * BLOC A — CONSTANTES & ÉTAT GLOBAL
 ************************************************/

console.log("✅ app.js chargé");

/* =========================
   ÉTAT GLOBAL
========================= */
// Niveaux possibles (ordre alphabétique)
const NIVEAUX_AUTORISES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
let PREPS = {};
let NB_LIGNES = 0;
let ARTICLE_DATA = {};
let HEATMAP = {};
let EMPLACEMENTS = {};
let EMP_FAMILIES = {};
let PREP_DATES = {};
let STOCK_ROWS = [];
let EMPLACEMENTS_STOCK = {};
let ARTICLE_DATA_STOCK = {};
let STOCK_BY_EMP = {};
let EMPL_COUNT_BY_FAM = {};
let HISTO_ANALYSIS = {
  worstSnapshot: {},
  capByFam: {}
};
let DELTA_NIVEAUX_REIMPLANT = {}; // clé = "A_01" → { ETAGERE, LISSE }
let MODE_AJOUT_NIVEAU = "LISSE"; // ou "ETAGERE
let NIVEAU_TYPE = {};
let IMPLANTATION_ACTIVE = false;

// 🔑 Initialisation canonique
NIVEAUX_AUTORISES.split("").forEach(n => {
  NIVEAU_TYPE[n] = "GERBEUR";
});
NIVEAU_TYPE.A = "SOL";

let VALIDATION_VERTICAL_CACHE = {};
let BESOIN_STOCK_CACHE = null;
let FILTERS = {
  famille: ""
};

// ✅ niveaux découplés par contexte
let NIV_ACTUEL = "";        // plan actuel + heatmap
let NIV_REIMPLANT = "";     // plan de réimplantation


let ACTIVE_FAMILLE = null;
let AUTO_IMPLANT_RUNNING = false;
let SELECTED = new Set();
let INTERNAL_LEVEL_UPDATE = false;
// =====================================================
// AUTO‑IMPLANTATION — MODES & SÉCURITÉS (SAFE)
// =====================================================

// 🔑 Mode auto‑implantation ACTIF (piloté par l’UI)
window.AUTO_IMPLANT_MODE = "FAST";
// valeurs possibles : "FAST" | "PRECISE"

// 🔒 Garde‑fous calcul
const AUTO_IMPLANT_LIMITS = {
  FAST:    { maxRefs: 200, maxIter: 300 },
  PRECISE: { maxRefs: 400, maxIter: 800 }
};

/* =========================
   RÈGLES MÉTIER
========================= */

// === TEMPS FIXES MÉTIER ===
const TEMPS_SEQUENCEUR = 18; // s : séquenceur <-> entrée NEF2
const SHOW_VERTICAL_VALIDATION = false;
const DEBUG_TIMES = true;
const ENABLE_OPTIMISATION_GLOBALE = true;
// ✅ seuil utilisé ailleurs → on le garde
const SEUIL_MIN_P80 = 2;
const SURFACE_PAR_EMPLACEMENT = 0.96; // m² (80 x 120 cm)

// Familles STRUCTURANTES : interdites en AUTRES
const STRUCTURING_FAMILIES = new Set([
  "TA", // Tuyauterie
  "EL", // Électricité
  "AC", // Accastillage
  "RO", // Robinetterie
  "HV", // HVAC
  "CO", // Consommables mécaniques
  "EP", // Équipements
  "IN", // Instrumentation
  "SE", // Serrurerie
]);

/************************************************
 * PARAMÈTRES MÉTIER – AIDE À L’IMPLANTATION
 ************************************************/

// Marge de base par famille (Option C – base)
const BASE_MARGE_BY_FAM = {
  EL: 0.25,
  EL4: 0.25,
  EL8: 0.25,

  GA: 0.20,
  TA: 0.20,

  CL: 0.15,
  EM: 0.15,

  VIDE: 0.10
};

// Valeur par défaut si famille non listée
const DEFAULT_MARGE = 0.20;

// Bornes de sécurité
const MIN_MARGE = 0.10;
const MAX_MARGE = 0.35;

/************************************************
 * CALCUL DE MARGE VARIABLE – OPTION C
 ************************************************/

function computeVariableMarge({ fam, besoinStock = 0, besoinFlux = 0 }) {
  let marge = BASE_MARGE_BY_FAM[fam] ?? DEFAULT_MARGE;

  if (besoinStock > besoinFlux * 1.2) {
    marge += 0.05;
  } else if (besoinFlux > besoinStock * 1.2) {
    marge -= 0.05;
  }

  marge = Math.max(MIN_MARGE, Math.min(marge, MAX_MARGE));
  return marge;
}


/* =========================
   AFFICHAGE
========================= */

const VIEW = {
  cellW: 70,
  cellH: 26,
  offsetX: 120,
  offsetY: 90
};
/* =====================================================
   CANVAS ACTIF — CANONIQUE
   (source de vérité absolue)
===================================================== */
function getActivePlanCanvas() {
  if (
    document
      .getElementById("tab-reimplantation")
      ?.classList.contains("active")
  ) {
    return document.getElementById("plan2D-reimplantation");
  }

  return document.getElementById("plan2D-actuel");
}
let EMP_INDEX = new Map();

/* =========================
   CONFIGURATION PHYSIQUE ENTREPÔT
========================= */

// Allées existantes
const ALLEES = "ABCDEFGHIJKLMN";

// Travées
const TRAVEE_MIN = 1;
const TRAVEE_MAX = 16;

// Positions théoriques (grille)
const POSITIONS_PAR_DEFAUT = [1, 2, 3, 4];
const POSITIONS = 4; // UNIQUEMENT pour le calcul des lignes écran

// Exceptions de positions par travée
const TRAVEE_POSITIONS = {
  9: [1, 2, 3] // Travée 9 : pas de position 4
};


/*
 Hauteur maximale réelle par allée / travée
 clé = "A_01" → valeur = niveau max
*/
const HAUTEUR_MAX = {
  // === ALLÉE A ===
  "A_01":"J","A_02":"J","A_03":"I","A_04":"I","A_05":"I","A_06":"I","A_07":"I","A_08":"I",
  "A_09":"I","A_10":"H","A_11":"H","A_12":"H","A_13":"H","A_14":"H","A_15":"H","A_16":"H",

  // === ALLÉE B ===
  "B_01":"J","B_02":"J","B_03":"J","B_04":"J","B_05":"J","B_06":"J","B_07":"J","B_08":"J",
  "B_09":"J","B_10":"I","B_11":"I","B_12":"J","B_13":"J","B_14":"J","B_15":"J","B_16":"J",

  // === ALLÉE C ===
  "C_01":"J","C_02":"J","C_03":"J","C_04":"J","C_05":"J","C_06":"J","C_07":"J","C_08":"J",
  "C_09":"J","C_10":"I","C_11":"I","C_12":"J","C_13":"J","C_14":"J","C_15":"J","C_16":"J",

  // === ALLÉE D ===
  "D_01":"J","D_02":"J","D_03":"J","D_04":"J","D_05":"J","D_06":"J","D_07":"J","D_08":"J",
  "D_09":"J","D_10":"J","D_11":"J","D_12":"J","D_13":"J","D_14":"J","D_15":"J","D_16":"J",

  // === ALLÉE E ===
  "E_01":"J","E_02":"J","E_03":"J","E_04":"J","E_05":"J","E_06":"J","E_07":"J","E_08":"J",
  "E_09":"J","E_10":"J","E_11":"J","E_12":"J","E_13":"J","E_14":"J","E_15":"J","E_16":"J",

  // === ALLÉE F ===
  "F_01":"J","F_02":"J","F_03":"H","F_04":"H","F_05":"H","F_06":"H","F_07":"H","F_08":"H",
  "F_09":"H","F_10":"I","F_11":"I","F_12":"J","F_13":"J","F_14":"J","F_15":"J","F_16":"J",

  // === ALLÉE G ===
  "G_01":"J","G_02":"J","G_03":"H","G_04":"H","G_05":"H","G_06":"H","G_07":"H","G_08":"H",
  "G_09":"H","G_10":"I","G_11":"I","G_12":"J","G_13":"J","G_14":"J","G_15":"J","G_16":"J",

  // === ALLÉE H ===
  "H_01":"J","H_02":"J","H_03":"J","H_04":"J","H_05":"J","H_06":"J","H_07":"J","H_08":"J",
  "H_09":"J","H_10":"J","H_11":"J","H_12":"J","H_13":"J","H_14":"J","H_15":"J","H_16":"J",

  // === ALLÉE I ===
  "I_01":"J","I_02":"J","I_03":"J","I_04":"J","I_05":"J","I_06":"J","I_07":"J","I_08":"J",
  "I_09":"J","I_10":"J","I_11":"J","I_12":"J","I_13":"J","I_14":"J","I_15":"J","I_16":"J",

  // === ALLÉE J ===
  "J_01":"G","J_02":"G","J_03":"F","J_04":"F","J_05":"F","J_06":"F","J_07":"F","J_08":"F",
  "J_09":"F","J_10":"G","J_11":"G","J_12":"G","J_13":"G","J_14":"G","J_15":"G","J_16":"G",

  // === ALLÉE K ===
  "K_01":"G","K_02":"G","K_03":"F","K_04":"F","K_05":"F","K_06":"F","K_07":"F","K_08":"F",
  "K_09":"F","K_10":"G","K_11":"G","K_12":"G","K_13":"G","K_14":"G","K_15":"G","K_16":"G",

  // === ALLÉE L ===
  "L_01":"J","L_02":"J","L_03":"I","L_04":"I","L_05":"I","L_06":"I","L_07":"I","L_08":"I",
  "L_09":"I","L_10":"I","L_11":"I","L_12":"I","L_13":"I","L_14":"I","L_15":"I","L_16":"I",

  // === ALLÉE M ===
  "M_01":"J","M_02":"J","M_03":"I","M_04":"I","M_05":"I","M_06":"I","M_07":"I","M_08":"I",
  "M_09":"I","M_10":"H","M_11":"H","M_12":"H","M_13":"H","M_14":"H","M_15":"H","M_16":"H",

  // === ALLÉE N ===
  "N_01":"J","N_02":"J","N_03":"J","N_04":"J","N_05":"J","N_06":"J","N_07":"J","N_08":"J",
  "N_09":"J","N_10":"I","N_11":"I","N_12":"I","N_13":"H","N_14":"H","N_15":"H","N_16":"H"
};

/*
  Niveau MINIMUM physique par travée
  (ex: travée 2 au‑dessus de l’allée → commence à E)
*/
const NIVEAU_MIN_TRAVEE = {
  2: "E"
};

let ROW_INDEX = {};     // clé: allee|travee|position -> rowIndex
let ROWS_TOTAL = 0;    // nombre réel de lignes écran

/* =========================
   FONCTIONS CANONIQUES
========================= */
function getNiveauMin(allee, travee) {
  // priorité à la règle par travée
  return NIVEAU_MIN_TRAVEE[travee] || "A";
}

function isPositionValide(travee, position) {
  if (TRAVEE_POSITIONS[travee]) {
    return TRAVEE_POSITIONS[travee].includes(position);
  }
  return POSITIONS_PAR_DEFAUT.includes(position);
}

function isNiveauValide(allee, travee, niveau) {
  const key = `${allee}_${String(travee).padStart(2, "0")}`;

  const maxNiveau = IMPLANTATION_ACTIVE
    ? getHauteurReimplant(allee, travee)
    : HAUTEUR_MAX[key];

  if (!maxNiveau) return false;

  const minNiveau = getNiveauMin(allee, travee);

  // ✅ borne basse (ex: travée 2 commence à E)
  if (niveau.charCodeAt(0) < minNiveau.charCodeAt(0)) {
    return false;
  }

  // ✅ borne haute (logique existante)
  return niveau.charCodeAt(0) <= maxNiveau.charCodeAt(0);
}

function isZonePicking(e) {
  if (!e) return false;

  // 1️⃣ zone physiquement existante (APRÈS inclus)
  if (!isNiveauValide(
        e.allee,
        e.travee,
        e.niveau
      )) return false;

  if (!isPositionValide(e.travee, e.position)) return false;

  // 2️⃣ exclusions métier
  if (isZoneInterdite(e)) return false;

  return true;
}
function isNiveauValideApres(allee, travee, niveau) {
  const maxNiveau = getHauteurReimplant(allee, travee);
  if (!maxNiveau) return false;
  return niveau.charCodeAt(0) <= maxNiveau.charCodeAt(0);
}

function emplacementExiste(allee, travee, position, niveau) {

  return (
    ALLEES.includes(allee) &&
    travee >= TRAVEE_MIN &&
    travee <= TRAVEE_MAX &&
    isPositionValide(travee, position) &&
    isNiveauValide(allee, travee, niveau)
  );
}
function implanterColonneManuelle(e, famille) {
  if (!e) return;

  const { allee, travee, position } = e;

  // ✅ niveau minimum physique réel (ex: E pour travée 2)
  const niveauMin = getNiveauMin(allee, travee);

  // ✅ niveau maximum réel
  const niveauMax =
    getHauteurReimplant(allee, travee) ||
    HAUTEUR_MAX[`${allee}_${String(travee).padStart(2, "0")}`];

  if (!niveauMax) return;

  const minCode = niveauMin.charCodeAt(0);
  const maxCode = niveauMax.charCodeAt(0);

  for (let code = minCode; code <= maxCode; code++) {
    const niveau = String.fromCharCode(code);
    const empId =
      `${allee}${String(travee).padStart(2, "0")}${niveau}${position}`;

    const emp = EMPLACEMENTS[empId];
    if (!emp) continue;
    if (!isZonePicking(emp)) continue;
    if (isZoneInterdite(emp)) continue;

    // ✅ pose OU effacement
    emp.famille = famille === null ? null : famille;
  }
}

function getHauteurReimplant(allee, travee) {
  const key = `${allee}_${String(travee).padStart(2, "0")}`;
  const base = HAUTEUR_MAX[key];
  if (!base) return null;

  const d = DELTA_NIVEAUX_REIMPLANT[key] || { ETAGERE: 0, LISSE: 0 };
  const totalDelta = d.ETAGERE + d.LISSE;

  const baseIdx = base.charCodeAt(0) - 65;
  return String.fromCharCode(65 + baseIdx + totalDelta);
}

/* =====================================================
   ZONE PICKING — DÉFINITION CANONIQUE
   ✅ travées 1 et 2 COMPTÉES
   ✅ compatible aide / plan / auto-implantation
===================================================== */

function isZonePhysique(e) {
  return emplacementExiste(e.allee, e.travee, e.position, e.niveau);
}

function isZoneInterdite(e) {
  if (!e) return false;

  // ❌ Zones grisées non sélectionnables
  if (
    (e.allee === "M" || e.allee === "N") &&
    e.travee >= 14 &&
    e.travee <= 16
  ) {
    return true;
  }

  return false;
}

function isZoneVisuellementGrisee(e) {
  if (!e) return true;

  // 🎨 choix métier UI : travées 1 et 2 en grisé
  if (e.travee <= 2) return true;

  return false;
}
function isCheminVisuel(rowIndex) {
  // lignes vides ajoutées APRÈS travée 2 et APRÈS travée 9
  return rowIndex === ROW_INDEX.__PASSAGE_2_3
      || rowIndex === ROW_INDEX.__PASSAGE_9_10;
}
/************************************************
 * BLOC A2 — TOOLBAR (INFO SÉLECTION)
 ************************************************/

function updateToolbarInfo() {
  const selInfo = document.getElementById("selectionInfo");
  if (selInfo) selInfo.textContent = `Sélection : ${SELECTED.size}`;

  const famInfo = document.getElementById("activeGestInfo");
  if (!famInfo) return;

  if (ACTIVE_FAMILLE === null) {
    famInfo.style.display = "none";
  } else {
    famInfo.style.display = "block";
    famInfo.textContent = `Famille active : ${ACTIVE_FAMILLE}`;
  }
}
function showAutoProgress(label, pct) {
  const box = document.getElementById("autoProgress");
  const bar = document.getElementById("autoProgressBar");
  const txt = document.getElementById("autoProgressLabel");

  if (box) box.style.display = "block";
  if (bar) bar.value = pct;
  if (txt) txt.textContent = label;
}

function hideAutoProgress() {
  const box = document.getElementById("autoProgress");
  if (box) box.style.display = "none";
}
console.log("✅ BLOC A2 chargé");

/************************************************
 * BLOC B — OUTILS EXCEL & DÉTECTION COLONNES
 * + GESTION LOADER AVEC POURCENTAGE
 ************************************************/

/* =========================
   LOADER (% + LABEL)
========================= */

function setLoaderProgress(pct, label = null) {
  const percentEl = document.getElementById("loaderPercent");
  const barEl = document.getElementById("loaderBarFill");
  const textEl = document.querySelector(".loader-text");

  if (percentEl) percentEl.textContent = `${pct}%`;
  if (barEl) barEl.style.width = `${pct}%`;

  if (label && textEl) {
    textEl.firstChild.nodeValue = label + " ";
  }
}

function nextFrame() {
  return new Promise(resolve => {
    requestAnimationFrame(() => resolve());
  });
}

function showLoader() {
  document.body.classList.add("loading");   // ✅ AJOUT
  const loader = document.getElementById("loader");
  if (loader) loader.classList.remove("hidden");
  setLoaderProgress(0, "Initialisation…");
}

function hideLoader() {
  document.body.classList.remove("loading"); // ✅ AJOUT
  const loader = document.getElementById("loader");
  if (loader) loader.classList.add("hidden");
}

/* =========================
   LECTURE EXCEL
========================= */

function readExcel(file) {
  return new Promise(resolve => {
    const reader = new FileReader();

    reader.onload = e => {
      setLoaderProgress(10, "Lecture du fichier Excel…");

      const workbook = XLSX.read(e.target.result, { type: "binary" });

      setLoaderProgress(15, "Fichier Excel chargé");
      resolve(workbook.Sheets);
    };

    reader.readAsBinaryString(file);
  });
}

/* =========================
   DÉTECTION DES COLONNES
========================= */

function normalizeHeader(str) {
  return str
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function detectColumn(row, keywords) {
  for (const header of Object.keys(row)) {
    const norm = normalizeHeader(header);
    if (keywords.some(k => norm.includes(k))) return header;
  }
  return null;
}

console.log("✅ BLOC B chargé (loader % intégré)");

/************************************************
 * BLOC C — PARSING DES EMPLACEMENTS
 ************************************************/

function parseEmplacement(raw) {
  if (!raw) return null;

  const txt = raw.toString().trim();
  const clean = txt.startsWith("2P-") ? txt.slice(3) : txt;

  const m = clean.match(/^([A-Z])(\d{2})([A-Z])(\d)$/);
  if (!m) return null;

  const allee = m[1];
  const travee = parseInt(m[2], 10);
  const niveau = m[3];
  const position = parseInt(m[4], 10);

  // ✅ validation SYNTAXIQUE uniquement
  if (
    !ALLEES.includes(allee) ||
    travee < TRAVEE_MIN ||
    travee > TRAVEE_MAX ||
    position < 1 ||
    position > POSITIONS ||
    !NIVEAUX_AUTORISES.includes(niveau)
  ) {
    return null;
  }

  return {
    empId: clean,
    allee,
    travee,
    niveau,
    position
  };
}

console.log("✅ BLOC C chargé");

/************************************************
 * BLOC D — RÉFÉRENTIEL FAMILLES & COULEURS
 ************************************************/

function getFamillesActives() {
  return [...new Set(Object.values(ARTICLE_DATA).map(a => a.famille))].sort();
}

const FAMILLES = {
  EL: "Électricité / Éclairage",
  RO: "Robinetterie",
  TA: "Tuyauterie",
  EP: "Équipements process",
  IN: "Instrumentation",
  AC: "Accessoires",
  HV: "HVAC",
  CO: "Consommables",
  CL: "Contrôle",
  GN: "Génie civil",
  CS: "Consommables chantier",
  PE: "Protection",
  OU: "Outillage",
  EM: "Mécanique",
  SE: "Sérrurerie",
  AUT: "Autres / non classé"
};

const COLORS = {
  EL: "#ffd966",
  RO: "#c9daf8",
  TA: "#d9ead3",
  EP: "#f4cccc",
  IN: "#ead1dc",
  AC: "#d0e0e3",
  HV: "#fff2cc",
  CO: "#ead1dc",
  CL: "#b4a7d6",
  GN: "#999999",
  CS: "#fce5cd",
  PE: "#e6b8af",
  OU: "#b6d7a8",
  EM: "#a4c2f4",
  AUT: "#b0bec5"
};

function colorByFamille(famille) {
  if (!famille) return "#ffffff";
  return COLORS[famille] || "#dddddd";
}

function labelFamillePosition(famille) {
  return famille || "";
}

function getFamilleImplantation(famille) {
  if (!famille) return "AUT";

  // ✅ SI déjà canonique, on retourne DIRECT
  if (STRUCTURING_FAMILIES.has(famille)) {
    return famille;
  }

  const fam = normalizeFamilleCode(famille);

  if (STRUCTURING_FAMILIES.has(fam)) {
    return fam;
  }

  return "AUT";
}

/************************************************
 * BESOIN STOCK — PARTITION STRICTE PAR EMPLACEMENT
 * ✅ La somme = nb d’emplacements occupés
 ************************************************/

function normalizeFamilleCode(rawFam) {
  if (rawFam == null) return "VIDE";

  /* =====================================================
     1️⃣ NORMALISATION SYNTAXIQUE FORTE
  ===================================================== */

  const txt = rawFam
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // accents
    .replace(/[\u00A0]/g, " ")        // espaces insécables
    .replace(/\s+/g, "")              // tous les espaces
    .toUpperCase();

  if (!txt) return "VIDE";

  /* =====================================================
     2️⃣ RÈGLES MÉTIER STRUCTURANTES (BLINDÉES)
     👉 Toute variante raisonnable → famille canonique
  ===================================================== */

  // 🔥 CONTRÔLE
  // CL, CL1, CL3, CL-02, CL_4, CLX (si un jour), etc.
  if (/^CL[A-Z0-9._-]*$/.test(txt)) {
    return "CL";
  }

  // 🔧 TUYAUTERIE
  // TA, TA1, GA, GA2, GA-01
  if (/^(TA|GA)[A-Z0-9._-]*$/.test(txt)) {
    return "TA";
  }

  // ⚡ ÉLECTRICITÉ
  // EL, EL1, ELA, ELA2
  if (/^(EL|ELA)[A-Z0-9._-]*$/.test(txt)) {
    return "EL";
  }

  // 🛠️ ACCASTILLAGE / COQUE
  // AC, ACL, ACA, ACH, AC1, ACL5
  if (/^(AC|ACL|ACA|ACH)[A-Z0-9._-]*$/.test(txt)) {
    return "AC";
  }

  // 🚿 ROBINETTERIE
  if (/^RO[A-Z0-9._-]*$/.test(txt)) {
    return "RO";
  }

  // ❄️ HVAC
  if (/^HV[A-Z0-9._-]*$/.test(txt)) {
    return "HV";
  }

  // 📦 CONSOMMABLES
  if (/^CO[A-Z0-9._-]*$/.test(txt)) {
    return "CO";
  }

  // ⚙️ ÉQUIPEMENTS
  if (/^EP[A-Z0-9._-]*$/.test(txt)) {
    return "EP";
  }

  // 📐 INSTRUMENTATION
  if (/^IN[A-Z0-9._-]*$/.test(txt)) {
    return "IN";
  }

  // 🔩 SERRURERIE
  // SE1, SE2, SEM, SEM3
  if (/^(SE|SEM)[A-Z0-9._-]*$/.test(txt)) {
    return "SE";
  }

  // 🏗️ CHANTIER
  if (/^CS[A-Z0-9._-]*$/.test(txt)) {
    return "CS";
  }

  /* =====================================================
     3️⃣ AUT — GESTION CONTRÔLÉE (IMPORTANT)
  ===================================================== */

  // À ce stade :
  // - ce n’est AUCUNE famille structurante connue
  // - ce n’est pas VIDE
  // 👉 donc AUT par définition métier

  return "AUT";
}

console.log("✅ BLOC D chargé");

/************************************************
 * SIMULATION PICKING — VERSION PROPRE
 * BLOC E — MODÈLE ENTREPÔT (EMPLACEMENTS)
 ************************************************/

function initEmplacementsFromDT(rows, empCol) {
  EMPLACEMENTS = {};

  rows.forEach(row => {
    const parsed = parseEmplacement(row[empCol]);
    if (!parsed) return;

if (!emplacementExiste(
  parsed.allee,
  parsed.travee,
  parsed.position,
  parsed.niveau
)) {
  return;
}

    const { empId, allee, travee, niveau, position } = parsed;

    if (!EMPLACEMENTS[empId]) {
      EMPLACEMENTS[empId] = {
        allee,
        travee,
        position,
        niveau,
        famille: null
      };
    }
  });

  console.log(
    "✅ EMPLACEMENTS initialisés depuis DT :",
    Object.keys(EMPLACEMENTS).length
  );
}
/**
 * Initialise les emplacements physiques depuis le fichier STOCK
 * (même logique que le DT, mais source différente)
 */
function initEmplacementsFromStock() {
  EMPLACEMENTS_STOCK = {};

  STOCK_ROWS.forEach(row => {
    const raw =
      row["Emplacement"] ||
      row["Emplacement stock"] ||
      row["EMPLACEMENT"];

    const parsed = parseEmplacement(raw);
    if (!parsed) return;

    if (!emplacementExiste(
      parsed.allee,
      parsed.travee,
      parsed.position,
      parsed.niveau
    )) return;

    EMPLACEMENTS_STOCK[parsed.empId] = {
      allee: parsed.allee,
      travee: parsed.travee,
      position: parsed.position,
      niveau: parsed.niveau
    };
  });

  console.log(
    "✅ EMPLACEMENTS_STOCK initialisés depuis STOCK :",
    Object.keys(EMPLACEMENTS_STOCK).length
  );
}
function rebuildStockByEmpIndex() {
  STOCK_BY_EMP = {};

  STOCK_ROWS.forEach(row => {
    const raw =
      row["Emplacement"] ||
      row["Emplacement stock"] ||
      row["EMPLACEMENT"];

    const parsed = parseEmplacement(raw);
    if (!parsed) return;

    const empId = parsed.empId;
    STOCK_BY_EMP[empId] ??= [];
    STOCK_BY_EMP[empId].push(row);
  });

  console.log("✅ STOCK_BY_EMP indexé :", Object.keys(STOCK_BY_EMP).length);
}
/**
 * Complète un niveau pour avoir TOUTES les cases :
 * - Allées A → N
 * - Travées 1 → 16
 * - Positions 1 → 4
 *
 * @param {string} niveau
 */

function ensureFullLevel(niveau) {
  const niv = (niveau || "").toUpperCase();
  if (!NIVEAUX_AUTORISES.includes(niv)) return;

  for (const allee of ALLEES) {
    for (let tr = TRAVEE_MIN; tr <= TRAVEE_MAX; tr++) {
      for (let pos of POSITIONS_PAR_DEFAUT) {

        if (!emplacementExiste(allee, tr, pos, niv)) continue;

        const empId = `${allee}${String(tr).padStart(2, "0")}${niv}${pos}`;

        if (!EMPLACEMENTS[empId]) {
          EMPLACEMENTS[empId] = {
            allee,
            travee: tr,
            position: pos,
            niveau: niv,
            famille: null
          };
        }
      }
    }
  }

  console.log(`✅ Niveau ${niv} complété (emplacements physiques uniquement)`);
}
/**
 * ✅ Création ciblée d’un niveau PHYSIQUE
 * uniquement pour UNE allée + UNE travée
 */
function ensurePhysicalLevelFor(allee, travee, niveau) {
  const niv = (niveau || "").toUpperCase();
  if (!NIVEAUX_AUTORISES.includes(niv)) return;

  for (const pos of POSITIONS_PAR_DEFAUT) {
    if (!emplacementExiste(allee, travee, pos, niv)) continue;

    const empId =
      `${allee}${String(travee).padStart(2, "0")}${niv}${pos}`;

    if (!EMPLACEMENTS[empId]) {
      EMPLACEMENTS[empId] = {
        allee,
        travee,
        position: pos,
        niveau: niv,
        famille: null
      };
    }
  }
}
function ensureAllPhysicalEmplacements() {
  const niveaux = new Set();

  // récupérer TOUS les niveaux physiquement possibles
  ALLEES.split("").forEach(allee => {
    for (let tr = TRAVEE_MIN; tr <= TRAVEE_MAX; tr++) {
      const key = `${allee}_${String(tr).padStart(2, "0")}`;

const max = IMPLANTATION_ACTIVE
  ? getHauteurReimplant(allee, tr)
  : HAUTEUR_MAX[key];

if (!max) continue;

      for (
        let n = "A";
        n <= max;
        n = String.fromCharCode(n.charCodeAt(0) + 1)
      ) {
        niveaux.add(n);
      }
    }
  });

  // créer TOUS les emplacements physiques
  niveaux.forEach(niv => ensureFullLevel(niv));

  console.log("✅ Tous les emplacements physiques garantis");
}

/**
 * Retourne la liste des niveaux existants
 * @returns {Array<string>}
 */
function getExistingLevels() {
  return Array.from(
    new Set(Object.values(EMPLACEMENTS).map(e => e.niveau))
  ).sort();
}

console.log("✅ BLOC E chargé");
// ✅ Niveaux POSSIBLES APRÈS (HAUTEUR_MAX + DELTA)
function getPossibleLevelsApres() {
  const niveaux = new Set();

  ALLEES.split("").forEach(allee => {
    for (let tr = TRAVEE_MIN; tr <= TRAVEE_MAX; tr++) {
      const max = getHauteurReimplant(allee, tr);
      if (!max) continue;

      for (
        let n = "A";
        n <= max;
        n = String.fromCharCode(n.charCodeAt(0) + 1)
      ) {
        niveaux.add(n);
      }
    }
  });

  return [...niveaux].sort();
}
function initHeightEditor() {
  const selAllee = document.getElementById("heightAllee");
  const selTravee = document.getElementById("heightTravee");
  const selNiveau = document.getElementById("heightNiveau");

  if (!selAllee || !selTravee || !selNiveau) return;

  // Allées
  selAllee.innerHTML = "";
  ALLEES.split("").forEach(a => {
    const opt = document.createElement("option");
    opt.value = a;
    opt.textContent = a;
    selAllee.appendChild(opt);
  });

  // Travées
  selTravee.innerHTML = "";
  for (let tr = TRAVEE_MIN; tr <= TRAVEE_MAX; tr++) {
    const opt = document.createElement("option");
    opt.value = tr;
    opt.textContent = String(tr).padStart(2, "0");
    selTravee.appendChild(opt);
  }

  // Niveaux
  selNiveau.innerHTML = "";
  NIVEAUX_AUTORISES.split("").forEach(n => {
    const opt = document.createElement("option");
    opt.value = n;
    opt.textContent = n;
    selNiveau.appendChild(opt);
  });

  updateHeightEditorValue();
}
function updateHeightEditorValue() {
  const allee = heightAllee.value;
  const tr = heightTravee.value;
  const key = `${allee}_${String(tr).padStart(2, "0")}`;

  heightNiveau.value = HAUTEUR_MAX[key] || "A";
}
heightAllee.addEventListener("change", updateHeightEditorValue);
heightTravee.addEventListener("change", updateHeightEditorValue);

document.getElementById("applyHeight")?.addEventListener("click", () => {

  // 🔒 INTERDICTION FORMELLE EN MODE RÉIMPLANTATION
  if (IMPLANTATION_ACTIVE) {
    alert(
      "❌ La hauteur physique AVANT ne peut pas être modifiée en mode réimplantation.\n" +
      "Utilise l’ajout de niveaux (étagère / lisse) uniquement."
    );
    return;
  }

  const allee = heightAllee.value;
  const tr = heightTravee.value;
  const niveau = heightNiveau.value;

  const key = `${allee}_${String(tr).padStart(2, "0")}`;
  HAUTEUR_MAX[key] = niveau; // ✅ autorisé UNIQUEMENT hors réimplantation

  console.log("✅ Hauteur physique AVANT modifiée :", key, niveau);

  rebuildEmpIndex();
  drawZonePlan();
  resizeImplantationCanvas();
  drawHeatmapAvant();
});

/* =========================
   ESPACE — BASE PHYSIQUE
========================= */

function countPhysicalEmplacements() {
  return Object.values(EMPLACEMENTS)
    .filter(e => isZonePicking(e)).length;
}

function countStockOccupiedEmplacements() {
  const set = new Set();

  Object.keys(STOCK_BY_EMP || {}).forEach(empId => {
    if (STOCK_BY_EMP[empId]?.length) set.add(empId);
  });

  return set.size;
}
/* =========================
   SNAPSHOT ESPACE
========================= */

function computeSpaceSnapshot(emplacements, stockByEmp) {

  // ✅ DÉFINITION MANQUANTE
  const phys = Object.values(emplacements)
    .filter(e => isZonePicking(e));

  const total = phys.length;

  const occupiedSet = new Set();
  Object.entries(stockByEmp || {}).forEach(([empId, rows]) => {
    if (rows && rows.length) occupiedSet.add(empId);
  });

  const occupied = occupiedSet.size;
  const free = Math.max(0, total - occupied);

  return {
    total,
    occupied,
    free,
    surfaceTotal: total * SURFACE_PAR_EMPLACEMENT,
    surfaceOccupied: occupied * SURFACE_PAR_EMPLACEMENT,
    surfaceFree: free * SURFACE_PAR_EMPLACEMENT,
    tauxUtilisation: total ? (occupied / total) * 100 : 0
  };
}

// ✅ SNAPSHOT ESPACE — APRÈS (INDÉPENDANT UI)
function computeSpaceSnapshotApres(emplacements, stockByEmp) {
  const phys = Object.values(emplacements)
    .filter(e =>
      isZonePicking(e) &&                // ✅ même règle AVANT / APRÈS
      isNiveauValideApres(e.allee, e.travee, e.niveau)
    );

  const total = phys.length;

  const occupiedSet = new Set();
  Object.entries(stockByEmp || {}).forEach(([empId, rows]) => {
    if (rows && rows.length) occupiedSet.add(empId);
  });

  const occupied = occupiedSet.size;
  const free = Math.max(0, total - occupied);

  return {
    total,
    occupied,
    free,
    surfaceTotal: total * SURFACE_PAR_EMPLACEMENT,
    surfaceOccupied: occupied * SURFACE_PAR_EMPLACEMENT,
    surfaceFree: free * SURFACE_PAR_EMPLACEMENT,
    tauxUtilisation: total ? (occupied / total) * 100 : 0
  };
}

function computeSpaceMetrics() {
  const total = countPhysicalEmplacements();
  const occupied = countStockOccupiedEmplacements();
  const free = Math.max(0, total - occupied);

  return {
    total,
    occupied,
    free,
    surfaceTotal: total * SURFACE_PAR_EMPLACEMENT,
    surfaceOccupied: occupied * SURFACE_PAR_EMPLACEMENT,
    surfaceFree: free * SURFACE_PAR_EMPLACEMENT,
    tauxUtilisation: total > 0 ? (occupied / total) * 100 : 0
  };
}
/************************************************
 * SIMULATION PICKING — VERSION PROPRE
 * BLOC F — INDEX DE CLIC & MAPPING SOURIS → EMPID
 ************************************************/

/**
 * Construit un empId à partir des composantes métier
 */
function makeEmpId(allee, travee, niveau, position) {
  return `${allee}${String(travee).padStart(2, "0")}${niveau}${position}`;
}

function rebuildPhysicalGrid(niveau) {
  ROW_INDEX = {};
  let row = 0;

  for (let tr = TRAVEE_MIN; tr <= TRAVEE_MAX; tr++) {
    for (let pos of POSITIONS_PAR_DEFAUT) {
      ROW_INDEX[`${tr}|${pos}`] = row++;
    }

    if (tr === 2) ROW_INDEX.__PASSAGE_2_3 = row++;
    if (tr === 9) ROW_INDEX.__PASSAGE_9_10 = row++;
  }

  ROWS_TOTAL = row;
}

/* =====================================================
   DÉTECTION DES LIGNES DE CHEMIN (VISUEL UNIQUEMENT)
===================================================== */

function isCheminRow(row) {
  return (
    row === ROW_INDEX.__PASSAGE_2_3 ||
    row === ROW_INDEX.__PASSAGE_9_10
  );
}

function getTraveeMidRow(travee) {
  const rows = Object.entries(ROW_INDEX)
    .filter(([key]) => Number(key.split("|")[0]) === travee)
    .map(([, row]) => row);

  if (!rows.length) return null;
  return (Math.min(...rows) + Math.max(...rows)) / 2;
}

/**
 * Reconstruit l’index de clic pour le niveau courant
 * clé = "niveau|alleeIndex|row" → empId
 *
 * row = (travee - 1) * POSITIONS + (position - 1)
 */
function rebuildEmpIndex() {
  EMP_INDEX.clear();

  // ✅ INDEX UNIQUEMENT POUR LA RÉIMPLANTATION
  const niveau = NIV_REIMPLANT;
  if (!niveau) return;

  rebuildPhysicalGrid(niveau);

  for (let ai = 0; ai < ALLEES.length; ai++) {
    const allee = ALLEES[ai];

    for (let tr = TRAVEE_MIN; tr <= TRAVEE_MAX; tr++) {
      for (let pos of POSITIONS_PAR_DEFAUT) {

        if (!isNiveauValideApres(allee, tr, niveau)) continue;

        const row = ROW_INDEX[`${tr}|${pos}`];
        if (row == null) continue;

        const empId = `${allee}${String(tr).padStart(2, "0")}${niveau}${pos}`;
        const key = `${niveau}|${ai}|${row}`;

        EMP_INDEX.set(key, empId);
      }
    }
  }

  console.log("✅ EMP_INDEX reconstruit (réimplantation) :", EMP_INDEX.size);
}
/**
 * Convertit une position souris en cellule écran
 * @returns {{alleeIndex:number, row:number}|null}
 */
function getScreenCellFromMouse(canvas, ev) {
  const rect = canvas.getBoundingClientRect();
  const px = ev.clientX - rect.left - VIEW.offsetX;
  const py = ev.clientY - rect.top - VIEW.offsetY;

  if (px < 0 || py < 0) return null;

  const alleeIndex = Math.floor(px / VIEW.cellW);
  const row = Math.floor(py / VIEW.cellH);

  const maxAllees = ALLEES.length;
  const maxRows = ROWS_TOTAL;

  if (alleeIndex < 0 || alleeIndex >= maxAllees) return null;
  if (row < 0 || row >= maxRows) return null;

  return { alleeIndex, row };
}

/**
 * Retourne l’empId sous la souris (niveau courant)
 */
function getEmpIdFromMouse(canvas, ev) {
  const cell = getScreenCellFromMouse(canvas, ev);
  if (!cell) return null;

  const key = `${NIV_REIMPLANT}|${cell.alleeIndex}|${cell.row}`;
  const empId = EMP_INDEX.get(key);
  if (!empId) return null;

  const e = EMPLACEMENTS[empId];
  if (isZoneInterdite(e)) return null; // 🚫 BLOQUÉ

  return empId;
}
console.log("✅ BLOC F chargé");

/************************************************
 * SIMULATION PICKING — VERSION PROPRE
 * BLOC G — MOTEUR DE CALCUL DES TEMPS
 ************************************************/

/**
 * Convertit un empId (ex: A01B3) en objet exploitable pour le calcul
 * @param {string} empId
 * @returns {{allee:string, travee:number, niveau:string, position:number}|null}
 */
function empFromId(empId) {
  const m = empId.match(/^([A-Z])(\d{2})([A-Z])(\d)$/);
  if (!m) return null;

  return {
    allee: m[1],
    travee: parseInt(m[2], 10),
    niveau: m[3],
    position: parseInt(m[4], 10)
  };
}

/**
 * Calcule le temps total de préparation (en secondes)
 *
 * @param {(ligne:{empId:string, article:string}) => {allee:string,travee:number,niveau:string,position:number}} getEmpFn
 *        Fonction qui retourne l’emplacement à utiliser (AVANT ou APRÈS)
 * @param {Object} T Paramètres temps unitaires
 * @returns {number}
 */

const ENTRY_POINT = {
  allee: "A",
  travee: 9.5 // entre travées 9 et 10
};
// ✅ Coût structurel par allée (A → N)
// représente la profondeur réelle depuis l’entrée
const COST_PAR_ALLEE = 0.8; // secondes par allée (à ajuster finement)
// ✅ Allées de circulation transversales
const CIRCULATION_TRAVEES = [2.5, 9.5];

// ✅ Index numérique d’allée
function alleeIndex(e) {
  return ALLEES.indexOf(e.allee);
}
// ✅ Pénalité structurelle d’éloignement depuis l’allée A
function costEloignementAllee(e) {
  const idxA = alleeIndex(ENTRY_POINT); // toujours 0 (allée A)
  const idxE = alleeIndex(e);
  return Math.abs(idxE - idxA) * COST_PAR_ALLEE;
}
// ✅ Choix de l’allée de circulation la plus proche
function nearestCirculation(travee) {
  return CIRCULATION_TRAVEES.reduce((best, t) =>
    Math.abs(t - travee) < Math.abs(best - travee) ? t : best
  );
}

// === DISTANCE HORIZONTALE ===
// ✅ Distance horizontale réaliste (X + Y via circulation)
// ✅ Distance horizontale réaliste SANS sur-penalisation
function distanceHorizontale(a, b, T) {

  // ✅ CAS 1 — Même allée → déplacement direct (PAS de circulation)
  if (a.allee === b.allee) {
    return Math.abs(a.travee - b.travee) * T.X;
  }

  // ✅ CAS 2 — Changement d’allée → passage par une circulation
  const circ = nearestCirculation(a.travee);

  const dY1 = Math.abs(a.travee - circ);        // vers circulation
  const dX  = Math.abs(alleeIndex(a) - alleeIndex(b)); // changement allée
  const dY2 = Math.abs(b.travee - circ);        // vers cible

  return (dY1 + dY2 + dX) * T.X;
}

function orderByNearest(start, emplacements, T) {
  const remaining = [...emplacements];
  const ordered = [];
  let current = start;

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = distanceHorizontale(current, remaining[0], T);

    for (let i = 1; i < remaining.length; i++) {
      const d = distanceHorizontale(current, remaining[i], T);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }

    const next = remaining.splice(bestIdx, 1)[0];
    ordered.push(next);
    current = next;
  }

  return ordered;
}
/**
 * ✅ Hauteur effective canonique d'une travée
 * - AVANT  : hauteur physique historique
 * - APRÈS  : hauteur réimplantée (HAUTEUR_MAX + DELTA)
 */
function getMaxNiveauEffectif(allee, travee) {
  const key = `${allee}_${String(travee).padStart(2, "0")}`;

  // APRÈS réimplantation
  if (IMPLANTATION_ACTIVE) {
    return getHauteurReimplant(allee, travee);
  }

  // AVANT réimplantation
  return HAUTEUR_MAX[key] || null;
}

function computeVerticalTimeInternal(emp, max, T) {
  if (!max) return 0;

  const niveauxGerbeur = [];
  for (let c = 65; c <= max.charCodeAt(0); c++) {
    const n = String.fromCharCode(c);
    if (NIVEAU_TYPE[n] === "GERBEUR") {
      niveauxGerbeur.push(n);
    }
  }

  if (!niveauxGerbeur.length) return 0;

  const idx = niveauxGerbeur.indexOf(emp.niveau);
  if (idx < 0) return 0;

  return idx * ((T.Zup + T.Zdown) / niveauxGerbeur.length);
}
function computeVerticalTime(emp, T) {
  if (!emp) return 0;
  const max = getMaxNiveauEffectif(emp.allee, emp.travee);
  return computeVerticalTimeInternal(emp, max, T);
}
function computeTotalTime(getEmpFn, T) {
  let total = 0;

  for (const lignes of Object.values(PREPS)) {
    if (!lignes || lignes.length === 0) continue;

    // ✅ Séquenceur → Entrée NEF2
    total += TEMPS_SEQUENCEUR;

    // Emplacements de la préparation
    const emps = lignes
      .map(l => getEmpFn(l))
      .filter(Boolean);

    if (emps.length === 0) continue;

    // ✅ Ordre opérateur réel
    const parcours = orderByNearest(ENTRY_POINT, emps, T);

    // ✅ Entrée NEF2 → premier emplacement (LE PLUS PROCHE)
    total += distanceHorizontale(ENTRY_POINT, parcours[0], T);
total += costEloignementAllee(parcours[0]); // ✅ AJOUT

    for (let i = 0; i < parcours.length; i++) {
      const emp = parcours[i];

      // ✅ Déplacement vertical adaptatif (hauteur constante)
total += computeVerticalTime(emp, T);


      // Gestes opérateur
      total += T.POS + T.PAL + T.UM + T.SCAN;

      // ✅ Vers l’emplacement suivant le plus proche
      if (i < parcours.length - 1) {
        total += distanceHorizontale(emp, parcours[i + 1], T);
      }
    }

    // ✅ Dernier emplacement → Entrée NEF2
   total += distanceHorizontale(
  parcours[parcours.length - 1],
  ENTRY_POINT,
  T
);
total += costEloignementAllee(
  parcours[parcours.length - 1]
); // ✅ AJOUT

    // ✅ Entrée NEF2 → Séquenceur
    total += TEMPS_SEQUENCEUR;
  }

  // Marge finale
  return total * (1 + T.MARGE);
}
function computeGlobalCost(state, T) {

  applyStateToEmplacements(state);

  const temps = computeTotalTime(
    l => empFromId(l.empId),
    T
  );

  const pen = computePenaliteSousDimensionnement();

  return temps + pen;
}
function randomNeighbor(state) {

  const keys = Object.keys(state);
  if (keys.length < 2) return state;

  const k1 = keys[Math.floor(Math.random() * keys.length)];
  const k2 = keys[Math.floor(Math.random() * keys.length)];

  if (k1 === k2) return state;

  // swap familles
  const tmp = state[k1];
  state[k1] = state[k2];
  state[k2] = tmp;

  return state;
}

function anneal(initialState, T) {

  let state = { ...initialState };
  let best = { ...initialState };

  let cost = computeGlobalCost(state, T);
  let bestCost = cost;

  let temperature = 1.0;

  for (let i = 0; i < 5000; i++) {

    const candidate = { ...state };
    randomNeighbor(candidate);

    const candidateCost = computeGlobalCost(candidate, T);
    const delta = candidateCost - cost;

    if (delta < 0 || Math.random() < Math.exp(-delta / temperature)) {
      state = candidate;
      cost = candidateCost;

      if (cost < bestCost) {
        best = { ...state };
        bestCost = cost;
      }
    }

    temperature *= 0.999;
  }

  return best;
}

console.log("✅ BLOC G chargé");
/************************************************
 * VALIDATION MÉTIER — COÛT ABSOLU D’UN EMPLACEMENT
 ************************************************/

function computeEmpAbsoluteCost(emp, T) {
  if (!emp) return Infinity;

  return (
    distanceHorizontale(ENTRY_POINT, emp, T) +
    costEloignementAllee(emp) +
    computeVerticalTime(emp, T)
  );
}
/************************************************
 * VALIDATION MÉTIER — MEILLEUR EMPLACEMENT PLUS BAS
 ************************************************/

function findBestLowerEmp(referenceEmp, zone, T) {
  const refZ = referenceEmp.niveau.charCodeAt(0);

  let best = null;
  let bestCost = Infinity;

  zone.forEach(e => {
    if (
      e.allee === referenceEmp.allee &&
      e.travee === referenceEmp.travee &&
      e.position === referenceEmp.position &&
      e.niveau.charCodeAt(0) < refZ
    ) {
      const c = computeEmpAbsoluteCost(e, T);
      if (c < bestCost) {
        bestCost = c;
        best = e;
      }
    }
  });

  return best;
}
/************************************************
 * VALIDATION MÉTIER — STATUT D’UN EMPLACEMENT
 ************************************************/

function computeVerticalJustificationStatus(emp, zone, T) {
  const costHere = computeEmpAbsoluteCost(emp, T);

  const lower = findBestLowerEmp(emp, zone, T);
  if (!lower) {
    // aucun niveau plus bas disponible
    return { status: "green", delta: 0 };
  }

  const costLower = computeEmpAbsoluteCost(lower, T);
  const delta = costHere - costLower;

  if (delta < -0.5) {
    return { status: "green", delta };
  }
  if (Math.abs(delta) <= 0.5) {
    return { status: "orange", delta };
  }
  return { status: "red", delta };
}

// ===== ANALYSE TEMPS VERTICAUX — FONCTIONS PURES =====

function computeVerticalTimeSnapshot(emp, mode, T) {
  const max =
    mode === "AVANT"
      ? HAUTEUR_MAX[`${emp.allee}_${String(emp.travee).padStart(2, "0")}`]
      : getHauteurReimplant(emp.allee, emp.travee);

  return computeVerticalTimeInternal(emp, max, T);
}
function analyzeVerticalTimesDiff(T) {
  const diff = [];

  Object.values(EMPLACEMENTS).forEach(e => {
    if (!isZonePicking(e)) return;

    const key = `${e.allee}_${String(e.travee).padStart(2, "0")}`;

    const maxAvant = HAUTEUR_MAX[key];
    const maxApres = getHauteurReimplant(e.allee, e.travee);

    if (!maxAvant || !maxApres) return;

    const tAvant = computeVerticalTimeSnapshot(e, "AVANT", T);
const tApres = computeVerticalTimeSnapshot(e, "APRES", T);

    if (tAvant === 0 && tApres === 0) return;

    diff.push({
      allee: e.allee,
      travee: e.travee,
      niveau: e.niveau,
      maxAvant,
      maxApres,
      tAvant,
      tApres,
      delta: tApres - tAvant
    });
  });

  return diff;
}
function summarizeVerticalImpact(diff) {
  const map = {};

  diff.forEach(d => {
    const key = `${d.allee}_${String(d.travee).padStart(2, "0")}`;

    if (!map[key]) {
      map[key] = {
        allee: d.allee,
        travee: d.travee,
        maxAvant: d.maxAvant,
        maxApres: d.maxApres,
        deltaTotal: 0,
        count: 0
      };
    }

    map[key].deltaTotal += d.delta;
    map[key].count++;
  });

  return Object.values(map)
    .map(o => ({
      ...o,
      deltaMoyen: o.deltaTotal / o.count
    }))
    .filter(o => o.maxAvant !== o.maxApres) // ✅ seulement impactés
    .sort((a, b) => Math.abs(b.deltaMoyen) - Math.abs(a.deltaMoyen));
}
// =====================================================
// AFFICHAGE SYNTHÈSE — GAINS TEMPS VERTICAUX AVANT / APRÈS
// =====================================================

function displayVerticalTimeGains(T) {
  const diff = analyzeVerticalTimesDiff(T);
  const summary = summarizeVerticalImpact(diff);


  if (!summary.length) {
    console.log("🟦 Impact temps verticaux — aucun changement détecté");
    return;
  }

  // 🔹 Totaux globaux
  const totalDelta = summary.reduce(
    (sum, s) => sum + s.deltaTotal,
    0
  );

  const avgDelta =
    totalDelta / summary.reduce((s, e) => s + e.count, 0);

  console.group("🟦 Synthèse gains temps verticaux — AVANT / APRÈS");

  console.log(
    `Δ total vertical (tous emplacements) : ${totalDelta.toFixed(2)} s`
  );
  console.log(
    `Δ moyen par emplacement           : ${avgDelta.toFixed(4)} s`
  );

  // 🔹 Tableau détaillé par travée
  console.table(
    summary.map(s => ({
      Allée: s.allee,
      Travée: s.travee,
      "Hauteur AVANT": s.maxAvant,
      "Hauteur APRÈS": s.maxApres,
      "Δ total vertical (s)": s.deltaTotal.toFixed(2),
      "Δ moyen / empl (s)": s.deltaMoyen.toFixed(3)
    }))
  );

  // 🔹 TOP 5 gains
  const topGains = [...summary]
    .sort((a, b) => a.deltaTotal - b.deltaTotal)
    .slice(0, 5);

  console.group("🟢 TOP 5 GAINS (le plus bénéfique)");
  console.table(
    topGains.map(s => ({
      Allée: s.allee,
      Travée: s.travee,
      Gain: (-s.deltaTotal).toFixed(2) + " s"
    }))
  );
  console.groupEnd();

  // 🔹 TOP 5 pertes
  const topLosses = [...summary]
    .sort((a, b) => b.deltaTotal - a.deltaTotal)
    .slice(0, 5);

  console.group("🔴 TOP 5 PERTES (le plus pénalisant)");
  console.table(
    topLosses.map(s => ({
      Allée: s.allee,
      Travée: s.travee,
      Perte: s.deltaTotal.toFixed(2) + " s"
    }))
  );
  console.groupEnd();

  console.groupEnd();
}

/************************************************
 * SIMULATION PICKING — VERSION PROPRE
 * BLOC H — HEATMAP AVANT
 ************************************************/

/**
 * Redimensionne le canvas heatmap
 * À appeler après chargement du DT
 */
function resizeHeatmapCanvas() {
  const heat = document.getElementById("heatmap2D");
  const plan = document.getElementById("plan2D-actuel");
  if (!heat || !plan) return;

  heat.width  = plan.width;
  heat.height = plan.height;
}

/**
 * Gradient simple et lisible (vert → jaune → rouge)
 */
function heatGradient01(t) {
  t = Math.max(0, Math.min(1, t));

  let r, g;
  if (t <= 0.5) {
    const k = t / 0.5;
    r = Math.round(255 * k);
    g = 200;
  } else {
    const k = (t - 0.5) / 0.5;
    r = 255;
    g = Math.round(200 * (1 - k));
  }
  return `rgb(${r},${g},0)`;
}

/**
 * Dessine la heatmap AVANT
 */

function drawHeatmapAvant() {
  const canvas = document.getElementById("heatmap2D");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const niveau = NIV_ACTUEL;
  if (!niveau) return;


  /* =========================
     TITRE
  ========================= */

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#000";
  ctx.font = "bold 13px Arial";
  ctx.textAlign = "left";
  ctx.fillText(
    `Heatmap AVANT — Niveau ${niveau}`,
    VIEW.offsetX,
    VIEW.offsetY - 50
  );
  ctx.restore();

  /* =========================
     LÉGENDES — ALLÉES (A → N)
  ========================= */

  ctx.save();
  ctx.fillStyle = "#000";
  ctx.font = "bold 12px Arial";
  ctx.textAlign = "center";

  for (let ai = 0; ai < ALLEES.length; ai++) {
    const x =
      VIEW.offsetX +
      ai * VIEW.cellW +
      VIEW.cellW / 2;

    ctx.fillText(
      ALLEES[ai],
      x,
      VIEW.offsetY - 18
    );
  }
  ctx.restore();

  /* =========================
     LÉGENDES — TRAVÉES (1 → 16)
  ========================= */

  ctx.save();
  ctx.font = "11px Arial";
  ctx.fillStyle = "#000";
  ctx.textAlign = "right";

  for (let tr = TRAVEE_MIN; tr <= TRAVEE_MAX; tr++) {
    const midRow = getTraveeMidRow(tr);
    if (midRow == null) continue;

    const y =
      VIEW.offsetY +
      (midRow + 0.5) * VIEW.cellH;

    ctx.fillText(
      String(tr),
      VIEW.offsetX - 10,
      y
    );
  }
  ctx.restore();

  /* =========================
     NORMALISATION DES FRÉQUENCES
  ========================= */

  let maxFreq = 1;

  Object.entries(HEATMAP).forEach(([empId, freq]) => {
    const e = EMPLACEMENTS[empId];
    if (!e || e.niveau !== niveau) return;
    if (!emplacementExiste(e.allee, e.travee, e.position, e.niveau)) return;
    if (freq > maxFreq) maxFreq = freq;
  });

  /* =========================
     DESSIN DE LA HEATMAP
  ========================= */

  Object.entries(HEATMAP).forEach(([empId, freq]) => {
    const e = EMPLACEMENTS[empId];
    if (!e || e.niveau !== niveau) return;
    if (!emplacementExiste(e.allee, e.travee, e.position, e.niveau)) return;

    const ai = ALLEES.indexOf(e.allee);
    if (ai < 0) return;

    const row = ROW_INDEX[`${e.travee}|${e.position}`];
    if (row == null) return;

    const t = Math.log(freq + 1) / Math.log(maxFreq + 1);

    const x = VIEW.offsetX + ai * VIEW.cellW;
    const y = VIEW.offsetY + row * VIEW.cellH;

    ctx.fillStyle = heatGradient01(t);
    const cellKey = `${FILTERS.niveau}|${ai}|${row}`;
    

    ctx.fillRect(
      x + 1,
      y + 1,
      VIEW.cellW - 2,
      VIEW.cellH - 2
    );
  });
}

/**
 * Dessine la heatmap APRÈS
 */
function drawHeatmapApres(canvasId = "plan2D-apres") {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const niveau = FILTERS.niveau;
  if (!niveau) {
    ctx.fillStyle = "#000";
    ctx.font = "14px Arial";
    ctx.fillText("Sélectionne un niveau", 20, 30);
    return;
  }

  /* =========================
     TITRE
  ========================= */

  ctx.fillStyle = "#000";
  ctx.font = "bold 14px Arial";
  ctx.textAlign = "left";
  ctx.fillText(`Heatmap APRÈS — Niveau ${niveau}`, 20, 30);

  /* =========================
     LÉGENDES
  ========================= */

  ctx.font = "bold 12px Arial";
  ctx.textAlign = "center";
  for (let ai = 0; ai < ALLEES.length; ai++) {
    const x = VIEW.offsetX + ai * VIEW.cellW + VIEW.cellW / 2;
    ctx.fillText(ALLEES[ai], x, VIEW.offsetY - 22);
  }

  ctx.font = "11px Arial";
ctx.textAlign = "right";

for (let tr = TRAVEE_MIN; tr <= TRAVEE_MAX; tr++) {
  const midRow = getTraveeMidRow(tr);
  if (midRow == null) continue;

  const y = VIEW.offsetY + (midRow + 0.5) * VIEW.cellH;
  ctx.fillText(String(tr), VIEW.offsetX - 12, y);
}

  /* =========================
     CONSTRUCTION HEAT APRÈS
  ========================= */

  const heatApres = {};

  Object.values(PREPS).forEach(lignes => {
    lignes.forEach(l => {
      const newEmp = REF_TO_EMP_APRES?.[l.article];
      if (!newEmp) return;
      heatApres[newEmp] = (heatApres[newEmp] || 0) + 1;
    });
  });

  /* =========================
     NORMALISATION
  ========================= */

  let maxFreq = 1;

  Object.entries(heatApres).forEach(([empId, freq]) => {
    const e = EMPLACEMENTS[empId];
    if (!e || e.niveau !== niveau) return;
    if (!emplacementExiste(e.allee, e.travee, e.position, e.niveau)) return;
    if (freq > maxFreq) maxFreq = freq;
  });

  /* =========================
     DESSIN HEATMAP
  ========================= */

  Object.entries(heatApres).forEach(([empId, freq]) => {
    const e = EMPLACEMENTS[empId];
    if (!e || e.niveau !== niveau) return;
    if (!emplacementExiste(e.allee, e.travee, e.position, e.niveau)) return;

    const ai = ALLEES.indexOf(e.allee);
    if (ai < 0) return;

    const row = ROW_INDEX[`${e.travee}|${e.position}`];
if (row == null) return;
    const t = Math.log(freq + 1) / Math.log(maxFreq + 1);

    const x = VIEW.offsetX + ai * VIEW.cellW;
    const y = VIEW.offsetY + row * VIEW.cellH;

    ctx.fillStyle = heatGradient01(t);
    ctx.fillRect(x + 1, y + 1, VIEW.cellW - 2, VIEW.cellH - 2);
  });
}

console.log("✅ BLOC H chargé");

/************************************************
 * SIMULATION PICKING — VERSION PROPRE
 * BLOC I — PLAN IMPLANTATION (FAMILLE ONLY)
 ************************************************/

/**
 * Détermine si un emplacement correspond à la famille filtrée.
 */
function empMatchesFamille(empId, famille) {
  if (!famille) return true;
  return EMPLACEMENTS[empId]?.famille === famille;
}
/**
 * ✅ Niveau fantôme visuel
 * - utilisé UNIQUEMENT pour l’affichage
 * - jamais physique, jamais cliquable
 */
function isGhostNiveauVisuel(allee, travee, niveau) {
  const minNiv = getNiveauMin(allee, travee);
  return niveau.charCodeAt(0) < minNiv.charCodeAt(0);
}
/**
 * Dessine le plan d’implantation
 */

function drawZonePlan() {
  const canvas = getActivePlanCanvas();
  if (!canvas) return;

  const isReimplantation =
    document
      .getElementById("tab-reimplantation")
      ?.classList.contains("active");

  const niveau = isReimplantation ? NIV_REIMPLANT : NIV_ACTUEL;
  if (!niveau) return;

  if (isReimplantation && ROWS_TOTAL === 0) {
    rebuildEmpIndex();
  }

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  /* ===== TITRE ===== */
  ctx.fillStyle = "#000";
  ctx.font = "bold 14px Arial";
  ctx.textAlign = "left";
  ctx.fillText(
    `Implantation — Niveau ${niveau}` +
      (FILTERS.famille ? ` — Famille ${FILTERS.famille}` : ""),
    20,
    30
  );

  /* ===== LÉGENDES ===== */

  // Allées
  ctx.font = "bold 12px Arial";
  ctx.textAlign = "center";
  for (let ai = 0; ai < ALLEES.length; ai++) {
    const x = VIEW.offsetX + ai * VIEW.cellW + VIEW.cellW / 2;
    ctx.fillText(ALLEES[ai], x, VIEW.offsetY - 22);
  }

  // Positions
  ctx.font = "11px Arial";
  ctx.textAlign = "right";

  // Travées (basées sur la grille réelle)
  for (let tr = TRAVEE_MIN; tr <= TRAVEE_MAX; tr++) {
    const rows = Object.entries(ROW_INDEX)
      .filter(([k]) => k.startsWith(`${tr}|`))
      .map(([, r]) => r);

    if (!rows.length) continue;
    const yMid =
      VIEW.offsetY +
      ((Math.min(...rows) + Math.max(...rows)) / 2) * VIEW.cellH;

    ctx.fillText(String(tr), VIEW.offsetX - 12, yMid);
  }

  /* ===== DESSIN DES CHEMINS (LIGNES VIDES) ===== */

const cheminRows = [
  ROW_INDEX.__PASSAGE_2_3,
  ROW_INDEX.__PASSAGE_9_10
].filter(r => r != null);

cheminRows.forEach(row => {
  const y = VIEW.offsetY + row * VIEW.cellH;

  ctx.save();
  ctx.fillStyle = "#d0d0d0";
  ctx.globalAlpha = 0.85;

  ctx.fillRect(
    VIEW.offsetX,
    y,
    ALLEES.length * VIEW.cellW,
    VIEW.cellH
  );

  ctx.restore();
});

  /* ===== DESSIN DES CASES ===== */

  for (let ai = 0; ai < ALLEES.length; ai++) {
    const allee = ALLEES[ai];

    for (let tr = TRAVEE_MIN; tr <= TRAVEE_MAX; tr++) {
      for (let pos = 1; pos <= POSITIONS; pos++) {

        const row = ROW_INDEX[`${tr}|${pos}`];
        if (row == null) continue;

        const empId = `${allee}${String(tr).padStart(2, "0")}${niveau}${pos}`;
        const e = EMPLACEMENTS[empId];

// ===== DONNÉES FAMILLE VISUELLE =====
let famille = e?.famille || null;
let isGhost = false;

// 🔮 CAS FANTÔME : niveau < niveau min, mais colonne réelle existe
if (!e && isGhostNiveauVisuel(allee, tr, niveau)) {
  const niveauMin = getNiveauMin(allee, tr);
  const empIdMin =
    `${allee}${String(tr).padStart(2, "0")}${niveauMin}${pos}`;

  const base = EMPLACEMENTS[empIdMin];
  if (base?.famille) {
    famille = base.famille;
    isGhost = true;
  }
}
        const x = VIEW.offsetX + ai * VIEW.cellW;
        const y = VIEW.offsetY + row * VIEW.cellH;

const zoneInterdite = isZoneInterdite(e);
const filteredOut = !empMatchesFamille(empId, FILTERS.famille);

// 🎨 fond
if (zoneInterdite) {
  ctx.fillStyle = "#cfcfcf"; // gris interdit
} else {
  ctx.save();

if (isGhost) {
  ctx.globalAlpha = 0.25; // 👻 TRANSPARENCE FANTÔME
}

ctx.fillStyle = filteredOut ? "#ffffff" : colorByFamille(famille);
ctx.fillRect(
  x + 1,
  y + 1,
  VIEW.cellW - 2,
  VIEW.cellH - 2
);

ctx.restore();
}

/* ===== VALIDATION MÉTIER (VERTICAL) ===== */
if (
  SHOW_VERTICAL_VALIDATION &&
  VALIDATION_VERTICAL_CACHE &&
  VALIDATION_VERTICAL_CACHE[empId] &&
  !isGhost
) {
  const v = VALIDATION_VERTICAL_CACHE[empId];

  let color = null;
  if (v.status === "green") color = "rgba(0,180,0,0.45)";
  if (v.status === "orange") color = "rgba(255,165,0,0.45)";
  if (v.status === "red") color = "rgba(220,0,0,0.45)";

  if (color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.fillRect(
      x + 2,
      y + 2,
      VIEW.cellW - 4,
      VIEW.cellH - 4
    );
    ctx.restore();
  }
}

if (zoneInterdite) {
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "#eeeeee";
  ctx.fillRect(x + 1, y + 1, VIEW.cellW - 2, VIEW.cellH - 2);
  ctx.restore();
}
        /* ===== CHEMIN VISUEL (GRISÉ UNIQUEMENT) ===== */
        if (isCheminRow(row)) {
          ctx.save();
          ctx.globalAlpha = 0.55;
          ctx.fillStyle = "#9e9e9e";
          ctx.fillRect(
            x + 1,
            y + 1,
            VIEW.cellW - 2,
            VIEW.cellH - 2
          );
          ctx.restore();
        }

        /* ===== SÉLECTION ===== */
        if (SELECTED.has(empId)) {
          ctx.strokeStyle = "#0066ff";
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 2, y + 2, VIEW.cellW - 4, VIEW.cellH - 4);
          ctx.lineWidth = 1;
        }

        /* ===== TEXTE FAMILLE ===== */
        if (famille && !filteredOut && !isGhost) {
          ctx.fillStyle = "#000";
          ctx.font = "bold 10px Arial";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(
            labelFamillePosition(famille),
            x + VIEW.cellW / 2,
            y + VIEW.cellH / 2
          );
        }
      }
    }
  }
/* =========================
   DEBUG VISUEL (ROWS / PASSAGES / EMPID)
========================= */
if (window.DEBUG_PLAN) {
  ctx.save();

  /* === DEBUG ROWS === */
  ctx.font = "10px monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  for (let row = 0; row < ROWS_TOTAL; row++) {
    const y = VIEW.offsetY + row * VIEW.cellH;

    // Fond alterné
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = row % 2 === 0 ? "#0099ff" : "#ff3300";
    ctx.fillRect(
      VIEW.offsetX,
      y,
      ALLEES.length * VIEW.cellW,
      VIEW.cellH
    );

    // Label row
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#000";
    ctx.fillText(`row ${row}`, 6, y + 2);

    // Passage
    if (isCheminRow(row)) {
      ctx.fillStyle = "red";
      ctx.fillText("PASSAGE", 60, y + 2);
    }
  }

  /* === DEBUG EMPID === */
  ctx.font = "9px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (let ai = 0; ai < ALLEES.length; ai++) {
    for (let row = 0; row < ROWS_TOTAL; row++) {
      const key = `${NIV_REIMPLANT}|${ai}|${row}`;
      const empId = EMP_INDEX.get(key);
      if (!empId) continue;

      const x =
        VIEW.offsetX + ai * VIEW.cellW + VIEW.cellW / 2;
      const y =
        VIEW.offsetY + row * VIEW.cellH + VIEW.cellH / 2;

      ctx.fillStyle = "#000";
      ctx.fillText(empId, x, y);
    }
  }

  ctx.restore();
}
  updateToolbarInfo();
}

console.log("ROWS_TOTAL =", ROWS_TOTAL);
console.log("ROW_INDEX keys", Object.keys(ROW_INDEX).slice(0,10));
console.log("EMP_INDEX size", EMP_INDEX.size);
console.log("✅ BLOC I chargé");

function updateAutDetails() {
  const box = document.getElementById("autDetailsContent");
  if (!box) return;

  if (!AUT_GEST_DETAILS || Object.keys(AUT_GEST_DETAILS).length === 0) {
    box.textContent = "AUT (Autres) : aucun détail.";
    return;
  }

  box.innerHTML = Object.entries(AUT_GEST_DETAILS)
  .filter(([fam]) => fam !== "AUT") // ✅ AUT n’est pas un GEST métier
  .sort((a, b) => b[1] - a[1])
  .map(([fam, n]) => `<div><b>${fam}</b> : ${n}</div>`)
  .join("");
}

/************************************************
 * SIMULATION PICKING — VERSION PROPRE
 * BLOC J — INTERACTION PLAN (FAMILLE ONLY)
 ************************************************/

let DRAG_START = null;
let DRAG_IN_PROGRESS = false;

/**
 * Sélection par rectangle (mapping CANONIQUE)
 */
function selectRectangle(c1, c2, additive) {
  if (!additive) SELECTED.clear();

  const minA = Math.min(c1.alleeIndex, c2.alleeIndex);
  const maxA = Math.max(c1.alleeIndex, c2.alleeIndex);
  const minR = Math.min(c1.row, c2.row);
  const maxR = Math.max(c1.row, c2.row);

  for (let ai = minA; ai <= maxA; ai++) {
    for (let r = minR; r <= maxR; r++) {
      const key = `${NIV_REIMPLANT}|${ai}|${r}`;
      const empId = EMP_INDEX.get(key);
      if (!empId) continue;

      const e = EMPLACEMENTS[empId];
      if (isZoneInterdite(e)) continue;

      SELECTED.add(empId);
    }
  }
}

/**
 * Bind des interactions souris (UNE SEULE FOIS)
 */
function bindPlanInteractionOnce() {
  const canvas = document.getElementById("plan2D-reimplantation");
  if (!canvas) return;

  if (canvas.dataset.bound === "1") return;
  canvas.dataset.bound = "1";
  canvas.style.pointerEvents = "auto";

  /* ===== DÉBUT DRAG ===== */
  canvas.addEventListener("mousedown", ev => {
    if (ev.button !== 0) return;

    const cell = getScreenCellFromMouse(canvas, ev);
    if (!cell) return;

    DRAG_START = cell;
    DRAG_IN_PROGRESS = false;
  });

  /* ===== FIN DRAG ===== */
  canvas.addEventListener("mouseup", ev => {
    if (!DRAG_START) return;

    const endCell = getScreenCellFromMouse(canvas, ev);
    if (!endCell) {
      DRAG_START = null;
      return;
    }

    DRAG_IN_PROGRESS = true;
    selectRectangle(DRAG_START, endCell, ev.shiftKey);
    DRAG_START = null;

    drawZonePlan();
  });

  /* ===== CLIC SIMPLE ===== */
  canvas.addEventListener("click", ev => {
    if (DRAG_IN_PROGRESS) {
      DRAG_IN_PROGRESS = false;
      return;
    }

    const empId = getEmpIdFromMouse(canvas, ev);
    if (!empId) return;

    if (ev.shiftKey) {
      SELECTED.has(empId)
        ? SELECTED.delete(empId)
        : SELECTED.add(empId);
    } else {
      SELECTED.clear();
      SELECTED.add(empId);
    }

    drawZonePlan();
  });

  /* ===== VIDER SÉLECTION ===== */
  document.getElementById("btnClearSel")?.addEventListener("click", () => {
    SELECTED.clear();
    drawZonePlan();
    computeAideImplantation();
  });

  /* ===== APPLIQUER FAMILLE ===== */
  document.getElementById("btnApply")?.addEventListener("click", () => {
  if (SELECTED.size === 0) {
    alert("Sélectionne au moins une case.");
    return;
  }

  SELECTED.forEach(empId => {

    // ✅ Parse même si l’emplacement n’existe pas physiquement
    const m = empId.match(/^([A-Z])(\d{2})([A-Z])(\d)$/);
    if (!m) return;

    const e = {
      allee: m[1],
      travee: parseInt(m[2], 10),
      niveau: m[3],      // peut être A/B/C/D
      position: parseInt(m[4], 10)
    };

    implanterColonneManuelle(e, ACTIVE_FAMILLE);
  });

  SELECTED.clear();
  IMPLANTATION_ACTIVE = true;
  rebuildEmplCountByFam();
  computeAideImplantation();
  drawZonePlan();
});
}
console.log("✅ BLOC J chargé");

/************************************************
 * SIMULATION PICKING — VERSION PROPRE
 * BLOC K — UI (FAMILLE & NIVEAUX)
 ************************************************/
// =====================================================
// UI — Sélecteur mode FAST / PRECISE
// =====================================================
function bindAutoImplantModeSelector() {
  const sel = document.getElementById("autoImplantMode");
  if (!sel) return;

  // valeur initiale
  sel.value = window.AUTO_IMPLANT_MODE || "FAST";

  sel.addEventListener("change", () => {
  if (sel.value === "PRECISE" && !IMPLANTATION_ACTIVE) {
    alert(
      "⚠️ Le mode PRECISE nécessite une implantation automatique.\n" +
      "Lance d’abord l’implantation par blocs."
    );
    sel.value = "FAST";
    window.AUTO_IMPLANT_MODE = "FAST";
    return;
  }

  window.AUTO_IMPLANT_MODE = sel.value;
  console.log("🔧 Mode auto‑implantation =", window.AUTO_IMPLANT_MODE);
});
}
/* =========================
   FILTRE NIVEAU
========================= */

function fillLevelSelect() {
  const levelSel = document.getElementById("levelSelect");
  if (!levelSel) return;

  levelSel.innerHTML = "";

  const niveaux = getPossibleLevelsApres();

niveaux.forEach(niv => {
    const opt = document.createElement("option");
    opt.value = niv;
    opt.textContent = `Niveau ${niv}`;
    levelSel.appendChild(opt);
  });

  const isReimplantation =
  document.getElementById("tab-reimplantation")?.classList.contains("active");

if (isReimplantation) {
  if (!niveaux.includes(NIV_REIMPLANT)) {
    NIV_REIMPLANT = niveaux[0] || "";
  }
  levelSel.value = NIV_REIMPLANT;
} else {
  if (!niveaux.includes(NIV_ACTUEL)) {
    NIV_ACTUEL = niveaux[0] || "";
  }
  levelSel.value = NIV_ACTUEL;
}
}
/* =========================
   FILTRE FAMILLE (SELECT)
========================= */

function fillFamilleFilter() {
  const famSel = document.getElementById("familleSelect");
  if (!famSel) return;

  famSel.innerHTML = "";

  // Option "Toutes"
  const allOpt = document.createElement("option");
  allOpt.value = "";
  allOpt.textContent = "Toutes";
  famSel.appendChild(allOpt);

  // Familles autorisées : AUT + structurantes
  const famillesActives = [
    "AUT",
    ...STRUCTURING_FAMILIES
  ];

  famillesActives.forEach(code => {
    const label = FAMILLES[code] || code;

    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = `${code} – ${label}`;
    famSel.appendChild(opt);
  });

  famSel.value = FILTERS.famille || "";
}

/* =========================
   PALETTE FAMILLE (PINCEAU)
========================= */

function initFamillePalette() {
  const palette = document.getElementById("gestPalette");
  if (!palette) return;

  palette.innerHTML = "";

  // Bouton effacer
  const noneBtn = document.createElement("button");
  noneBtn.textContent = "Aucune (effacer)";
  noneBtn.className = "btn btn-secondary";
  noneBtn.onclick = () => {
    ACTIVE_FAMILLE = null;
    updateToolbarInfo();
  };
  palette.appendChild(noneBtn);

  // Boutons familles (STRUCTURANTES + AUT)
const famillesActives = [
  "AUT","TA","EL","AC","RO","HV","CO","EP","IN","SE"
];

famillesActives.forEach(code => {

  const btn = document.createElement("button");
  btn.textContent = code;
  btn.className = "btn";
  btn.style.background = colorByFamille(code);
  btn.style.border = "1px solid #333";
  btn.style.marginRight = "4px";

  btn.onclick = () => {
    ACTIVE_FAMILLE = code;
    updateToolbarInfo();
  };

  palette.appendChild(btn);
});
}

/* =========================
   BIND UI (UNE SEULE FOIS)
========================= */

function bindUIOnce() {
  if (window.__uiBound) return;
  window.__uiBound = true;

  const levelSel = document.getElementById("levelSelect");
  const famSel = document.getElementById("familleSelect");

  // Changement de niveau
  levelSel?.addEventListener("change", () => {

  if (INTERNAL_LEVEL_UPDATE) return; // 🔒 anti-boucle UI

  const isReimplantation =
    document
      .getElementById("tab-reimplantation")
      ?.classList.contains("active");

  if (isReimplantation) {
    // ✅ onglet Réimplantation
    NIV_REIMPLANT = levelSel.value;

    ensureFullLevel(NIV_REIMPLANT);
    rebuildEmpIndex();
    resizeImplantationCanvas();
    drawZonePlan();

    rebuildEmplCountByFam();
    computeAideImplantation();

  } else {
    // ✅ onglet Situation actuelle (heatmap)
    NIV_ACTUEL = levelSel.value;
    resizeHeatmapCanvas();
    drawHeatmapAvant();
    drawZonePlan();
  }
});
}
/************************************************
 * UI — Gestion des onglets
 ************************************************/
function rebuildLevelsAfterHeightChange() {

  ALLEES.split("").forEach(allee => {
    for (let tr = TRAVEE_MIN; tr <= TRAVEE_MAX; tr++) {
      const maxNiv = getHauteurReimplant(allee, tr);
      if (!maxNiv) continue;

      for (
        let n = "A";
        n <= maxNiv;
        n = String.fromCharCode(n.charCodeAt(0) + 1)
      ) {
        // volontairement vide (création différée)
      }
    }
  });

  const niveaux = getExistingLevels();

  if (!niveaux.includes(NIV_REIMPLANT)) {
    NIV_REIMPLANT = niveaux[0] || "";
  }

  rebuildEmpIndex();
  resizeImplantationCanvas();
  drawZonePlan();
  computeAideImplantation();

  console.log("✅ Niveaux ajoutés — implantation conservée");
}

function openTab(tabId, btn) {
  document.querySelectorAll(".tab-content")
    .forEach(div => div.classList.remove("active"));
  document.querySelectorAll(".tab")
    .forEach(b => b.classList.remove("active"));
document
  .getElementById("btnAutoImplantImportance")
  ?.addEventListener("click", () => {
    autoImplantationParImportance();
  });
  document.getElementById(tabId)?.classList.add("active");
  btn?.classList.add("active");

  const heat = document.getElementById("heatmap2D");
  if (heat) {
    heat.style.display =
      tabId === "tab-actuel" ? "block" : "none";
  }

  /* =========================
     ONGLET ACTUEL
  ========================= */
  if (tabId === "tab-actuel") {
    NIV_ACTUEL ||= getExistingLevels()[0];
    resizeHeatmapCanvas();
    drawHeatmapAvant();
  }

  /* =========================
     ONGLET RÉIMPLANTATION
  ========================= */
  if (tabId === "tab-reimplantation") {
  const niveaux = getPossibleLevelsApres();
if (!niveaux.includes(NIV_REIMPLANT)) {
  NIV_REIMPLANT = niveaux[0] || "";
}
  fillLevelSelect();
  rebuildEmpIndex();

  initReimplantHeightUI(); // ✅ ICI EXACTEMENT
}

  resizeImplantationCanvas();
  drawZonePlan();
}

/* =========================
   INIT UI GLOBAL
========================= */
function initUI() {
  fillLevelSelect();
  fillFamilleFilter();
  initFamillePalette();
  bindUIOnce();
  bindAutoImplantModeSelector(); // ✅ ICI
  updateToolbarInfo();
  initHeightEditor();
}
console.log("✅ initUI OK");


console.log("✅ BLOC K chargé");

/* =====================================================
   RÉIMPLANTATION — UI AJUSTEMENT DES NIVEAUX (NOUVELLE)
===================================================== */
function getSelectedReimpTravees() {
  const sel = document.getElementById("reimpTravee");
  if (!sel) return [];

  return Array.from(sel.selectedOptions)
    .map(o => Number(o.value))
    .filter(n => !isNaN(n));
}
function adjustReimpUI(delta) {
  const allee = reimpAllee.value;
  const travees = getSelectedReimpTravees();

  if (!travees || travees.length === 0) {
    alert("Sélectionne au moins une travée.");
    return;
  }
IMPLANTATION_ACTIVE = true; // 🔑 CRUCIAL

  travees.forEach(tr => {
    const key = `${allee}_${String(tr).padStart(2, "0")}`;

    // ✅ structure robuste
    DELTA_NIVEAUX_REIMPLANT[key] ??= { ETAGERE: 0, LISSE: 0 };

    DELTA_NIVEAUX_REIMPLANT[key][MODE_AJOUT_NIVEAU] += delta;

// 🔒 sécurité
DELTA_NIVEAUX_REIMPLANT[key][MODE_AJOUT_NIVEAU] =
  Math.max(0, DELTA_NIVEAUX_REIMPLANT[key][MODE_AJOUT_NIVEAU]);

// ✅ ÉTAGÈRE = SOL (clé métier!)
if (MODE_AJOUT_NIVEAU === "ETAGERE" && delta > 0) {
  const base = HAUTEUR_MAX[key];
  if (base) {
    const baseIdx = base.charCodeAt(0) - 65;
    const idx =
      baseIdx +
      DELTA_NIVEAUX_REIMPLANT[key].ETAGERE +
      DELTA_NIVEAUX_REIMPLANT[key].LISSE;

    const newLevel = String.fromCharCode(65 + idx);
    NIVEAU_TYPE[newLevel] = "SOL"; // 🔑
  }
}

    const base = HAUTEUR_MAX[key];
    if (!base) return;

    const baseIdx = base.charCodeAt(0) - 65;
    const nbE = DELTA_NIVEAUX_REIMPLANT[key].ETAGERE;
    const nbL = DELTA_NIVEAUX_REIMPLANT[key].LISSE;
    const total = nbE + nbL;

    // ✅ création physique réelle
    for (let i = 1; i <= total; i++) {
      const niv = String.fromCharCode(65 + baseIdx + i);
      ensurePhysicalLevelFor(allee, tr, niv);

      if (!(niv in NIVEAU_TYPE)) {
        NIVEAU_TYPE[niv] = i <= nbE ? "SOL" : "LISSES";
      }
    }
  });

  ensureFullLevel(NIV_REIMPLANT);
  rebuildEmpIndex();
  resizeImplantationCanvas();
  drawZonePlan();
  computeAideImplantation();
  updateReimpHeightInfo();
  updateReimpCompositionUI();
}
function initReimplantHeightUI() {
  const selA = document.getElementById("reimpAllee");
  const selT = document.getElementById("reimpTravee");

  // 🔴 AJOUT ICI — LIAISON TYPE D’AJOUT
  const selMode = document.getElementById("modeAjoutNiveau");
  if (selMode) {
    // valeur initiale
    MODE_AJOUT_NIVEAU = selMode.value;

    // mise à jour quand l’utilisateur change le select
    selMode.addEventListener("change", () => {
      MODE_AJOUT_NIVEAU = selMode.value;
      updateReimpHeightInfo();
    });
  }
  // 🔴 FIN AJOUT

  if (!selA || !selT) return;

  // Allées
  selA.innerHTML = "";
  ALLEES.split("").forEach(a => {
    const opt = document.createElement("option");
    opt.value = a;
    opt.textContent = a;
    selA.appendChild(opt);
  });

  // Travées
  selT.innerHTML = "";
  for (let tr = TRAVEE_MIN; tr <= TRAVEE_MAX; tr++) {
    const opt = document.createElement("option");
    opt.value = tr;
    opt.textContent = String(tr).padStart(2, "0");
    selT.appendChild(opt);
  }

  selA.addEventListener("change", () => {
  updateReimpHeightInfo();
  updateReimpCompositionUI();
});
  selT.addEventListener("change", updateReimpHeightInfo);

  updateReimpHeightInfo();
}

function updateReimpHeightInfo() {
  const allee = reimpAllee.value;
  const travees = getSelectedReimpTravees();
if (travees.length !== 1) {
  // UI mono-travée uniquement
  document.getElementById("reimpBaseHeight").textContent = "—";
  document.getElementById("reimpDelta").textContent = "—";
  document.getElementById("reimpFinalHeight").textContent = "—";
  return;
}
const tr = travees[0];
  const key = `${allee}_${String(tr).padStart(2, "0")}`;

  const base = HAUTEUR_MAX[key];
  const d = DELTA_NIVEAUX_REIMPLANT[key] || { ETAGERE: 0, LISSE: 0 };
const delta = d.ETAGERE + d.LISSE;

  document.getElementById("reimpBaseHeight").textContent = base || "—";
  document.getElementById("reimpDelta").textContent =
    delta >= 0 ? `+${delta}` : delta;

  if (!base) {
    document.getElementById("reimpFinalHeight").textContent = "—";
    return;
  }

  const baseIdx = base.charCodeAt(0) - 65;
  const finalIdx = Math.max(0, baseIdx + delta);

  document.getElementById("reimpFinalHeight").textContent =
    String.fromCharCode(65 + finalIdx);
}
// =====================================================
// RÉIMPLANTATION — CALCUL DES AJOUTS RÉELS (PAR TRAVÉE)
// =====================================================

function computeAddedLevelsBySelection(allee, travees) {
  const result = {
    perTravee: [],
    totalSol: 0,
    totalLisses: 0,
    totalLevels: 0
  };

  travees.forEach(tr => {
    const key = `${allee}_${String(tr).padStart(2, "0")}`;
    const base = HAUTEUR_MAX[key];
    if (!base) return;

    const d = DELTA_NIVEAUX_REIMPLANT[key] || { ETAGERE: 0, LISSE: 0 };
    const sol = d.ETAGERE || 0;
    const lisses = d.LISSE || 0;
    const total = sol + lisses;

    if (total <= 0) return;

    result.perTravee.push({
      travee: tr,
      sol,
      lisses,
      total
    });

    result.totalSol += sol;
    result.totalLisses += lisses;
    result.totalLevels += total;
  });

  return result;
}
function aggregateAddedLevelsByCount(summary) {
  const groups = {};

  summary.perTravee.forEach(t => {
    groups[t.count] ??= [];
    groups[t.count].push(t.travee);
  });

  return Object.entries(groups)
    .map(([count, travees]) => ({
      count: Number(count),
      travees,
      nb: travees.length
    }))
    .sort((a, b) => b.count - a.count);
}
function setAjoutMode(mode) {
  if (mode !== "ETAGERE" && mode !== "LISSE") return;
  MODE_AJOUT_NIVEAU = mode;
}

// =====================================================
// AFFICHAGE — AJOUTS RÉELS (UX MÉTIER)
// =====================================================
function updateReimpCompositionUI() {
  const solLine   = document.getElementById("reimpSolLine");
  const lisseLine = document.getElementById("reimpLisseLine");
  const solCount  = document.getElementById("reimpSolCount");
  const lisseCount= document.getElementById("reimpLisseCount");
  const impactEl  = document.getElementById("reimpImpact");

  if (!solLine || !lisseLine || !impactEl) return;

  const allee = reimpAllee.value;
  const travees = getSelectedReimpTravees();

  if (!travees.length) {
    solLine.style.display = "none";
    lisseLine.style.display = "none";
    impactEl.textContent = "—";
    return;
  }

  const summary = computeAddedLevelsBySelection(allee, travees);

  // --- ÉTAGÈRES ---
  if (summary.totalSol > 0) {
    solLine.style.display = "block";
    solCount.textContent = summary.totalSol;
  } else {
    solLine.style.display = "none";
  }

  // --- LISSES ---
  if (summary.totalLisses > 0) {
    lisseLine.style.display = "block";
    lisseCount.textContent = summary.totalLisses;
  } else {
    lisseLine.style.display = "none";
  }

  // --- IMPACT VERTICAL ---
  const impact = summary.totalLisses > 0 ? "augmenté" : "neutre";
  impactEl.textContent = impact;
  impactEl.style.color =
    impact === "augmenté" ? "#c62828" : "#2e7d32";
}

/************************************************
 * SIMULATION PICKING — VERSION PROPRE
 * BLOC K2 — RESIZE CANVAS & AIDE À L’IMPLANTATION
 ************************************************/

/* =========================
   RESIZE CANVAS IMPLANTATION
========================= */

function resizeImplantationCanvas() {
  const canvas = getActivePlanCanvas();
  if (!canvas) return;

  // ✅ DPR ROBUSTE
  let dpr = window.devicePixelRatio || 1;
  if (dpr < 1) dpr = 1; // 🔒 PROTECTION CRUCIALE

  const cols = ALLEES.length;
  const rows = ROWS_TOTAL;

  const logicalWidth  = VIEW.offsetX + cols * VIEW.cellW + 40;
  const logicalHeight = VIEW.offsetY + rows * VIEW.cellH + 40;

  // ✅ résolution réelle canvas
  canvas.width  = Math.round(logicalWidth * dpr);
  canvas.height = Math.round(logicalHeight * dpr);

  // ✅ taille CSS VISUELLE
  canvas.style.width  = `${logicalWidth}px`;
  canvas.style.height = `${logicalHeight}px`;

  const ctx = canvas.getContext("2d");

  // ✅ reset + scale SAFE
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  console.log(
    "✅ Canvas implantation corrigé SAFE:",
    logicalWidth,
    logicalHeight,
    "dpr=",
    dpr
  );
}

/************************************************
 * RÉIMPLANTATION — AJUSTEMENT DES NIVEAUX (APRÈS)
 ************************************************/

function adjustReimplantLevels(delta) {
  const allee = heightAllee.value;
  const tr = heightTravee.value;
  const key = `${allee}_${String(tr).padStart(2, "0")}`;

  DELTA_NIVEAUX_REIMPLANT[key] ??= { ETAGERE: 0, LISSE: 0 };
DELTA_NIVEAUX_REIMPLANT[key][MODE_AJOUT_NIVEAU] += delta;
DELTA_NIVEAUX_REIMPLANT[key][MODE_AJOUT_NIVEAU] =
  Math.max(0, DELTA_NIVEAUX_REIMPLANT[key][MODE_AJOUT_NIVEAU]);

  console.log(
    "🔧 Δ niveaux réimplantation",
    key,
    DELTA_NIVEAUX_REIMPLANT[key]
  );

  rebuildEmpIndex();
  resizeImplantationCanvas();
  drawZonePlan();
  computeAideImplantation();
  updateReimpCompositionUI();
}

console.log("✅ BLOC K2 chargé");
/************************************************
 * SIMULATION PICKING — VERSION PROPRE
 * BLOC L — ORCHESTRATION FINALE
 ************************************************/

let INITIAL_IMPLANTATION = {}; // empId -> famille (état initial)

/**
 * Parse une date Excel ou texte JJ/MM/AAAA
 */
function parseExcelDate(v) {
  if (!v) return null;

  if (typeof v === "number") {
    return new Date(Math.round((v - 25569) * 86400 * 1000));
  }

  if (typeof v === "string") {
    const m = v.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) {
      return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    }
  }
  return null;
}

/************************************************
 * ANALYSE HISTORIQUE — SOCLE MÉTIER
 ************************************************/

function analyzeHistoricalLoad() {
  const WINDOW_DAYS = 30;
  const WINDOW_MS = WINDOW_DAYS * 24 * 3600 * 1000;

  // Liste des préparations avec date + familles présentes
  const prepList = Object.entries(PREPS)
    .map(([prepId, lignes]) => ({
      prepId,
      date: PREP_DATES[prepId],
      familles: new Set(
        lignes
          .map(l =>
            getFamilleImplantation(
              ARTICLE_DATA[l.article]?.familleNorm
            )
          )
          .filter(f => f && f !== "AUT")
      )
    }))
    .filter(p => p.date instanceof Date && !isNaN(p.date))
    .sort((a, b) => a.date - b.date);

  if (prepList.length === 0) {
    console.warn("⚠️ Aucun historique exploitable");
    HISTO_ANALYSIS = {};
    return;
  }

  // Collecte des échantillons de congestion par famille
  const samplesByFam = {};
  let left = 0;

  for (let right = 0; right < prepList.length; right++) {
    const refDate = prepList[right].date;

    // Fenêtre glissante
    while (refDate - prepList[left].date > WINDOW_MS) {
      left++;
    }

    // Préparations actives dans la fenêtre
    const activePreps = prepList.slice(left, right + 1);

    // Comptage de prépas simultanées par famille
    const countByFam = {};

    activePreps.forEach(p => {
      p.familles.forEach(fam => {
        countByFam[fam] = (countByFam[fam] || 0) + 1;
      });
    });

    Object.entries(countByFam).forEach(([fam, n]) => {
      samplesByFam[fam] ??= [];
      samplesByFam[fam].push(n);
    });
  }

  // Calcul moyenne & P80 de congestion
  const avgFluxByFam = {};
  const p80FluxByFam = {};

  Object.entries(samplesByFam).forEach(([fam, arr]) => {
    if (!arr.length) return;

    avgFluxByFam[fam] =
      arr.reduce((a, b) => a + b, 0) / arr.length;

    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.floor(0.8 * (sorted.length - 1));
    p80FluxByFam[fam] = sorted[idx];
  });

  // ✅ Résultat FINAL : congestion simultanée par famille
  HISTO_ANALYSIS = {
    avgFluxByFam,
    p80FluxByFam
  };

  console.log("✅ Congestion par famille calculée", HISTO_ANALYSIS);
}

/************************************************
 * NETTOYAGE HISTORIQUE — COHÉRENCE FAMILLES
 ************************************************/

function nettoyerHistoriqueFamilles() {
  if (!HISTO_ANALYSIS || !ARTICLE_DATA) return;

  const famillesValides = new Set(
    Object.values(ARTICLE_DATA).map(a => a.famille)
  );

  ["capByFam", "maxEmplByFam", "avgEmplByFam", "p80EmplByFam"].forEach(key => {
    const obj = HISTO_ANALYSIS[key];
    if (!obj) return;

    Object.keys(obj).forEach(fam => {
      if (!famillesValides.has(fam)) {
        delete obj[fam];
      }
    });
  });

  console.log("✅ HISTO_ANALYSIS nettoyé");
}

/************************************************
 * DÉTAIL AUT — CALCUL DES GESTES PAR HISTORIQUE
 ************************************************/

/************************************************
 * AUT — DÉTAIL PAR GESTIONNAIRE (GEST BRUT)
 * ✅ Décision AUT = famille normalisée
 * ✅ Affichage   = GEST réel
 ************************************************/

function computeAutGestDetails() {
  const agg = {};

  Object.values(PREPS).forEach(lignes => {
    lignes.forEach(l => {
      const rawFam = ARTICLE_DATA[l.article]?.familleBrute;
      if (!rawFam) return;

      // ✅ Décision AUT (LOGIQUE MÉTIER INCHANGÉE)
      const famCanon = normalizeFamilleCode(rawFam);
      if (getFamilleImplantation(famCanon) !== "AUT") return;

      // ✅ GEST RÉEL (PAS NORMALISÉ)
      const gest = rawFam.toString().trim().toUpperCase();

      agg[gest] = (agg[gest] || 0) + 1;
    });
  });

  AUT_GEST_DETAILS = agg;
  console.log("✅ AUT — Détail par GEST (BRUT) :", agg);
}

/************************************************
 * AUT — DÉTAIL (EXCEL BRUT)
 * AUCUN filtrage emplacement / article
 ************************************************/

function computeAutOthersDetailsFromExcel(rows, famCol) {
  const agg = {};

  rows.forEach(row => {
    const rawFam = famCol ? row[famCol] : "";
    const fam = normalizeFamilleCode(rawFam);

    // Sécurité
    if (!fam) return;

    // AUT = non structurant
    if (STRUCTURING_FAMILIES.has(fam)) return;

    agg[fam] = (agg[fam] || 0) + 1;
  });

  AUT_GEST_DETAILS = agg;

  console.log("✅ AUT — Détail (Excel brut) :", AUT_GEST_DETAILS);
}

/************************************************
 * RUN SIMULATION (BOUTON)
 * AVEC LOADER % FLUIDE
 ************************************************/

async function runSimulation() {
  console.log("▶ runSimulation appelée");
  showLoader();
await nextFrame();
await nextFrame();

  try {
    /* =========================
       ÉTAPE 0 — RESET GLOBAL
    ========================= */
    setLoaderProgress(2, "Initialisation…");
    await nextFrame();
    IMPLANTATION_ACTIVE = false;
    PREPS = {};
    ARTICLE_DATA = {};
    HEATMAP = {};
    EMP_FAMILIES = {};
    PREP_DATES = {};
    NB_LIGNES = 0;
    SELECTED.clear();
    ACTIVE_FAMILLE = null;
    INITIAL_IMPLANTATION = {};
    STOCK_ROWS = [];
    BESOIN_STOCK_CACHE = null; // ✅ OBLIGATOIRE

    /* =========================
       ÉTAPE 1 — VÉRIF DT
    ========================= */
    const dtInput = document.getElementById("dtFile");
    if (!dtInput?.files?.[0]) {
      alert("Aucun fichier DT sélectionné.");
      return;
    }

    /* =========================
       ÉTAPE 2 — IMPORT STOCK
    ========================= */
    setLoaderProgress(5, "Chargement du stock…");
    await nextFrame();

    const stockInput = document.getElementById("stockFile");
    if (stockInput?.files?.[0]) {
      const stockSheets = await readExcel(stockInput.files[0]);
      STOCK_ROWS = XLSX.utils.sheet_to_json(
        Object.values(stockSheets)[0]
      );
    }
ARTICLE_DATA_STOCK = {};

STOCK_ROWS.forEach(row => {
  const article = row["Article"];
  if (!article) return;

  const rawFam =
  row["Famille"] ||
  row["famille"] ||
  row["GEST"] ||
  row["Gest"] ||
  row["Gest."]; // ✅ COLONNE RÉELLE DU STOCK

  const fam = normalizeFamilleCode(rawFam);
  if (!fam) return;

  ARTICLE_DATA_STOCK[article] = { famille: fam };
});

    /* =========================
       ÉTAPE 3 — LECTURE DT
    ========================= */
    setLoaderProgress(10, "Lecture du fichier DT…");
    await nextFrame();

    const sheets = await readExcel(dtInput.files[0]);

    setLoaderProgress(15, "Parsing du DT…");
    await nextFrame();

    const rows = XLSX.utils.sheet_to_json(Object.values(sheets)[0]);
    if (!rows.length) {
      alert("DT vide ou illisible.");
      return;
    }

    /* =========================
       ÉTAPE 4 — DÉTECTION COLONNES
    ========================= */
    setLoaderProgress(20, "Analyse des colonnes…");
    await nextFrame();

    const prepCol = detectColumn(rows[0], ["dt", "prepa"]);
    const empCol  = detectColumn(rows[0], ["emplac", "ced"]);
    const artCol  = detectColumn(rows[0], ["article"]);
    const famCol  = detectColumn(rows[0], ["famille", "gest"]);
    const dateCol = detectColumn(rows[0], ["date", "jour"]);

    if (!prepCol || !empCol || !artCol) {
      alert("Colonnes DT manquantes.");
      return;
    }

    /* =========================
       ÉTAPE 6 — PARSING DT
       (% progressif dans la boucle)
    ========================= */
    setLoaderProgress(35, "Construction des préparations…");
    await nextFrame();

    const total = rows.length;
    rows.forEach((row, i) => {
      const parsed = parseEmplacement(row[empCol]);
      const article = row[artCol];
      if (!parsed || !article) return;

      const empId = parsed.empId;
      const prepId = row[prepCol] ?? "NA";

      PREPS[prepId] ??= [];
      PREPS[prepId].push({ empId, article });

      HEATMAP[empId] = (HEATMAP[empId] || 0) + 1;
      NB_LIGNES++;

      const rawFam = famCol ? row[famCol] : "";
      ARTICLE_DATA[article] = {
  familleBrute: rawFam,
  familleNorm: normalizeFamilleCode(rawFam)
};

      if (dateCol && row[dateCol] && !PREP_DATES[prepId]) {
        const d = parseExcelDate(row[dateCol]);
        if (d) PREP_DATES[prepId] = d;
      }

      if (i % 500 === 0) {
        const pct = 35 + Math.round((i / total) * 10);
        setLoaderProgress(pct);
      }
    });


/* =========================
   LOG — AUT : QUI PREND QUOI (DÉTAIL + TOTAL)
   LOGIQUE STRICTE DE L’AIDE
========================= */

// empId -> Set(familles BRUTES présentes dans AUT)
const empToAutBrutes = {};

// 1️⃣ Regroupement par emplacement (familles BRUTES, AUT uniquement)
STOCK_ROWS.forEach(row => {
  const emp =
    row["Emplacement"] ||
    row["Emplacement stock"] ||
    row["EMPLACEMENT"];

  const article = row["Article"];
  if (!emp || !article) return;

  const famBrute = ARTICLE_DATA[article]?.famille;
  if (!famBrute) return;

  // on ne garde que les articles qui finissent dans AUT
  if (getFamilleImplantation(famBrute) !== "AUT") return;

  const empId = emp.toString().trim();
  if (!empId) return;

  empToAutBrutes[empId] ??= new Set();
  empToAutBrutes[empId].add(famBrute);
});

// 2️⃣ Répartition par emplacement + cumul global
const autTotals = {};

Object.entries(empToAutBrutes).forEach(([empId, famSet]) => {
  const fams = [...famSet];
  const n = fams.length;
  const part = 1 / n;

  const detail = {};

  fams.forEach(fam => {
    detail[fam] = part;
    autTotals[fam] = (autTotals[fam] || 0) + part;
  });
});

// 3️⃣ TOTAL FINAL PAR FAMILLE BRUTE DANS AUT

Object.entries(autTotals)
  .sort((a, b) => b[1] - a[1])
  .forEach(([fam, val]) => {
    console.log(
      fam,
      "→",
      val.toFixed(2),
      "emplacements AUT"
    );
  });
initEmplacementsFromStock();
rebuildStockByEmpIndex();
console.groupEnd();

console.log("✅ SNAPSHOT ESPACE AVANT :", window.__SPACE_AVANT);

/* =========================
   ÉTAPE 6bis — AUT (DT UNIQUEMENT)
========================= */

setLoaderProgress(45, "Analyse AUT (DT) …");
await nextFrame();

// ✅ AUT = familles NON STRUCTURANTES du DT
computeAutGestDetails();
updateAutDetails();

/* =========================
   ÉTAPE 7 — EMPLACEMENTS (CORRIGÉE)
========================= */
setLoaderProgress(45, "Initialisation des emplacements…");
await nextFrame();

// 1️⃣ Emplacements issus des données (DT + STOCK)
initEmplacementsFromDT(rows, empCol);
initEmplacementsFromStock();
rebuildStockByEmpIndex();

// 2️⃣ 🔑 Construction de TOUS les emplacements physiques RÉELS
//     → strictement selon HAUTEUR_MAX
ensureAllPhysicalEmplacements();

// 3️⃣ Niveaux de référence
NIV_ACTUEL = getExistingLevels()[0] || "A";
NIV_REIMPLANT = NIV_ACTUEL;

// 4️⃣ ✅ SNAPSHOT ESPACE AVANT = ENTREPÔT RÉEL
window.__SPACE_AVANT = Object.freeze(
  computeSpaceSnapshot(
    EMPLACEMENTS,
    STOCK_BY_EMP
  )
);

// 5️⃣ Préparation de la réimplantation (APRÈS)
ensureFullLevel(NIV_REIMPLANT);
rebuildEmpIndex();

    /* =========================
       ÉTAPE 8 — ANALYSE HISTORIQUE
    ========================= */
    setLoaderProgress(55, "Analyse historique…");
    await nextFrame();

    analyzeHistoricalLoad();
    nettoyerHistoriqueFamilles();

    /* =========================
       ÉTAPE 9 — UI
    ========================= */
    setLoaderProgress(65, "Initialisation de l’interface…");
    await nextFrame();

    initFamillePalette();
    initUI();
    bindPlanInteractionOnce();

   /* =========================
   ÉTAPE 10 — VISUELS (CORRIGÉ)
========================= */

// 1️⃣ Plan TOUJOURS en premier
setLoaderProgress(75, "Génération du plan…");
await nextFrame();

resizeImplantationCanvas();
drawZonePlan();   // ✅ BASE GRAPHIQUE

// 2️⃣ Heatmap ENSUITE (overlay uniquement)
setLoaderProgress(82, "Génération des heatmaps…");
await nextFrame();

resizeHeatmapCanvas();
drawHeatmapAvant(); // ✅ SURIMPRESSION

    /* =========================
       ÉTAPE 11 — AIDE
    ========================= */
    setLoaderProgress(90, "Calcul des besoins d’implantation…");
    await nextFrame();

    computeAideImplantation();

    /* =========================
       ÉTAPE 12 — TEMPS
    ========================= */
    setLoaderProgress(95, "Calcul des temps…");
    await nextFrame();

    const T = {
  X:     +tX.value,
  Zup:   +tZup.value,     // TOTAL montée
  Zdown: +tZdown.value,   // TOTAL descente
  ROT:   +tRot.value,
  POS:   +tPos.value,
  PAL:   +tPal.value,
  UM:    +tUM.value,
  SCAN:  +tScan.value,
  MARGE: +tMarge.value / 100
};

    const tempsAvant = computeTotalTime(l => empFromId(l.empId), T);
    const minutesParLigne =
      NB_LIGNES > 0 ? (tempsAvant / 60) / NB_LIGNES : 0;

    document.getElementById("results").innerHTML = `
      <b>Temps AVANT :</b> ${(tempsAvant / 3600).toFixed(2)} h<br>
      <b>Lignes :</b> ${NB_LIGNES}<br>
      <b>Minutes / ligne :</b> ${minutesParLigne.toFixed(2)}
    `;

    setLoaderProgress(100, "Terminé ✅");
    await nextFrame();

  } catch (e) {
    console.error(e);
    alert("Erreur simulation");
  } finally {
AUTO_IMPLANT_RUNNING = false;
    hideLoader();
  }
}

console.log("✅ BLOC L chargé");

/************************************************
 * BESOIN STOCK — CALCUL PAR FAMILLE
 * ✅ Somme = nombre d’emplacements STOCK occupés
 ************************************************/

function computeStockNeedByFamille() {
  if (BESOIN_STOCK_CACHE) return BESOIN_STOCK_CACHE;

  const besoin = {}; // clé = FAMILLE D'IMPLANTATION

  Object.values(EMPLACEMENTS_STOCK).forEach(e => {
  if (!isZonePicking(e)) return;
    const empId =
      `${e.allee}${String(e.travee).padStart(2, "0")}${e.niveau}${e.position}`;

    // articles STOCK présents à cet emplacement
    const articles = STOCK_BY_EMP[empId] || [];

    if (!articles.length) return;

    // ✅ familles D'IMPLANTATION présentes sur l'emplacement
    const famsImpl = new Set();

    articles.forEach(r => {
      const art = r["Article"];
      const famBrute = ARTICLE_DATA_STOCK[art]?.famille;
      if (!famBrute) return;

      const famImpl = getFamilleImplantation(famBrute);
      famsImpl.add(famImpl);
    });

    if (!famsImpl.size) return;

    // ✅ partition stricte par emplacement
    const part = 1 / famsImpl.size;

    famsImpl.forEach(fam => {
      besoin[fam] = (besoin[fam] || 0) + part;
    });
  });

  BESOIN_STOCK_CACHE = besoin;
  return besoin;
}
function rebuildEmplCountByFam() {
  EMPL_COUNT_BY_FAM = {};
  Object.values(EMPLACEMENTS).forEach(e => {
  if (!isZonePicking(e)) return;
  if (!e.famille) return;
    EMPL_COUNT_BY_FAM[e.famille] =
      (EMPL_COUNT_BY_FAM[e.famille] || 0) + 1;
  });
}
/************************************************
 * AIDE À L’IMPLANTATION — VERSION FINALE
 * Lecture seule : aucune modification d’EMPLACEMENTS
 ************************************************/

function computeAideImplantation() {
  const container = document.getElementById("implantationHintsContent");
  if (!container) return;

  // ✅ helper local (corrige l'erreur "r is not defined")
  const r = v => Math.round(v || 0);

  // ✅ besoin STOCK (emplacements)
  const besoinStockByFam = computeStockNeedByFamille() || {};

  // ✅ besoin FLUX (historique)
  const besoinFluxByFam =
  HISTO_ANALYSIS?.p80FluxByFam ||
  HISTO_ANALYSIS?.avgFluxByFam ||
  {};

    const capByFam = computeCapaciteReelleByFamille();

  /* =========================
     AGRÉGATION PAR FAMILLE D’IMPLANTATION
  ========================= */

  const agg = {};
  // ✅ Familles à considérer dans l'aide
// ✅ Familles prises en compte dans l'aide à l'implantation
const familles = new Set([
  ...STRUCTURING_FAMILIES,
  ...Object.keys(besoinStockByFam),
  ...Object.keys(besoinFluxByFam)
]);

familles.forEach(fam => {
  if (!agg[fam]) {
    agg[fam] = {
      fam,
      besoinStockEmpl: 0,
      besoinFluxRef: 0,
      cap: 1,
      besoinFluxEmpl: 0,
      besoinCibleRaw: 0,
      besoinCible: 0
    };
  }

  agg[fam].besoinStockEmpl += besoinStockByFam[fam] || 0;
  agg[fam].besoinFluxRef  += besoinFluxByFam[fam]  || 0;
});

  /* =========================
     CONVERSION FLUX → EMPLACEMENTS
  ========================= */

 Object.values(agg).forEach(o => {
  const cap = capByFam[o.fam] || 1;

  o.cap = cap;
  o.besoinFluxEmpl = o.besoinFluxRef;

  // Besoin brut (sans marge)
  const besoinBrut = Math.max(
    o.besoinStockEmpl,
    o.besoinFluxEmpl
  );

  // ✅ marge métier VARIABLE (Option C)
  const margeBrute = computeVariableMarge({
    fam: o.fam,
    besoinStock: o.besoinStockEmpl,
    besoinFlux: o.besoinFluxEmpl
  });

  // ✅ marge COMPRESSÉE (50 %)
  const margeEffective = margeBrute * 0.2;

  o.besoinCibleRaw = besoinBrut * (1 + margeEffective);
  o.besoinCible = Math.ceil(o.besoinCibleRaw);
});

  /* =========================
     TABLE + TOTAUX
  ========================= */

  const rows = [];
  const total = {
    besoinStock: 0,
    besoinFlux: 0,
    besoinCible: 0,
    poses: 0,
    manque: 0
  };

  Object.values(agg).forEach(o => {
    let poses = 0;
    let manque = 0;
    let statut = "ℹ️ Aucun emplacement posé";

    if (IMPLANTATION_ACTIVE) {
      poses = EMPL_COUNT_BY_FAM?.[o.fam] || 0;

      manque = Math.max(0, o.besoinCible - poses);
      statut = manque === 0 ? "🟢 OK" : "🔴 Sous-dimensionné";
    }

    rows.push({
      fam: o.fam,
      cap: o.cap,
      besoinStock: o.besoinStockEmpl,
      besoinFlux: o.besoinFluxEmpl,
      besoinCible: o.besoinCible,
      poses,
      manque,
      statut
    });

    total.besoinStock += o.besoinStockEmpl;
    total.besoinFlux  += o.besoinFluxEmpl;
    total.besoinCible += o.besoinCible;
    total.poses       += poses;
    total.manque      += manque;
  });
// ✅ export pour l'auto-implantation
window.__BESOIN_CIBLE_PAR_FAM = {};

rows.forEach(r => {
  window.__BESOIN_CIBLE_PAR_FAM[r.fam] = r.besoinCible;
});
  /* =========================
     AFFICHAGE
  ========================= */

  container.innerHTML = `
    <table style="width:100%; border-collapse:collapse; font-size:12px;">
      <thead>
        <tr>
          <th>Famille</th>
          <th>Capacité réelle</th>
          <th>Besoin stock</th>
          <th>Besoin flux</th>
          <th>Besoin cible</th>
          <th>Empl. posés</th>
          <th>Manque</th>
          <th>Statut</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(rw => `
          <tr>
            <td><b>${rw.fam}</b></td>
            <td style="text-align:right">${rw.cap.toFixed(2)}</td>
            <td style="text-align:right">${r(rw.besoinStock)}</td>
            <td style="text-align:right">${r(rw.besoinFlux)}</td>
            <td style="text-align:right"><b>${r(rw.besoinCible)}</b></td>
            <td style="text-align:right">${rw.poses}</td>
            <td style="text-align:right">${rw.manque}</td>
            <td style="text-align:center">${rw.statut}</td>
          </tr>
        `).join("")}
        <tr style="border-top:2px solid #000; font-weight:bold;">
          <td>TOTAL</td>
          <td></td>
          <td style="text-align:right">${r(total.besoinStock)}</td>
          <td style="text-align:right">${r(total.besoinFlux)}</td>
          <td style="text-align:right">${r(total.besoinCible)}</td>
          <td style="text-align:right">${total.poses}</td>
          <td style="text-align:right">${total.manque}</td>
          <td></td>
        </tr>
      </tbody>
    </table>
  `;
}
function computePenaliteSousDimensionnement() {

  const cible = window.__BESOIN_CIBLE_PAR_FAM || {};
  const poses = {};

  Object.values(EMPLACEMENTS).forEach(e => {
    if (!isZonePicking(e)) return;
    if (!e.famille) return;

    poses[e.famille] = (poses[e.famille] || 0) + 1;
  });

  let penalty = 0;

  Object.keys(cible).forEach(fam => {
    const manque = Math.max(0, cible[fam] - (poses[fam] || 0));
    if (manque > 0) {
      penalty += manque * 1e6; // 🔴 pénalité HARD
    }
  });

  return penalty;
}

/************************************************
 * SIMULATION PICKING — VERSION PROPRE
 * BLOC M — COMPARAISON & AFFECTATION RÉELLE
 ************************************************/
function computeImportanceByFamilleWithWeights(weights) {

  const flux   = HISTO_ANALYSIS?.p80FluxByFam || {};
  const rotBrut = computeRotationByFamille();
  const cible  = window.__BESOIN_CIBLE_PAR_FAM || {};
  const cap    = computeCapaciteReelleByFamille();

  const importance = {};

  Object.keys(cible).forEach(fam => {

    const fFlux  = flux[fam] || 0;
    const fRot   = rotBrut[fam] || 0;
    const fStock = cible[fam] || 0;
    const fCap   = cap[fam] || 1;

    importance[fam] =
      weights.flux     * fFlux +
      weights.rotation * fRot +
      weights.stock    * (fStock / fCap);
  });

  return importance;
}
function buildImportanceStrategies() {
  return [
    {
      name: "Flux prioritaire",
      weights: { flux: 0.6, rotation: 0.3, stock: 0.1 }
    },
    {
      name: "Équilibrée",
      weights: { flux: 0.4, rotation: 0.3, stock: 0.3 }
    },
    {
      name: "Capacité prioritaire",
      weights: { flux: 0.3, rotation: 0.2, stock: 0.5 }
    }
  ];
}

function buildPhysicalColumns() {
  const colonnes = {};

  Object.values(EMPLACEMENTS).forEach(e => {
    if (!isZonePicking(e)) return;

    const key = `${e.allee}|${e.travee}|${e.position}`;
    colonnes[key] ??= [];
    colonnes[key].push(e);
  });

  // TRI vertical strict A → B → C
  Object.values(colonnes).forEach(col =>
    col.sort((a, b) => a.niveau.localeCompare(b.niveau))
  );

  return Object.values(colonnes);
}
function extractStateFromEmplacements() {
  const state = {};

  Object.values(EMPLACEMENTS).forEach(e => {
    if (!isZonePicking(e)) return;
    if (isZoneInterdite(e)) return;

    const key = `${e.allee}|${e.travee}|${e.position}`;
    state[key] = e.famille;
  });

  return state;
}
function applyStateToEmplacements(state) {

  Object.values(EMPLACEMENTS).forEach(e => {
    if (!isZonePicking(e)) return;
    if (isZoneInterdite(e)) return;

    const key = `${e.allee}|${e.travee}|${e.position}`;

    if (state[key] !== undefined) {
      e.famille = state[key];
    }
  });
}

function poserColonneDuBasVersLeHaut(colonne, famille) {
  for (const e of colonne) {
    if (e.famille != null) continue;
    e.famille = famille;
  }
}
function computeDistinctRefsByFamilleFromStock() {
  const refsByFam = {};

  Object.values(EMPLACEMENTS_STOCK).forEach(e => {
    if (!isZonePicking(e)) return;

    const empId =
      `${e.allee}${String(e.travee).padStart(2, "0")}${e.niveau}${e.position}`;

    const articles = STOCK_BY_EMP[empId] || [];

    articles.forEach(row => {
      const article = row["Article"];
      if (!article) return;

      const famBrute = ARTICLE_DATA_STOCK[article]?.famille;
      if (!famBrute) return;

      const fam = getFamilleImplantation(famBrute);
      refsByFam[fam] ??= new Set();
      refsByFam[fam].add(article);
    });
  });

  // ✅ conversion finale Set → nombre
  const out = {};
  Object.entries(refsByFam).forEach(([fam, set]) => {
    out[fam] = set.size;
  });

  return out;
}

function computeStockEmplacementsByFamille() {
  const emplByFam = {};

  Object.values(EMPLACEMENTS_STOCK).forEach(e => {
    if (!isZonePicking(e)) return;

    const empId =
      e.allee +
      String(e.travee).padStart(2, "0") +
      e.niveau +
      e.position;

    const articles = STOCK_BY_EMP[empId] || [];
    if (articles.length === 0) return;

    const fams = {};

    articles.forEach(row => {
      const artData = ARTICLE_DATA_STOCK[row["Article"]];
      if (!artData || !artData.famille) return;

      const fam = getFamilleImplantation(artData.famille);
      fams[fam] = true;
    });

    const famList = Object.keys(fams);
    const part = 1 / famList.length;

    famList.forEach(fam => {
      emplByFam[fam] = (emplByFam[fam] || 0) + part;
    });
  });

  return emplByFam;
}
function computeDistinctRefsByFamille() {
  const refsByFam = {};

  STOCK_ROWS.forEach(row => {
    const article = row["Article"];
    if (!article) return;

    const famBrute = ARTICLE_DATA_STOCK[article]?.famille;
    if (!famBrute) return;

    const fam = getFamilleImplantation(famBrute);

    refsByFam[fam] ??= new Set();
    refsByFam[fam].add(article);
  });

  const out = {};
  Object.entries(refsByFam).forEach(([fam, set]) => {
    out[fam] = set.size;
  });

  return out;
}
function computeCapaciteReelleByFamille() {
  const refsByFam = computeDistinctRefsByFamilleFromStock();
  const emplByFam = computeStockEmplacementsByFamille();

  const cap = {};

  Object.keys(refsByFam).forEach(fam => {
    const nbRefs = refsByFam[fam];
    const nbEmpl = emplByFam[fam] || 0;

    if (nbEmpl > 0) {
      cap[fam] = nbRefs / nbEmpl;
    } else {
      cap[fam] = 1;
    }
  });

  return cap;
}

/**
 * Usage réel par référence (fréquence DT)
 */
function computeRefUsage() {
  const usage = {};

  Object.values(PREPS).forEach(lignes => {
    lignes.forEach(l => {
      usage[l.article] = (usage[l.article] || 0) + 1;
    });
  });

  return usage;
}
function buildZonesByFamille() {
  const zones = {}; // fam -> [emp]

  Object.entries(EMPLACEMENTS).forEach(([empId, e]) => {
    if (!e.famille) return;

    zones[e.famille] ??= [];
    zones[e.famille].push({
      empId,
      famille: e.famille,   // ✅ AJOUT CRUCIAL
      allee: e.allee,
      travee: e.travee,
      niveau: e.niveau,
      position: e.position
    });
  });

  return zones;
}
// =====================================================
// PICKING — SÉLECTION RÉFÉRENCES CRITIQUES
// =====================================================
function selectCriticalRefs(refUsage, maxRefs) {
  return Object.entries(refUsage)
    .sort((a, b) => (b[1] || 0) - (a[1] || 0))
    .slice(0, maxRefs)
    .map(([ref]) => ref);
}
// =====================================================
// PICKING — MICRO SWAP LOCAL (DELTA O(1))
// =====================================================
function tryLocalPickingSwap(refA, refB, refToEmp, refUsage, T) {
  const empA = EMPLACEMENTS[refToEmp[refA]];
  const empB = EMPLACEMENTS[refToEmp[refB]];
  if (!empA || !empB) return false;

  const before =
    computeFastPickingScore(empA, refUsage[refA] || 1, T) +
    computeFastPickingScore(empB, refUsage[refB] || 1, T);

  const after =
    computeFastPickingScore(empB, refUsage[refA] || 1, T) +
    computeFastPickingScore(empA, refUsage[refB] || 1, T);

  if (after < before) {
    const tmp = refToEmp[refA];
    refToEmp[refA] = refToEmp[refB];
    refToEmp[refB] = tmp;
    return true;
  }
  return false;
}

function groupRefsByFamille(refUsage) {
  const refsByFam = {};

  Object.keys(ARTICLE_DATA).forEach(ref => {
    const famNorm = ARTICLE_DATA[ref]?.familleNorm;
    const fam = getFamilleImplantation(famNorm); // ✅ ICI

    refsByFam[fam] ??= [];
    refsByFam[fam].push(ref);
  });

  Object.keys(refsByFam).forEach(fam => {
    refsByFam[fam].sort(
      (a, b) => (refUsage[b] || 0) - (refUsage[a] || 0)
    );
  });

  return refsByFam;
}
function sortZoneByProximity(zone) {
  return [...zone].sort(
    (a, b) =>
      Math.abs(a.travee - ENTRY_POINT.travee) -
      Math.abs(b.travee - ENTRY_POINT.travee)
  );
}
// =====================================================
// SCORE D’EFFICACITÉ D’UN EMPLACEMENT
// (bas + proche entrée = meilleur)
// =====================================================

function computeEmplacementEfficiencyScore(emp, T) {

  // 🔽 1) Coût vertical réel (déjà défini ailleurs)
  const costVertical = computeVerticalTime(emp, T);

  // ↔ 2) Coût horizontal depuis l’entrée
  const costHorizontal = distanceHorizontale(
    ENTRY_POINT,
    emp,
    T
  );

  // 🧱 3) Pénalité structurelle d’allée
  const costAllee = costEloignementAllee(emp);

  // ⚖️ Pondérations métier
  const Wz = 1.0;
  const Wh = 1.0;
  const Wa = 1.0;

  return Wz * costVertical + Wh * costHorizontal + Wa * costAllee;
}
// =====================================================
// PICKING — SCORE PROXY RAPIDE (SANS SIMULATION)
// =====================================================
function computeFastPickingScore(emp, freq, T) {
  if (!emp) return Infinity;
  return freq * (
    computeVerticalTime(emp, T) +
    distanceHorizontale(ENTRY_POINT, emp, T) +
    costEloignementAllee(emp)
  );
}
// =====================================================
// PICKING — MICRO‑OPTIMISATION BORNÉE (SAFE)
// =====================================================
function microOptimizePickingAssignments(refToEmp, mode) {
  const limits = AUTO_IMPLANT_LIMITS[mode];
  if (!limits) return;

  const T = {
    X: +tX.value,
    Zup: +tZup.value,
    Zdown: +tZdown.value
  };

  const refUsage = computeRefUsage();
  const refs = selectCriticalRefs(refUsage, limits.maxRefs);

  for (let i = 0; i < limits.maxIter; i++) {
    const a = refs[Math.random() * refs.length | 0];
    const b = refs[Math.random() * refs.length | 0];
    if (a && b && a !== b) {
      tryLocalPickingSwap(a, b, refToEmp, refUsage, T);
    }
  }
}
/**
 * Affectation réaliste des références APRÈS implantation
 */
function assignReferencesToEmplacements() {

  if (!IMPLANTATION_ACTIVE) {
    return { feasible: false, reason: "Implantation absente" };
  }

  const T = {
    X: +tX.value,
    Zup: +tZup.value,
    Zdown: +tZdown.value
  };

  const refUsage   = computeRefUsage();
  const zonesByFam = buildZonesByFamille();
  const refsByFam  = groupRefsByFamille(refUsage);

  const refToEmp = {};
  const errors = [];

  Object.keys(refsByFam).forEach(fam => {

    const refs = refsByFam[fam];

    // 🔒 règle métier absolue
    if (fam !== "AUT" && !zonesByFam[fam]) {
      errors.push({ famille: fam, refs: refs.slice(0, 5) });
      return;
    }

    const zone = zonesByFam[fam];
    if (!zone || zone.length === 0) return;

    // ✅ TRI DES EMPLACEMENTS PAR EFFICACITÉ
    // ✅ TRI PAR EFFICACITÉ
const empsSortedRaw = [...zone].sort((a, b) =>
  computeEmplacementEfficiencyScore(a, T) -
  computeEmplacementEfficiencyScore(b, T)
);

// ✅ FILTRAGE MÉTIER VERTICAL — 🔴 BLOQUÉS
const empsSorted = empsSortedRaw.filter(emp =>
  isVerticalPlacementAllowed(emp, zone, T)
);

// 🔒 GARDE-FOU ULTIME
if (empsSorted.length === 0) {
  console.warn(
    "❌ Aucun emplacement verticalement autorisé",
    fam
  );
  return;
}

    // ✅ refs déjà triées par importance (flux décroissant)
    refs.forEach((ref, i) => {
      const emp = empsSorted[i % empsSorted.length];

      // garde‑fou ultime
      if (fam !== "AUT" && emp.famille !== fam) {
        errors.push({
          ref,
          famRef: fam,
          empId: emp.empId,
          famEmp: emp.famille
        });
        return;
      }

      refToEmp[ref] = emp.empId;
    });
  });

  if (errors.length > 0) {
    console.error("❌ Implantation références invalide", errors);
    return {
      feasible: false,
      reason: "Conflit famille / emplacement",
      errors
    };
  }

  return {
    feasible: true,
    refToEmp
  };
}

/* =========================
   COMPTAGE DES EMPLACEMENTS
========================= */

/**
 * Compte les emplacements distincts utilisés AVANT
 */
function countUsedEmplacementsAvant() {
  const set = new Set();

  Object.values(PREPS).forEach(lignes => {
    lignes.forEach(l => {
      if (l.empId) set.add(l.empId);
    });
  });

  return set.size;
}

/**
 * Compte les emplacements distincts utilisés APRÈS
 */
function countUsedEmplacementsApres(refToEmp) {
  const set = new Set();

  Object.values(refToEmp).forEach(empId => {
    if (empId) set.add(empId);
  });

  return set.size;
}
function computeExecutiveSummary({
  deltaTempsTotalSecondes,
  DT,
  coutHoraireETP,
  heuresETPParAn
}) {
  const dates = DT.filter(d => d instanceof Date && !isNaN(d));
  const minDate = new Date(Math.min(...dates));
  const maxDate = new Date(Math.max(...dates));

  const dureeJours =
    (maxDate - minDate) / (1000 * 60 * 60 * 24);

  const heuresTotales =
    deltaTempsTotalSecondes / 3600;

  const heuresParJour =
    heuresTotales / dureeJours;

  const etpEquivalent =
    heuresTotales / heuresETPParAn;

  const economieParJour =
    heuresParJour * coutHoraireETP;

  const economieParAn =
    economieParJour * 250;

  return {
    minDate,
    maxDate,
    dureeJours,
    heuresParJour,
    etpEquivalent,
    economieParJour,
    economieParAn
  };
}
// =========================
// PARAMÈTRES SOCIAUX / FINANCIERS
// =========================
const COUT_HORAIRE_ETP = 38;     // € / heure (à ajuster)
const HEURES_ETP_PAR_AN = 1600; // h / an (base réaliste)

/**
 * Comparaison AVANT / APRÈS
 */
function runComparison() {
  const out = document.getElementById("comparisonResults");
  if (!out) return;

if (!IMPLANTATION_ACTIVE) {
  alert("Implantation non définie — comparaison impossible.");
  return;
}

  const T = {
    X: +tX.value,
    Zup: +tZup.value,
    Zdown: +tZdown.value,
    ROT: +tRot.value,
    POS: +tPos.value,
    PAL: +tPal.value,
    UM: +tUM.value,
    SCAN: +tScan.value,
    MARGE: +tMarge.value / 100
  };

 const assign = assignReferencesToEmplacements();
// =====================================================
// ✅ MICRO‑OPTIMISATION PICKING (OPTIONNELLE)
// =====================================================
if (AUTO_IMPLANT_MODE === "PRECISE" && assign?.refToEmp) {
  console.log("⚙️ Micro‑optimisation picking (mode PRECISE)");
  microOptimizePickingAssignments(
    assign.refToEmp,
    AUTO_IMPLANT_MODE
  );
}
  if (!assign || !assign.refToEmp) {
    out.innerHTML = "<b>Comparaison impossible</b>";
    return;
  }
  // ✅ Construction validation métier verticale
buildVerticalValidationMap(assign.refToEmp, T);
  checkMappingCoherence(assign.refToEmp);

  const tempsAvant = computeTotalTime(
  l => empFromId(l.empId),
  T
);

const REF_TO_EMP_APRES = assign.refToEmp;

const tempsApres = computeTotalTime(
  l => {
    const empId = REF_TO_EMP_APRES[l.article];
    if (!empId) return null;
    return empFromId(empId);
  },
  T
);
// ✅ RENDRE ACCESSIBLE À L’EXPORT
window.__TEMPS_AVANT = tempsAvant;
window.__TEMPS_APRES = tempsApres;
// ✅ Gain absolu et pourcentage
const gainSecondes = tempsAvant - tempsApres;
const pct = tempsAvant > 0
  ? (gainSecondes / tempsAvant) * 100
  : 0;

// ✅ DELTA CORRECT
const deltaTempsTotalSecondes =
  tempsAvant - tempsApres;

// ✅ RÉSUMÉ EXÉCUTIF BASÉ SUR DATES DT
const exec = computeExecutiveSummary({
  deltaTempsTotalSecondes,
  DT: Object.values(PREP_DATES),
  coutHoraireETP: COUT_HORAIRE_ETP,
  heuresETPParAn: HEURES_ETP_PAR_AN
});

// ✅ BARRE TEMPORELLE DT
document.getElementById("kpiDateStart").textContent =
  exec.minDate.toLocaleDateString();

document.getElementById("kpiDateEnd").textContent =
  exec.maxDate.toLocaleDateString();

document.getElementById("kpiNbDays").textContent =
  Math.round(exec.dureeJours);

// ✅ KPI OFFICIELS
document.getElementById("kpiHoursDay").textContent =
  exec.heuresParJour.toFixed(1) + " h";

document.getElementById("kpiETP").textContent =
  exec.etpEquivalent.toFixed(2);

document.getElementById("kpiEcoDay").textContent =
  exec.economieParJour.toFixed(0) + " €";

document.getElementById("kpiEcoYear").textContent =
  exec.economieParAn.toFixed(0) + " €";

/* =========================
   PRODUCTIVITÉ
========================= */

const lignes = NB_LIGNES;

const heuresAvant = tempsAvant / 3600;
const heuresApres = tempsApres / 3600;

const lignesParMinAvant =
  lignes > 0 ? lignes / (tempsAvant / 60) : 0;

const lignesParMinApres =
  lignes > 0 ? lignes / (tempsApres / 60) : 0;

const lignesParHeureAvant =
  lignes > 0 ? lignes / heuresAvant : 0;

const lignesParHeureApres =
  lignes > 0 ? lignes / heuresApres : 0;

/* =========================
   ESPACE — COMPARAISON (CORRECTE)
========================= */

// ✅ AVANT : snapshot pris après import stock + DT
const spaceAvant = window.__SPACE_AVANT;

// ✅ matérialiser les niveaux ajoutés AVANT le calcul APRÈS
ensureAllPhysicalEmplacements();

const spaceApres = computeSpaceSnapshotApres(
  EMPLACEMENTS,
  STOCK_BY_EMP
);

// ✅ RENDRE ACCESSIBLE À L’EXPORT (PDF / Excel)
window.__SPACE_AVANT = spaceAvant;
window.__SPACE_APRES = spaceApres;

const deltaEmpl = spaceApres.total - spaceAvant.total;
const deltaSurface = spaceApres.surfaceTotal - spaceAvant.surfaceTotal;

  out.innerHTML = `
<div class="dashboard">

  <!-- ================= PRODUCTIVITÉ ================= -->
  <section class="card card-main">
    <div class="card-header">
      ⏱ Productivité préparation
    </div>

    <div class="kpi-grid">
      <div class="kpi">
        <div class="kpi-label">Lignes traitées</div>
        <div class="kpi-value">${lignes}</div>
      </div>

      <div class="kpi">
        <div class="kpi-label">Temps AVANT</div>
        <div class="kpi-value">${heuresAvant.toFixed(1)} h</div>
      </div>

      <div class="kpi">
        <div class="kpi-label">Temps APRÈS</div>
        <div class="kpi-value">${heuresApres.toFixed(1)} h</div>
      </div>
    </div>
<div class="prod-result ${pct >= 0 ? "good" : "bad"}">
  ${pct >= 0 ? "Gain de temps" : "Perte de temps"}
  <span>
    ${pct >= 0 ? "+" : ""}
    ${pct.toFixed(1)} %
  </span>
</div>
    <div class="compare-big">
      <div>
        Lignes / min<br>
        <span>${lignesParMinAvant.toFixed(2)}</span>
        →
        <span>${lignesParMinApres.toFixed(2)}</span>
      </div>
      <div>
        Lignes / h<br>
        <span>${lignesParHeureAvant.toFixed(1)}</span>
        →
        <span>${lignesParHeureApres.toFixed(1)}</span>
      </div>
    </div>
  </section>

  <!-- ================= EMPLACEMENTS ================= -->
  <section class="card">
    <div class="card-header">
      📦 Emplacements
    </div>

    <div class="before-after">
      <div>
        <div class="tag before">AVANT</div>
        <div class="big-number">${spaceAvant.total}</div>
        <div class="sub">
          ${spaceAvant.occupied} occupés<br>
          ${spaceAvant.tauxUtilisation.toFixed(1)} %
        </div>
      </div>

      <div>
        <div class="tag after">APRÈS</div>
        <div class="big-number">${spaceApres.total}</div>
        <div class="sub">
          ${spaceApres.occupied} occupés<br>
          ${spaceApres.tauxUtilisation.toFixed(1)} %
        </div>
      </div>
    </div>

    <div class="result ${deltaEmpl >= 0 ? "good" : "bad"}">
  ${deltaEmpl >= 0 ? "Gain" : "Perte"} :
  ${Math.abs(deltaEmpl)} emplacements
</div>

  </section>

  <!-- ================= SURFACE ================= -->
  <section class="card">
    <div class="card-header">
      📐 Surface logistique
    </div>

    <div class="before-after">
      <div>
        <div class="tag before">AVANT</div>
        <div class="big-number">
          ${spaceAvant.surfaceTotal.toFixed(0)} m²
        </div>
        <div class="sub">
          ${spaceAvant.surfaceOccupied.toFixed(0)} m² occupés<br>
          ${spaceAvant.tauxUtilisation.toFixed(1)} %
        </div>
      </div>

      <div>
        <div class="tag after">APRÈS</div>
        <div class="big-number">
          ${spaceApres.surfaceTotal.toFixed(0)} m²
        </div>
        <div class="sub">
          ${spaceApres.surfaceOccupied.toFixed(0)} m² occupés<br>
          ${spaceApres.tauxUtilisation.toFixed(1)} %
        </div>
      </div>
    </div>

    <div class="result ${deltaSurface >= 0 ? "good" : "bad"}">
  ${deltaSurface >= 0 ? "Gain" : "Perte"} :
  ${Math.abs(deltaSurface).toFixed(0)} m²
</div>
  </section>

</div>
`;
}
/* ================= KPI COMPARAISON — CONSTANTES ================= */

// Hypothèses RH
const HEURES_PAR_ETP_JOUR = 7;

// SMIC horaire brut (France – 2026)
const SMIC_HORAIRE_BRUT = 12.02;

// Hypothèse jours ouvrés
const JOURS_OUVRES_PAR_AN = 220;
function computeComparisonKPIs({
  heuresGagneesParJour
}) {
  // 1️⃣ ETP gagné
  const etp = heuresGagneesParJour / HEURES_PAR_ETP_JOUR;

  // 2️⃣ Économie brute
  const ecoJour = heuresGagneesParJour * SMIC_HORAIRE_BRUT;
  const ecoAn   = ecoJour * JOURS_OUVRES_PAR_AN;

  return {
    heuresJour: heuresGagneesParJour,
    etp,
    ecoJour,
    ecoAn
  };
}
function displayComparisonKPIs(kpi) {
  document.getElementById("kpiHoursDay").textContent =
    `${kpi.heuresJour.toFixed(1)} h`;

  document.getElementById("kpiETP").textContent =
    kpi.etp.toFixed(2);

  document.getElementById("kpiEcoDay").textContent =
    `${kpi.ecoJour.toFixed(0)} €`;

  document.getElementById("kpiEcoYear").textContent =
    `${kpi.ecoAn.toFixed(0)} €`;

  document.getElementById("kpiSummaryText").innerHTML = `
    ✅ L’implantation permet un <b>gain opérationnel de
    ${kpi.heuresJour.toFixed(1)} heures par jour</b>,
    soit l’équivalent de <b>${kpi.etp.toFixed(2)} ETP</b>.<br>
    À salaire minimum légal, cela représente une économie
    d’environ <b>${kpi.ecoAn.toFixed(0)} € brut par an</b>,
    sans dégradation des conditions de picking.
  `;
}

/**
 * Vérifie la cohérence famille ↔ emplacement
 */
function checkMappingCoherence(refToEmp) {
  const errors = [];

  Object.entries(refToEmp).forEach(([ref, empId]) => {
    const famRefBrute = ARTICLE_DATA[ref]?.familleBrute;
const famRefImpl  = getFamilleImplantation(
  ARTICLE_DATA[ref]?.familleNorm
);
    const famEmp = EMPLACEMENTS[empId]?.famille;

    if (famRefImpl !== famEmp) {
      errors.push({
        ref,
        famRefBrute,
        famRefImpl,
        empId,
        famEmp
      });
    }
  });

  if (errors.length > 0) {
    console.error("❌ Incohérences mapping RÉELLES :", errors.slice(0, 10));
  } else {
    console.log("✅ Mapping article → emplacement cohérent (implantation)");
  }
}

console.log("✅ BLOC M (final) chargé");
/************************************************
 * CONSTRUCTION DE LA VALIDATION VISUELLE
 ************************************************/

function buildVerticalValidationMap(refToEmp, T) {
  VALIDATION_VERTICAL_CACHE = {};

  const zonesByFam = buildZonesByFamille();

  Object.entries(refToEmp).forEach(([ref, empId]) => {
    const emp = EMPLACEMENTS[empId];
    if (!emp) return;

    const fam = emp.famille;
    const zone = zonesByFam[fam];
    if (!zone) return;

    const result =
      computeVerticalJustificationStatus(emp, zone, T);

    VALIDATION_VERTICAL_CACHE[empId] = {
      ref,
      status: result.status,
      delta: result.delta
    };
  });

  console.log(
    "✅ Validation verticale construite",
    VALIDATION_VERTICAL_CACHE
  );
}
/************************************************
 * RÈGLE MÉTIER — EMPLACEMENT AUTORISÉ OU NON
 * 🔴 BLOQUANT si un meilleur emplacement plus bas existe
 ************************************************/

function isVerticalPlacementAllowed(emp, zone, T) {
  const verdict = computeVerticalJustificationStatus(emp, zone, T);

  // 🔴 interdit strictement
  if (verdict.status === "red") return false;

  // 🟠 ou 🟢 autorisé
  return true;
}

/************************************************
 * UTILITAIRE — ROTATION PAR FAMILLE
 * (fréquence réelle issue du DT)
 ************************************************/

function computeRotationByFamille() {
  const rotation = {}; // fam -> nombre de lignes DT

  Object.values(PREPS).forEach(lignes => {
    lignes.forEach(l => {
      const fam = ARTICLE_DATA[l.article]?.famille || "AUT";
      rotation[fam] = (rotation[fam] || 0) + 1;
    });
  });

  return rotation;
}

/************************************************
 * - Uniquement par blocs complets
 ************************************************/
function buildAutoImplantationContext() {

  /* ========= COLONNES PHYSIQUES ========= */
  const colonnes = {};

  Object.entries(EMPLACEMENTS).forEach(([empId, e]) => {
  if (!isZonePicking(e)) return;
  if (isZoneInterdite(e)) return; // 🚫 AUTO-IMPLANT BLOQUÉ

  const key = `${e.allee}|${e.travee}|${e.position}`;
  colonnes[key] ??= [];
  colonnes[key].push(e);
});

  // TRI vertical A → B → C
  Object.values(colonnes).forEach(col =>
    col.sort((a, b) => a.niveau.localeCompare(b.niveau))
  );

  /* ========= INDEX ALLEE / TRAVEE ========= */
  const empIndex = {};

  Object.entries(EMPLACEMENTS).forEach(([empId, e]) => {
    if (!isZonePicking(e)) return;

    empIndex[e.allee] ??= {};
    empIndex[e.allee][e.travee] ??= [];
    empIndex[e.allee][e.travee].push(empId);
  });

  return { colonnes, empIndex };
}
async function autoImplantationParBlocs_2Phases(strategy, options = {}) {

const MODE = window.AUTO_IMPLANT_MODE || "FAST";

if (MODE === "FAST") {
  options.fastPlacement = true;
} else {
  options.fastPlacement = false;
}

  const silent = options.silent === true;

  if (!strategy || !strategy.weights) {
    console.error("Stratégie invalide", strategy);
    return { ok: false, reason: "invalid-strategy" };
  }

  console.log("▶ autoImplantationParBlocs_2Phases appelée", strategy.name);

// ==============================================
// MODE AUTO‑IMPLANTATION (FAST / PRECISE)
// ==============================================
const MODE_AUTO = window.AUTO_IMPLANT_MODE || "FAST";
const IS_PRECISE = MODE_AUTO === "PRECISE";

  // ✅ Sécurité : synchroniser le niveau courant avant auto
  const niveaux = getExistingLevels();
  if (!niveaux.includes(NIV_REIMPLANT)) {
    NIV_REIMPLANT = niveaux[0];
  }

  /* =====================================================
     PHASE 0 — RESET
     (hors travées 1–2)
  ===================================================== */

  Object.values(EMPLACEMENTS).forEach(e => {
  if (!isZonePicking(e)) return;
  if (isZoneInterdite(e)) return; // 🚫 NE PAS TOUCHER
  e.famille = null;
});

  const allees = ALLEES.split("");

  /* =====================================================
     PHASE 1 — CONSTRUCTION DES BLOCS
  ===================================================== */

  const DEMI_ALLEES = [
  { tStart: 1,  tEnd: 2  },
  { tStart: 3,  tEnd: 9  },
  { tStart: 10, tEnd: 16 }
  ];

  const blocs = [];
  DEMI_ALLEES.forEach(demi => {
    allees.forEach(allee => {
      blocs.push({
        allee,
        tStart: demi.tStart,
        tEnd: demi.tEnd,
        fam: null
      });
    });
  });
function computeBlocSpeedScore(bloc) {
  // Distance moyenne du bloc à l’entrée picking
  const midTravee = (bloc.tStart + bloc.tEnd) / 2;

  const dist = Math.abs(midTravee - ENTRY_POINT.travee);

  // Plus c’est proche → score élevé
  return 1 / (1 + dist);
}
blocs.forEach(b => {
  b.speedScore = computeBlocSpeedScore(b);
});
/* =====================================================
   PHASE 2 — IMPORTANCE FAMILLES (DÉTERMINISTE)
   ✅ basée sur stratégie métier
===================================================== */

// stratégie passée en paramètre
const importance =
  computeImportanceByFamilleWithWeights(strategy.weights);

// ✅ familles triées par importance décroissante
const famillesTriees = Object.keys(importance)
  .sort((a, b) => importance[b] - importance[a]);

if (!famillesTriees.length) {
  console.warn("Aucune famille prioritaire");
  return { ok: false, reason: "no-family" };
}

  /* =====================================================
     PHASE 3 — CIBLE PHYSIQUE MINIMUM (P80 STRICT)
  ===================================================== */

  const cibleEmpl = window.__BESOIN_CIBLE_PAR_FAM || {};

if (!Object.keys(cibleEmpl).length) {
  console.warn("Besoin cible indisponible");
  return { ok: false, reason: "no-target" };
}
  /* =====================================================
   PHASE 4 — CAPACITÉ D’UN BLOC (CORRIGÉE)
   ✅ basée sur la structure APRÈS (Δ niveaux inclus)
===================================================== */

const capBloc =
  Object.values(EMPLACEMENTS)
    .filter(e => isZonePicking(e))   // 🔑 CRUCIAL
    .filter(e => e.travee >= 10 && e.travee <= 16)
    .length
  / allees.length;

if (!capBloc || capBloc <= 0) {
  console.error("Capacité de bloc invalide");
  return { ok: false, reason: "no-capacity" };
}

/* =====================================================
   PHASE 5 — BLOCS MINIMUM (P80 GARANTI)
===================================================== */

const blocsMin = {};
Object.keys(cibleEmpl).forEach(fam => {
  blocsMin[fam] = Math.max(
    1,
    Math.ceil(cibleEmpl[fam] / capBloc)
  );
});
// ✅ Tri des blocs selon le mode
if (!IS_PRECISE) {
  // FAST : tri simple, ultra rapide
  blocs.sort((a, b) => b.speedScore - a.speedScore);
} else {
  // PRECISE : pondération vitesse + importance famille
  blocs.sort((a, b) =>
    (b.speedScore * 1.2 + (importance[b.fam] || 0)) -
    (a.speedScore * 1.2 + (importance[a.fam] || 0))
  );
}
// ==============================================
// GARDE‑FOU TEMPS — MODE PRECISE
// ==============================================
if (IS_PRECISE) {
  const MAX_BLOCS = 200;
  if (blocs.length > MAX_BLOCS) {
    blocs.length = MAX_BLOCS;
    console.warn("⚠️ PRECISE limité à", MAX_BLOCS, "blocs");
  }
}

  /* =====================================================
     PHASE 6 — ATTRIBUTION BLOCS MINIMUM
  ===================================================== */

  const familles = Object.keys(blocsMin);

  // tri décroissant par blocs minimum requis
  familles.sort((a, b) => blocsMin[b] - blocsMin[a]);

  let blocIdx = 0;
  const blocsAttribues = {};

  familles.forEach(fam => {
    blocsAttribues[fam] = [];

    for (let i = 0; i < blocsMin[fam]; i++) {
      if (blocIdx >= blocs.length) break;
      blocs[blocIdx].fam = fam;
      blocsAttribues[fam].push(blocs[blocIdx]);
      blocIdx++;
    }
  });
/* =====================================================
   PHASE 6.5 — SOMME DES IMPORTANCES
===================================================== */

const sommeImportance = Object.values(importance)
  .reduce((a, b) => a + b, 0);

if (!sommeImportance || sommeImportance <= 0) {
  alert("❌ Importance totale nulle — auto-implantation impossible");
  return;
}

  /* =====================================================
     PHASE 7 — BLOCS DE SURPLUS (RÉPARTITION %)
     ✅ AUT incluse
  ===================================================== */

  const blocsRestants = blocs.filter(b => b.fam === null);

  // poids relatifs
  const poids = {};
  Object.keys(importance).forEach(fam => {
    poids[fam] = importance[fam] / sommeImportance;
  });

  let idxFam = 0;

blocsRestants.forEach(bloc => {
  const fam = famillesTriees[idxFam % famillesTriees.length];
  bloc.fam = fam;
  blocsAttribues[fam].push(bloc);
  idxFam++;
});

/* =====================================================
   CONTEXTE AUTO-IMPLANTATION (DYNAMIQUE)
   ✅ toujours cohérent avec Δ niveaux
===================================================== */
const {
  colonnes,
  empIndex
} = buildAutoImplantationContext();

/* =====================================================
   PRÉPARATION BESOIN + SURPLUS (GLOBAL)
===================================================== */

// capacité totale réelle
const capaciteTotale = Object.values(EMPLACEMENTS)
  .filter(e => isZonePicking(e))
  .length;

// besoin total
const totalBesoinCible = Object.values(cibleEmpl)
  .reduce((a, b) => a + b, 0);

// surplus global
const surplusTotal = Math.max(0, capaciteTotale - totalBesoinCible);

// quota de surplus par famille (AUT incluse)
const surplusQuota = {};
Object.keys(cibleEmpl).forEach(fam => {
  surplusQuota[fam] =
    totalBesoinCible > 0
      ? surplusTotal * (cibleEmpl[fam] / totalBesoinCible)
      : 0;
});

// suivi du surplus réellement posé
const surplusPose = Object.fromEntries(
  Object.keys(cibleEmpl).map(f => [f, 0])
);

/* =====================================================
   FONCTION DE DÉCISION UNIQUE (BESOIN + SURPLUS)
===================================================== */

function choisirFamille(
  cibleEmpl,
  posesParFam,
  surplusQuota,
  surplusPose
) {
  const ALPHA = 0.75; // priorité besoin
  const BETA  = 0.25; // priorité partage surplus

  let bestFam = null;
  let bestScore = -Infinity;

  Object.keys(cibleEmpl).forEach(fam => {
    const besoinRestant = Math.max(
      0,
      cibleEmpl[fam] - (posesParFam[fam] || 0)
    );

    const surplusRestant = Math.max(
      0,
      surplusQuota[fam] - (surplusPose[fam] || 0)
    );

    const besoinScore =
      cibleEmpl[fam] > 0 ? besoinRestant / cibleEmpl[fam] : 0;

    const surplusScore =
      surplusQuota[fam] > 0 ? surplusRestant / surplusQuota[fam] : 0;

    const GAMMA = 1.5; // 🔑 pénalisation sous-dimensionnement

const manque = Math.max(0, cibleEmpl[fam] - (posesParFam[fam] || 0));

const underScore =
  cibleEmpl[fam] > 0
    ? manque / cibleEmpl[fam]
    : 0;

const score =
  ALPHA * besoinScore +
  BETA  * surplusScore +
  GAMMA * underScore;

    if (score > bestScore) {
      bestScore = score;
      bestFam = fam;
    }
  });

  return bestFam;
}

/* =====================================================
   PHASE 8 — POSE DES EMPLACEMENTS (CORRIGÉE)
   ✅ 1 bloc = 1 famille (déjà décidée)
   ✅ colonnes verticales complètes
   ✅ PAS d’écrasement
   ✅ comptage réel en niveaux
===================================================== */

const posesCapaciteParFam = {};
Object.keys(cibleEmpl).forEach(fam => {
  posesCapaciteParFam[fam] = 0;
});

let doneBlocs = 0;
const totalBlocs = blocs.length;

for (const bloc of blocs) {

const familleBloc = bloc.fam || "AUT";

  /* =========================================
     1️⃣ Collecte des colonnes PHYSIQUES du bloc
  ========================================= */
  const colonnesBloc = {};

  for (let tr = bloc.tStart; tr <= bloc.tEnd; tr++) {
    const ids = empIndex[bloc.allee]?.[tr];
    if (!ids) continue;

    ids.forEach(empId => {
      const e = EMPLACEMENTS[empId];
      if (!e) return;
      if (!emplacementExiste(e.allee, e.travee, e.position, e.niveau)) return;

      const key = `${e.allee}|${e.travee}|${e.position}`;
      colonnesBloc[key] ??= [];
      colonnesBloc[key].push(e);
    });
  }

  /* =========================================
     2️⃣ Sélection des colonnes posables
        - vide OU déjà homogène
        - tri vertical A → B → C
  ========================================= */

  const colonnesValides = [];

  Object.values(colonnesBloc).forEach(colonne => {
    colonne.sort((a, b) => a.niveau.localeCompare(b.niveau));

    const famillesPresentes = new Set(
      colonne.map(e => e.famille).filter(f => f !== null)
    );

    if (
      famillesPresentes.size === 0 ||
      (famillesPresentes.size === 1 &&
        famillesPresentes.has(familleBloc))
    ) {
      colonnesValides.push(colonne);
    }
  });

  if (!colonnesValides.length) {
    doneBlocs++;
    continue;
  }

/* =========================================
   3️⃣ Pose réelle du bas vers le haut
   ✅ bloc entier affecté à UNE famille
========================================= */

for (const colonne of colonnesValides) {
  for (const e of colonne) {
    if (isZoneInterdite(e)) continue; // 🚫 INTERDIT
    if (e.famille !== null) continue;

    e.famille = familleBloc;
    posesCapaciteParFam[familleBloc]++;
  }
}

  /* =========================================
     4️⃣ Progression
  ========================================= */
  doneBlocs++;

// ✅ laisse respirer le browser
await nextFrame();
}
/* =====================================================
   FINALISATION
===================================================== */

IMPLANTATION_ACTIVE = true;

rebuildEmpIndex();
rebuildEmplCountByFam();
computeAideImplantation();
drawZonePlan();
}
/************************************************
 * SIMULATION PICKING — VERSION PROPRE
 * BLOC N — DUPLICATION FAMILLE (PROPRE)
 ************************************************/

function duplicateLevelFamille(sourceLevel, targetLevels, mode = "overwrite") {
  targetLevels.forEach(target => {
    ensureFullLevel(target);

    Object.values(EMPLACEMENTS).forEach(src => {
      if (src.niveau !== sourceLevel) return;
      if (!src.famille) return;

      const empIdTarget =
        `${src.allee}${String(src.travee).padStart(2, "0")}${target}${src.position}`;

      const tgt = EMPLACEMENTS[empIdTarget];
      if (!tgt) return;

      if (mode === "fillEmpty") {
        if (!tgt.famille) tgt.famille = src.famille;
      } else {
        tgt.famille = src.famille;
      }
    });
  });

  IMPLANTATION_ACTIVE = true;

  rebuildEmpIndex();
  drawZonePlan();
  rebuildEmplCountByFam();
  computeAideImplantation();
}

/* =========================
   BIND BOUTON DUPLICATION
========================= */

document.getElementById("btnDuplicate")?.addEventListener("click", () => {

  const isReimplantation =
    document
      .getElementById("tab-reimplantation")
      ?.classList.contains("active");

  const source = isReimplantation ? NIV_REIMPLANT : NIV_ACTUEL;

  if (!source) {
    alert("Niveau source non défini (aucun niveau actif).");
    return;
  }

  const txt = prompt(
    `Dupliquer la famille du niveau ${source} vers quels niveaux ?\nExemple : B,C,D`,
    ""
  );
  if (!txt) return;

  const niveauxExistants = getExistingLevels();

const targets = txt
  .split(",")
  .map(s => s.trim().toUpperCase())
  .filter(
    s =>
      s &&
      s !== source &&
      niveauxExistants.includes(s)
  );

if (!targets.length) {
  alert("Aucun niveau cible valide (selon les hauteurs actuelles).");
  return;
}

  const mode = confirm(
    "OK = ÉCRASER les familles\nAnnuler = COMPLÉTER seulement les cases vides"
  )
    ? "overwrite"
    : "fillEmpty";

  duplicateLevelFamille(source, targets, mode);
});

console.log("✅ FIN FICHIER ATTEINTE");
function snapshotImplantation() {
  const snap = {};

  Object.entries(EMPLACEMENTS).forEach(([empId, e]) => {
    if (!isZonePicking(e)) return;
    snap[empId] = e.famille;
  });

  return snap;
}
function restoreImplantation(snapshot) {
  if (!snapshot) return;

  Object.entries(snapshot).forEach(([empId, fam]) => {
    if (EMPLACEMENTS[empId]) {
      EMPLACEMENTS[empId].famille = fam;
    }
  });
}
async function autoImplantationParImportance() {

  console.log("🟢 CLICK autoImplantation");

  if (AUTO_IMPLANT_RUNNING) {
    console.warn("⛔ Auto‑implantation déjà en cours");
    return;
  }
  AUTO_IMPLANT_RUNNING = true;

  // ✅ Affichage du loader AVANT tout calcul
  showLoader();
  await nextFrame();

  const startTime = performance.now();

  try {
    const strategies = buildImportanceStrategies();

    let bestTime = Infinity;
    let bestSnapshot = null;
    let bestName = "";

    // ✅ Paramètres temps (définis UNE SEULE FOIS)
    const T = {
      X: +tX.value,
      Zup: +tZup.value,
      Zdown: +tZdown.value,
      ROT: +tRot.value,
      POS: +tPos.value,
      PAL: +tPal.value,
      UM: +tUM.value,
      SCAN: +tScan.value,
      MARGE: +tMarge.value / 100
    };

    const total = strategies.length;
    let done = 0;

    setLoaderProgress(0, "Auto‑implantation en cours…");
    await nextFrame();

    /* =====================================================
       BOUCLE STRATÉGIES (SANS OPTIMISATION GLOBALE)
    ===================================================== */

    for (const strategy of strategies) {

      const result = await autoImplantationParBlocs_2Phases(
        strategy,
        { silent: true }
      );
      if (result?.ok === false) continue;

      done++;

      // ⏱ temps réel
      const elapsedSec = Math.round(
        (performance.now() - startTime) / 1000
      );

      const avgPerStrategy = elapsedSec / done;
      const remainingSec = Math.round(
        avgPerStrategy * (total - done)
      );

      // 🧮 temps métier
      const assign = assignReferencesToEmplacements();
      if (!assign.feasible) continue;

      const tempsPrep = computeTotalTime(
        l => {
          const empId = assign.refToEmp[l.article];
          return empId ? empFromId(empId) : null;
        },
        T
      );

      // ✅ UI (loader uniquement)     
const pct = Math.min(95, Math.round((done / total) * 100));
setLoaderProgress(
  pct,
        `⏱ Auto‑implantation : ${elapsedSec}s écoulées — ~${remainingSec}s restantes
🧮 Temps de préparation : ${(tempsPrep / 3600).toFixed(2)} h`
      );

      await nextFrame();

      // ✅ sélection du meilleur
      if (bestTime < Infinity && tempsPrep > bestTime * 1.05) continue;

      if (tempsPrep < bestTime) {
        bestTime = tempsPrep;
        bestSnapshot = snapshotImplantation();
        bestName = strategy.name;
      }
    }

    /* =====================================================
       RESTAURATION MEILLEURE IMPLANTATION
    ===================================================== */

    if (!bestSnapshot) {
      throw new Error("Aucune implantation valide trouvée");
    }

    restoreImplantation(bestSnapshot);

    /* =====================================================
       ✅ OPTIMISATION GLOBALE — UNE SEULE FOIS
    ===================================================== */

    if (ENABLE_OPTIMISATION_GLOBALE) {

      setLoaderProgress(95, "Optimisation globale finale…");

      const state0 = extractStateFromEmplacements();

      if (!state0 || !Object.keys(state0).length) {
        throw new Error("state0 vide — optimisation impossible");
      }

      console.time("anneal");
      const bestAnnealed = anneal(state0, T);
      console.timeEnd("anneal");

      if (!bestAnnealed) {
        throw new Error("anneal() a retourné un état invalide");
      }

      applyStateToEmplacements(bestAnnealed);
    }

    /* =====================================================
       FINALISATION
    ===================================================== */

    IMPLANTATION_ACTIVE = true;
    rebuildEmpIndex();
    rebuildEmplCountByFam();
    drawZonePlan();
    computeAideImplantation();

    const totalSec = ((performance.now() - startTime) / 1000).toFixed(1);

    hideLoader();

    alert(
      `✅ Auto‑implantation terminée\n` +
      `Stratégie retenue : ${bestName}\n` +
      `🧮 Temps préparation : ${(bestTime / 3600).toFixed(2)} h\n` +
      `⏱ Temps de calcul : ${totalSec} s`
    );

  } catch (err) {
    console.error("💥 CRASH autoImplantationParImportance", err);
    hideLoader();
    alert("❌ Erreur pendant l’auto‑implantation.\nVoir console.");
  } finally {
    AUTO_IMPLANT_RUNNING = false;
  }
}
async function exportComparisonPDF() {

  // 🔒 garde‑fou
  if (
    !window.__SPACE_AVANT ||
    !window.__SPACE_APRES ||
    !window.__TEMPS_AVANT ||
    !window.__TEMPS_APRES
  ) {
    alert("Comparaison non disponible.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF("p", "mm", "a4");

  const pageW = pdf.internal.pageSize.getWidth();
  const margin = 15;
  let y = 20;

  /* =========================
     PAGE 1 — SYNTHÈSE
  ========================= */

  pdf.setFont("Helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text("Comparaison Implantation AVANT / APRÈS", margin, y);
  y += 10;

  pdf.setFontSize(10);
  pdf.setFont("Helvetica", "normal");
  pdf.text(`Date : ${new Date().toLocaleDateString()}`, margin, y);
  y += 10;

  const tAvantH = (window.__TEMPS_AVANT / 3600).toFixed(2);
  const tApresH = (window.__TEMPS_APRES / 3600).toFixed(2);
  const gainH = (tAvantH - tApresH).toFixed(2);
  const gainPct =
    window.__TEMPS_AVANT > 0
      ? ((window.__TEMPS_AVANT - window.__TEMPS_APRES) / window.__TEMPS_AVANT * 100).toFixed(1)
      : "0";

  const rows = [
    ["Temps total", `${tAvantH} h`, `${tApresH} h`],
    ["Gain de temps", `${gainH} h`, `${gainPct} %`],
    ["Emplacements",
      window.__SPACE_AVANT.total,
      window.__SPACE_APRES.total
    ],
    ["Surface",
      `${window.__SPACE_AVANT.surfaceTotal.toFixed(0)} m²`,
      `${window.__SPACE_APRES.surfaceTotal.toFixed(0)} m²`
    ]
  ];

  rows.forEach(r => {
    pdf.text(r[0], margin, y);
    pdf.text(String(r[1]), margin + 70, y);
    pdf.text(String(r[2]), margin + 120, y);
    y += 6;
  });

  /* =========================
     PAGE 2 — PLAN
  ========================= */

  pdf.addPage();
  pdf.setFont("Helvetica", "bold");
  pdf.text("Plan de réimplantation", margin, 20);
  document
  .getElementById("tab-reimplantation")
  ?.classList.add("active");
  const canvas = document.getElementById("plan2D-reimplantation");
  if (!canvas) {
    alert("Canvas de réimplantation introuvable.");
    return;
  }

  // ✅ export DIRECT du canvas (pas html2canvas)
const rect = canvas.getBoundingClientRect();

if (rect.width === 0 || rect.height === 0) {
  alert("Plan non visible — active l’onglet Réimplantation avant export.");
  return;
}

const imgData = canvas.toDataURL("image/png");

const imgW = pageW - margin * 2;
const imgH = rect.height * imgW / rect.width;

  pdf.addImage(imgData, "JPEG", margin, 30, imgW, imgH);

  /* =========================
     PAGE 3 — FAMILLES
  ========================= */

  pdf.addPage();
  pdf.text("Détail par famille", margin, 20);

  let yFam = 30;
  Object.entries(window.__BESOIN_CIBLE_PAR_FAM || {}).forEach(([fam, cible]) => {
    const poses = EMPL_COUNT_BY_FAM[fam] || 0;
    const manque = Math.max(0, cible - poses);
    const statut = manque === 0 ? "OK" : "Sous‑dimensionné";

    pdf.text(
      `${fam} — Besoin:${cible} | Posés:${poses} | Manque:${manque} | ${statut}`,
      margin,
      yFam
    );

    yFam += 6;
    if (yFam > 280) {
      pdf.addPage();
      yFam = 20;
    }
  });

  pdf.save("Comparaison_Implantation.pdf");
}
function exportComparisonExcel() {
  alert("Export Excel non implémenté (PDF OK).");
}

function exportReimplantationPlanImage() {
  const canvas = document.getElementById("plan2D-reimplantation");
  if (!canvas) {
    alert("Canvas introuvable");
    return;
  }

  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = "Plan_Reimplantation.png";
  a.click();
}

