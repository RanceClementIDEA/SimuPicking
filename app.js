/************************************************
 * SIMULATION PICKING — VERSION PROPRE
 * BLOC A — CONSTANTES & ÉTAT GLOBAL
 ************************************************/

console.log("✅ app.js chargé");

/* =========================
   ÉTAT GLOBAL
========================= */

let PREPS = {};
let NB_LIGNES = 0;
let ARTICLE_DATA = {};
let HEATMAP = {};
let EMPLACEMENTS = {};
let EMP_FAMILIES = {};
let PREP_DATES = {};
let STOCK_ROWS = [];
let HISTO_ANALYSIS = {
  worstSnapshot: {},
  capByFam: {}
};

let FILTERS = {
  niveau: "",
  famille: ""
};

let ACTIVE_FAMILLE = null;
let SELECTED = new Set();

/* =========================
   RÈGLES MÉTIER
========================= */

// === TEMPS FIXES MÉTIER ===
const TEMPS_SEQUENCEUR = 18; // s : séquenceur <-> entrée NEF2


// ✅ seuil utilisé ailleurs → on le garde
const SEUIL_MIN_P80 = 2;

// Familles STRUCTURANTES : interdites en AUTRES
const STRUCTURING_FAMILIES = new Set([
  "TA", // Accessoires techniques
  "EL", // Électricité
  "AC", // Accastillage / coque
  "RO", // Robinetterie
  "HV", // HVAC
  "CO", // Consommables mécaniques
  "EP", // Équipements
  "IN", // Instrumentation
  "SE"  // Serrurerie
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

let EMP_INDEX = new Map();
let IMPLANTATION_ACTIVE = false;

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

// Niveaux possibles (ordre alphabétique)
const NIVEAUX_AUTORISES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

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

let ROW_INDEX = {};     // clé: allee|travee|position -> rowIndex
let ROWS_TOTAL = 0;    // nombre réel de lignes écran

/* =========================
   FONCTIONS CANONIQUES
========================= */

function isPositionValide(travee, position) {
  if (TRAVEE_POSITIONS[travee]) {
    return TRAVEE_POSITIONS[travee].includes(position);
  }
  return POSITIONS_PAR_DEFAUT.includes(position);
}

function isNiveauValide(allee, travee, niveau) {
  const key = `${allee}_${String(travee).padStart(2, "0")}`;
  const max = HAUTEUR_MAX[key];
  if (!max) return false;

  return niveau.charCodeAt(0) <= max.charCodeAt(0);
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
  const loader = document.getElementById("loader");
  if (loader) loader.classList.remove("hidden");
  setLoaderProgress(0, "Initialisation…");
}

function hideLoader() {
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

function normalizeFamilleCode(rawFam) {
  if (rawFam == null) return "VIDE";

  const txt = rawFam
    .toString()
    .replace(/[\u00A0]/g, " ") // ✅ espace insécable → espace normal
    .replace(/\s+/g, "")       // ✅ supprime TOUS les blancs
    .toUpperCase();

  if (!txt) return "VIDE";

  if (/^SE\d+$/.test(txt)) return "SE";
  if (txt.startsWith("SEM")) return "SEM";

  const code = txt.replace(/[0-9]/g, "");
  return code || "VIDE";
}

function computeFinalFamily(code) {
  if (!code) return "AUT";

  if (STRUCTURING_FAMILIES.has(code)) {
    return code;
  }

  return "AUT";
}

function getFamilleImplantation(familleBrute) {
  if (!familleBrute) return "AUT";

  return STRUCTURING_FAMILIES.has(familleBrute)
    ? familleBrute
    : "AUT";
}

/************************************************
 * BESOIN EMPLACEMENTS — STOCK RÉEL (AVEC DORMANT)
 ************************************************/

function computeStockNeedByFamille(stockRows) {
  const need = {};

  if (!Array.isArray(stockRows)) return need;

  /* =========================
     1) REGROUPEMENT PAR EMPLACEMENT
  ========================= */

  const empToFams = {}; // empId -> Set(familles)

  stockRows.forEach(row => {
    const article = row["Article"];
    const empRaw = row["Emplacement"] || row["Emplacement stock"] || row["EMPLACEMENT"];
    const qty = Number(row["Stock disponible"]) || 0;

    if (!article || !empRaw || qty <= 0) return;

    const famBrute = ARTICLE_DATA[article]?.famille || "AUT";
    const fam = getFamilleImplantation(famBrute);

    const empId = empRaw.toString().trim();
    if (!empId) return;

    empToFams[empId] ??= new Set();
    empToFams[empId].add(fam);
  });

  /* =========================
     2) PARTAGE DE L’EMPLACEMENT
  ========================= */

  Object.values(empToFams).forEach(famsSet => {
    const fams = Array.from(famsSet);
    const part = 1 / fams.length; // ex : 4 familles → 0.25

    fams.forEach(fam => {
      need[fam] = (need[fam] || 0) + part;
    });
  });

  /* =========================
     3) ARRONDI FINAL (SÉCURITÉ)
  ========================= */

  Object.keys(need).forEach(fam => {
    need[fam] = Math.ceil(need[fam]);
  });

  return need;
}


console.log("✅ BLOC D chargé");

/************************************************
 * SIMULATION PICKING — VERSION PROPRE
 * BLOC E — MODÈLE ENTREPÔT (EMPLACEMENTS)
 ************************************************/

/**
 * Initialise EMPLACEMENTS à partir du DT
 * (uniquement les emplacements réellement présents)
 *
 * @param {Array<Object>} rows - lignes du DT (sheet_to_json)
 * @param {string} empCol - nom de la colonne "emplacement"
 */
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
 * Retourne la liste des niveaux existants
 * @returns {Array<string>}
 */
function getExistingLevels() {
  return Array.from(
    new Set(Object.values(EMPLACEMENTS).map(e => e.niveau))
  ).sort();
}

console.log("✅ BLOC E chargé");

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
  const allee = heightAllee.value;
  const tr = heightTravee.value;
  const niveau = heightNiveau.value;

  const key = `${allee}_${String(tr).padStart(2, "0")}`;
  HAUTEUR_MAX[key] = niveau;

  console.log("✅ Hauteur max modifiée :", key, niveau);

  rebuildEmpIndex();
  resizeImplantationCanvas();
  drawZonePlan();
  drawHeatmapAvant("plan2D");
});

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

    // ✅ lignes physiques de la travée
    for (let pos of POSITIONS_PAR_DEFAUT) {

      let ligneExiste = false;
      for (let ai = 0; ai < ALLEES.length; ai++) {
        if (emplacementExiste(ALLEES[ai], tr, pos, niveau)) {
          ligneExiste = true;
          break;
        }
      }
      if (!ligneExiste) continue;

      for (let ai = 0; ai < ALLEES.length; ai++) {
        const allee = ALLEES[ai];
        if (!emplacementExiste(allee, tr, pos, niveau)) continue;
        ROW_INDEX[`${allee}|${tr}|${pos}`] = row;
      }

      row++;
    }

    // ✅ ALLÉES DE PASSAGE VISUELLES
    if (tr === 2 || tr === 9) {
      row++; // ligne vide
    }
  }

  ROWS_TOTAL = row;
  console.log("✅ Grille physique avec passages :", ROWS_TOTAL, "lignes");
}

function getTraveeMidRow(travee) {
  const rows = Object.entries(ROW_INDEX)
    .filter(([key]) => Number(key.split("|")[1]) === travee)
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

  const niveau = FILTERS.niveau;
  if (!niveau) return;

  // ✅ CONSTRUCTION DE LA GRILLE PHYSIQUE
  rebuildPhysicalGrid(niveau);

  for (let ai = 0; ai < ALLEES.length; ai++) {
    const allee = ALLEES[ai];

    for (let tr = TRAVEE_MIN; tr <= TRAVEE_MAX; tr++) {
      for (let pos of POSITIONS_PAR_DEFAUT) {

        if (!emplacementExiste(allee, tr, pos, niveau)) continue;

        const row = ROW_INDEX[`${allee}|${tr}|${pos}`];
        if (row == null) continue;

        const key = `${niveau}|${ai}|${row}`;
        const empId = `${allee}${String(tr).padStart(2, "0")}${niveau}${pos}`;
        EMP_INDEX.set(key, empId);
      }
    }
  }

  console.log("✅ EMP_INDEX physique :", EMP_INDEX.size);
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
  const maxRows = (TRAVEE_MAX - TRAVEE_MIN + 1) * POSITIONS;

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

  const key = `${FILTERS.niveau}|${cell.alleeIndex}|${cell.row}`;
  return EMP_INDEX.get(key) || null;
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

// === DISTANCE HORIZONTALE ===
function distanceTravee(a, b, T) {
  return Math.abs(a.travee - b.travee) * T.X;
}

function orderByNearest(start, emplacements, T) {
  const remaining = [...emplacements];
  const ordered = [];
  let current = start;

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = distanceTravee(current, remaining[0], T);

    for (let i = 1; i < remaining.length; i++) {
      const d = distanceTravee(current, remaining[i], T);
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
    total += distanceTravee(ENTRY_POINT, parcours[0], T);

    for (let i = 0; i < parcours.length; i++) {
      const emp = parcours[i];

      // Déplacement vertical
      const z = emp.niveau.charCodeAt(0) - 65;
      total += (T.Zup + T.Zdown) * 2 * z;

      // Gestes opérateur
      total += T.POS + T.PAL + T.UM + T.SCAN;

      // ✅ Vers l’emplacement suivant le plus proche
      if (i < parcours.length - 1) {
        total += distanceTravee(emp, parcours[i + 1], T);
      }
    }

    // ✅ Dernier emplacement → Entrée NEF2
    total += distanceTravee(
      parcours[parcours.length - 1],
      ENTRY_POINT,
      T
    );

    // ✅ Entrée NEF2 → Séquenceur
    total += TEMPS_SEQUENCEUR;
  }

  // Marge finale
  return total * (1 + T.MARGE);
}

console.log("✅ BLOC G chargé");

/************************************************
 * SIMULATION PICKING — VERSION PROPRE
 * BLOC H — HEATMAP AVANT
 ************************************************/

/**
 * Redimensionne le canvas heatmap
 * À appeler après chargement du DT
 */
function resizeHeatmapCanvas() {
  const canvas = document.getElementById("plan2D");
  if (!canvas) return;

  const cols = ALLEES.length;
  const rows = (TRAVEE_MAX - TRAVEE_MIN + 1) * POSITIONS;

  canvas.width  = VIEW.offsetX + cols * VIEW.cellW + 220;
  canvas.height = VIEW.offsetY + rows * VIEW.cellH + 60;

  console.log("✅ Heatmap canvas dimensionné :", canvas.width, canvas.height);
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
function drawHeatmapAvant(canvasId = "plan2D") {
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
  ctx.fillText(`Heatmap AVANT — Niveau ${niveau}`, 20, 30);

  /* =========================
     LÉGENDES
  ========================= */

  // Allées (X)
  ctx.font = "bold 12px Arial";
  ctx.textAlign = "center";
  for (let ai = 0; ai < ALLEES.length; ai++) {
    const x = VIEW.offsetX + ai * VIEW.cellW + VIEW.cellW / 2;
    ctx.fillText(ALLEES[ai], x, VIEW.offsetY - 22);
  }

  // Positions (Y)
  ctx.font = "11px Arial";
  ctx.textAlign = "right";
  for (let p = 1; p <= POSITIONS; p++) {
    const y = VIEW.offsetY + (p - 0.5) * VIEW.cellH;
    ctx.fillText(`P${p}`, VIEW.offsetX - 45, y);
  }

  // Travées
  for (let tr = TRAVEE_MIN; tr <= TRAVEE_MAX; tr++) {
    const baseRow = (tr - TRAVEE_MIN) * POSITIONS;
    const yMid = VIEW.offsetY + (baseRow + POSITIONS / 2) * VIEW.cellH;
    ctx.fillText(String(tr), VIEW.offsetX - 12, yMid);
  }

  /* =========================
     NORMALISATION
  ========================= */

  let maxFreq = 1;

  Object.entries(HEATMAP).forEach(([empId, freq]) => {
    const e = EMPLACEMENTS[empId];
    if (!e || e.niveau !== niveau) return;
    if (!emplacementExiste(e.allee, e.travee, e.position, e.niveau)) return;
    if (freq > maxFreq) maxFreq = freq;
  });

  /* =========================
     DESSIN HEATMAP
  ========================= */

  Object.entries(HEATMAP).forEach(([empId, freq]) => {
    const e = EMPLACEMENTS[empId];
    if (!e || e.niveau !== niveau) return;
    if (!emplacementExiste(e.allee, e.travee, e.position, e.niveau)) return;

    const ai = ALLEES.indexOf(e.allee);
    if (ai < 0) return;

    const row = ROW_INDEX[`${e.allee}|${e.travee}|${e.position}`];
if (row == null) return;
    const t = Math.log(freq + 1) / Math.log(maxFreq + 1);

    const x = VIEW.offsetX + ai * VIEW.cellW;
    const y = VIEW.offsetY + row * VIEW.cellH;

    ctx.fillStyle = heatGradient01(t);
    ctx.fillRect(x + 1, y + 1, VIEW.cellW - 2, VIEW.cellH - 2);
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

    const row = ROW_INDEX[`${e.allee}|${e.travee}|${e.position}`];
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
 * Dessine le plan d’implantation
 */
function drawZonePlan() {
  const canvas = document.getElementById("plan2D-interactif");
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

  // Travées (centrées dynamiquement)
  ctx.font = "11px Arial";
  ctx.textAlign = "right";

  for (let tr = TRAVEE_MIN; tr <= TRAVEE_MAX; tr++) {
    const midRow = getTraveeMidRow(tr);
    if (midRow == null) continue;

    const y = VIEW.offsetY + (midRow + 0.5) * VIEW.cellH;
    ctx.fillText(String(tr), VIEW.offsetX - 12, y);
  }

 // === Séparateurs de travées (léger) ===
ctx.strokeStyle = "#e0e0e0";
ctx.lineWidth = 1;

for (let tr = TRAVEE_MIN; tr <= TRAVEE_MAX; tr++) {
  const midRow = getTraveeMidRow(tr);
  if (midRow == null) continue;

  const y =
    VIEW.offsetY +
    (midRow + 0.5) * VIEW.cellH +
    VIEW.cellH / 2;

  ctx.beginPath();
  ctx.moveTo(VIEW.offsetX - 40, y);
  ctx.lineTo(VIEW.offsetX + ALLEES.length * VIEW.cellW, y);
  ctx.stroke();
}

  /* ===== DESSIN DES CASES ===== */

  for (let ai = 0; ai < ALLEES.length; ai++) {
    const allee = ALLEES[ai];

    Object.entries(ROW_INDEX)
      .filter(([key]) => key.startsWith(`${allee}|`))
      .forEach(([key, row]) => {
        const [, tr, pos] = key.split("|").map(v => isNaN(v) ? v : Number(v));
        const empId = `${allee}${String(tr).padStart(2, "0")}${niveau}${pos}`;

        const e = EMPLACEMENTS[empId];
        const famille = e?.famille || null;
        const filteredOut = !empMatchesFamille(empId, FILTERS.famille);

        const x = VIEW.offsetX + ai * VIEW.cellW;
        const y = VIEW.offsetY + row * VIEW.cellH;

        ctx.fillStyle = filteredOut ? "#ffffff" : colorByFamille(famille);
        ctx.fillRect(x + 1, y + 1, VIEW.cellW - 2, VIEW.cellH - 2);

        if (SELECTED.has(empId)) {
          ctx.strokeStyle = "#0066ff";
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 2, y + 2, VIEW.cellW - 4, VIEW.cellH - 4);
          ctx.lineWidth = 1;
        }

        if (famille && !filteredOut) {
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
      });
  }

  updateToolbarInfo();
}

console.log("✅ BLOC I chargé");

function updateAutDetails() {
  const box = document.getElementById("autDetailsContent");
  if (!box) return;

  if (!AUT_GEST_DETAILS || Object.keys(AUT_GEST_DETAILS).length === 0) {
    box.textContent = "AUT (Autres) : aucun détail.";
    return;
  }

  box.innerHTML = Object.entries(AUT_GEST_DETAILS)
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
 * Convertit la position souris en cellule écran
 */
function getCellFromMouse(canvas, ev) {
  const rect = canvas.getBoundingClientRect();
  const px = ev.clientX - rect.left - VIEW.offsetX;
  const py = ev.clientY - rect.top - VIEW.offsetY;

  if (px < 0 || py < 0) return null;

  const alleeIndex = Math.floor(px / VIEW.cellW);
  const row = Math.floor(py / VIEW.cellH);

  const maxAllees = ALLEES.length;
  const maxRows = (TRAVEE_MAX - TRAVEE_MIN + 1) * POSITIONS;

  if (alleeIndex < 0 || alleeIndex >= maxAllees) return null;
  if (row < 0 || row >= maxRows) return null;

  return { alleeIndex, row };
}

/**
 * Convertit une cellule écran en empId métier
 */
function empIdFromCell(cell) {
  const niveau = FILTERS.niveau;
  if (!niveau) return null;

  const allee = ALLEES[cell.alleeIndex];
  const travee = TRAVEE_MIN + Math.floor(cell.row / POSITIONS);
  const position = 1 + (cell.row % POSITIONS);

  if (!emplacementExiste(allee, travee, position, niveau)) return null;

return `${allee}${String(travee).padStart(2,"0")}${niveau}${position}`;
}

/**
 * Sélection par rectangle
 */
function selectRectangle(c1, c2, additive) {
  if (!additive) SELECTED.clear();

  const minA = Math.min(c1.alleeIndex, c2.alleeIndex);
  const maxA = Math.max(c1.alleeIndex, c2.alleeIndex);
  const minR = Math.min(c1.row, c2.row);
  const maxR = Math.max(c1.row, c2.row);

  for (let ai = minA; ai <= maxA; ai++) {
    for (let r = minR; r <= maxR; r++) {
      const empId = empIdFromCell({ alleeIndex: ai, row: r });
      if (empId && EMPLACEMENTS[empId]) {
        SELECTED.add(empId);
      }
    }
  }
}

/**
 * Bind des interactions souris (UNE SEULE FOIS)
 */
function bindPlanInteractionOnce() {
  const canvas = document.getElementById("plan2D-interactif");
  if (!canvas) return;

  if (canvas.dataset.bound === "1") return;
  canvas.dataset.bound = "1";

  // Début drag
  canvas.addEventListener("mousedown", ev => {
    if (ev.button !== 0) return;
    const cell = getCellFromMouse(canvas, ev);
    if (!cell) return;

    DRAG_START = cell;
    DRAG_IN_PROGRESS = false;
  });

  // Fin drag → sélection rectangle
  canvas.addEventListener("mouseup", ev => {
    if (!DRAG_START) return;

    const endCell = getCellFromMouse(canvas, ev);
    if (!endCell) {
      DRAG_START = null;
      return;
    }

    DRAG_IN_PROGRESS = true;
    selectRectangle(DRAG_START, endCell, ev.shiftKey);
    DRAG_START = null;

    drawZonePlan();
    computeAideImplantation();
  });

  // Clic simple
  canvas.addEventListener("click", ev => {
    if (DRAG_IN_PROGRESS) {
      DRAG_IN_PROGRESS = false;
      return; // empêche le clic fantôme après drag
    }

    const cell = getCellFromMouse(canvas, ev);
    if (!cell) return;

    const empId = empIdFromCell(cell);
    if (!empId || !EMPLACEMENTS[empId]) return;

    if (ev.shiftKey) {
      if (SELECTED.has(empId)) SELECTED.delete(empId);
      else SELECTED.add(empId);
    } else {
      SELECTED.clear();
      SELECTED.add(empId);
    }

    drawZonePlan();
    computeAideImplantation();
  });

  // Bouton : vider sélection
  document.getElementById("btnClearSel")?.addEventListener("click", () => {
    SELECTED.clear();
    drawZonePlan();
    computeAideImplantation();
  });

  // Bouton : appliquer / effacer famille
  document.getElementById("btnApply")?.addEventListener("click", () => {
    if (SELECTED.size === 0) {
      alert("Sélectionne au moins une case.");
      return;
    }

    SELECTED.forEach(empId => {
      if (EMPLACEMENTS[empId]) {
        EMPLACEMENTS[empId].famille = ACTIVE_FAMILLE; // null = effacer
      }
    });

    IMPLANTATION_ACTIVE = true;

    drawZonePlan();
  });

  console.log("✅ Interaction plan bindée");
}

console.log("✅ BLOC J chargé");

/************************************************
 * SIMULATION PICKING — VERSION PROPRE
 * BLOC K — UI (FAMILLE & NIVEAUX)
 ************************************************/

/* =========================
   FILTRE NIVEAU
========================= */

function fillLevelSelect() {
  const levelSel = document.getElementById("levelSelect");
  if (!levelSel) return;

  levelSel.innerHTML = "";

  getExistingLevels().forEach(niv => {
    const opt = document.createElement("option");
    opt.value = niv;
    opt.textContent = `Niveau ${niv}`;
    levelSel.appendChild(opt);
  });

  if (FILTERS.niveau) {
    levelSel.value = FILTERS.niveau;
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
const famillesActives = ["AUT", ...STRUCTURING_FAMILIES];

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
    FILTERS.niveau = levelSel.value;
    SELECTED.clear();
    ensureFullLevel(FILTERS.niveau);
    rebuildEmpIndex();
    drawZonePlan();
    drawHeatmapAvant("plan2D");
  });

  // Filtre famille
  famSel?.addEventListener("change", () => {
    FILTERS.famille = famSel.value;
    drawZonePlan();
  });
}

/* =========================
   INIT UI GLOBAL
========================= */

function initUI() {
  fillLevelSelect();
  fillFamilleFilter();
  initFamillePalette();
  bindUIOnce();
  updateToolbarInfo();
  initHeightEditor();
  console.log("✅ initUI OK");
}

console.log("✅ BLOC K chargé");

/************************************************
 * SIMULATION PICKING — VERSION PROPRE
 * BLOC K2 — RESIZE CANVAS & AIDE À L’IMPLANTATION
 ************************************************/

/* =========================
   RESIZE CANVAS IMPLANTATION
========================= */

function resizeImplantationCanvas() {
  const canvas = document.getElementById("plan2D-interactif");
  if (!canvas) return;

  const cols = ALLEES.length; // A → N
  const rows = ROWS_TOTAL;

  canvas.width  = VIEW.offsetX + cols * VIEW.cellW + 40;
  canvas.height = VIEW.offsetY + rows * VIEW.cellH + 40;

  console.log(
    "✅ Canvas implantation dimensionné :",
    canvas.width,
    canvas.height
  );
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

  const prepList = Object.entries(PREPS)
    .map(([prepId, lignes]) => ({
      prepId,
      date: PREP_DATES[prepId],
      lignes
    }))
    .filter(p => p.date instanceof Date && !isNaN(p.date))
    .sort((a, b) => a.date - b.date);

  if (prepList.length === 0) {
    console.warn("⚠️ Aucun historique exploitable");
    return;
  }

  /* === capacité réelle par emplacement === */
  const empPrepRefs = {};

  prepList.forEach(p => {
    p.lignes.forEach(l => {
      empPrepRefs[l.empId] ??= {};
      empPrepRefs[l.empId][p.prepId] ??= new Set();
      empPrepRefs[l.empId][p.prepId].add(l.article);
    });
  });

  const capByEmp = {};
  Object.entries(empPrepRefs).forEach(([empId, prepMap]) => {
    let maxSimul = 1;
    Object.values(prepMap).forEach(set => {
      if (set.size > maxSimul) maxSimul = set.size;
    });
    capByEmp[empId] = maxSimul;
  });

  /* === capacité moyenne réelle par famille === */
  const capsTmp = {};

  prepList.forEach(p => {
    p.lignes.forEach(l => {
      const famRaw = ARTICLE_DATA[l.article]?.famille || "AUT";
      const fam = famRaw || "AUT";
      capsTmp[fam] ??= [];
      capsTmp[fam].push(capByEmp[l.empId] || 1);
    });
  });

  const capByFam = {};
  Object.entries(capsTmp).forEach(([fam, arr]) => {
    capByFam[fam] =
      arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length);
  });

  /* === fenêtre glissante === */
  const maxEmplByFam = {};
  const samplesByFam = {};
  let left = 0;
  const refCountByFam = {};

  function addPrep(p) {
    p.lignes.forEach(l => {
      const fam = ARTICLE_DATA[l.article]?.famille || "AUT";
      refCountByFam[fam] ??= new Map();
      const m = refCountByFam[fam];
      m.set(l.article, (m.get(l.article) || 0) + 1);
    });
  }

  function removePrep(p) {
    p.lignes.forEach(l => {
      const fam = ARTICLE_DATA[l.article]?.famille || "AUT";
      const m = refCountByFam[fam];
      if (!m) return;
      const v = m.get(l.article);
      if (v === 1) m.delete(l.article);
      else if (v > 1) m.set(l.article, v - 1);
    });
  }

  for (let right = 0; right < prepList.length; right++) {
    addPrep(prepList[right]);

    while (prepList[right].date - prepList[left].date > WINDOW_MS) {
      removePrep(prepList[left]);
      left++;
    }

    Object.entries(refCountByFam).forEach(([fam, map]) => {
      const nbRefs = map.size;
      samplesByFam[fam] ??= [];
      samplesByFam[fam].push(nbRefs);

      const capMoy = capByFam[fam] || 1;
      const empl = Math.ceil(nbRefs / capMoy);

      if (!maxEmplByFam[fam] || empl > maxEmplByFam[fam]) {
        maxEmplByFam[fam] = empl;
      }
    });
  }

  /* === moyenne & P80 === */
  const avgEmplByFam = {};
  const p80EmplByFam = {};

  Object.entries(samplesByFam).forEach(([fam, arr]) => {
    if (!arr.length) return;

    avgEmplByFam[fam] =
      arr.reduce((a, b) => a + b, 0) / arr.length;

    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.floor(0.8 * (sorted.length - 1));
    p80EmplByFam[fam] = sorted[idx];
  });

  HISTO_ANALYSIS = {
    capByFam,
    maxEmplByFam,
    avgEmplByFam,
    p80EmplByFam
  };

  console.log("✅ Analyse historique enrichie :", HISTO_ANALYSIS);
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

function computeAutGestDetailsFromDT() {

  const aggAutGest = {}; // geste -> nombre de lignes DT

  Object.values(PREPS).forEach(lignes => {
    lignes.forEach(l => {
      const famArticle = ARTICLE_DATA[l.article]?.famille || "AUT";

      // ✅ SEULE CONDITION VALIDE
      if (famArticle !== "AUT") return;

      // ici le "geste" = famille / code gestion
      const geste = famArticle; // ou autre champ si tu as un code geste distinct

      aggAutGest[geste] = (aggAutGest[geste] || 0) + 1;
    });
  });

  // ✅ stockage global si tu veux le réutiliser
  AUT_GEST_DETAILS = aggAutGest;

  console.log("✅ Détail des gestes pour articles AUT :", aggAutGest);
}

/************************************************
 * AUT — DÉTAIL "AUTRES"
 * Contenu réel du regroupement AUT
 * (DT only, sans implantation)
 ************************************************/

let AUT_GEST_DETAILS = {};

function computeAutOthersDetailsFromDT() {
  AUT_GEST_DETAILS = {};

  Object.values(PREPS).forEach(lignes => {
    lignes.forEach(l => {
      const fam = ARTICLE_DATA[l.article]?.famille;
      if (!fam) return; // ✅ ignore les familles absentes

      // ✅ AUT = NON STRUCTURANT
      if (STRUCTURING_FAMILIES.has(fam)) return;

      AUT_GEST_DETAILS[fam] =
        (AUT_GEST_DETAILS[fam] || 0) + 1;
    });
  });

  console.log("✅ AUT (regroupement réel) :", AUT_GEST_DETAILS);
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
 * AVEC LOADER % PAR ÉTAPES MÉTIER
 ************************************************/

/************************************************
 * RUN SIMULATION (BOUTON)
 * AVEC LOADER % FLUIDE
 ************************************************/

async function runSimulation() {
  console.log("▶ runSimulation appelée");
  showLoader();

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
       ÉTAPE 5 — AUT (EXCEL BRUT)
    ========================= */
    setLoaderProgress(25, "Analyse des familles AUT…");
    await nextFrame();

    computeAutOthersDetailsFromExcel(rows, famCol);
    updateAutDetails();

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
      const fam = normalizeFamilleCode(rawFam);
      ARTICLE_DATA[article] = { famille: fam };

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
       ÉTAPE 7 — EMPLACEMENTS
    ========================= */
    setLoaderProgress(45, "Initialisation des emplacements…");
    await nextFrame();

    initEmplacementsFromDT(rows, empCol);
    FILTERS.niveau = getExistingLevels()[0] || "A";
    ensureFullLevel(FILTERS.niveau);
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
       ÉTAPE 10 — VISUELS
    ========================= */
    setLoaderProgress(75, "Génération des heatmaps…");
    await nextFrame();

    resizeHeatmapCanvas();
    drawHeatmapAvant("plan2D");

    setLoaderProgress(82, "Génération du plan…");
    await nextFrame();

    resizeImplantationCanvas();
    drawZonePlan();

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
    hideLoader();
  }
}

console.log("✅ BLOC L chargé");

/************************************************
 * AIDE À L’IMPLANTATION — VERSION FINALE
 * Lecture seule : aucune modification d’EMPLACEMENTS
 ************************************************/

function computeAideImplantation() {
  const container = document.getElementById("implantationHintsContent");
  if (!container) return;

  /* =========================
     SOURCES
  ========================= */

  const besoinFluxByFam =
    HISTO_ANALYSIS?.p80EmplByFam ||
    HISTO_ANALYSIS?.avgEmplByFam ||
    {};

  if (!Object.keys(besoinFluxByFam).length) {
    container.innerHTML = "Analyse historique non disponible.";
    return;
  }

  const besoinStockByFam = computeStockNeedByFamille(STOCK_ROWS);
  const capByFam = HISTO_ANALYSIS.capByFam || {};

  /* =========================
     CAPACITÉ TOTALE
  ========================= */

  const capaciteTotale = Object.keys(EMPLACEMENTS).length;

  /* =========================
     AGRÉGATION PAR FAMILLE
  ========================= */

  const agg = {};

  const familles = new Set([
    ...Object.keys(besoinFluxByFam),
    ...Object.keys(besoinStockByFam)
  ]);

  familles.forEach(famBrute => {
    const fam = getFamilleImplantation(famBrute);

    agg[fam] ??= {
      fam,
      besoinStock: 0,
      besoinFlux: 0
    };

    agg[fam].besoinStock += besoinStockByFam[famBrute] || 0;
    agg[fam].besoinFlux  += besoinFluxByFam[famBrute]  || 0;
  });

  /* =========================
     BESOIN DE RÉFÉRENCE
     (FLUX OU STOCK)
  ========================= */

  let sommeRef = 0;

  Object.values(agg).forEach(o => {
    o.besoinRef = Math.max(o.besoinStock, o.besoinFlux);
    sommeRef += o.besoinRef;
  });

  /* =========================
     CAPACITÉ RESTANTE
  ========================= */

  let capaciteRestante = capaciteTotale - sommeRef;
  if (capaciteRestante < 0) capaciteRestante = 0;

  /* =========================
     POIDS DE RÉPARTITION
     (MARGE)
  ========================= */

  let sommePoids = 0;

  Object.values(agg).forEach(o => {
    const marge = computeVariableMarge({
      fam: o.fam,
      besoinStock: o.besoinStock,
      besoinFlux: o.besoinFlux
    });

    o.poids = o.besoinRef * marge;
    sommePoids += o.poids;
  });

  /* =========================
     BESOIN CIBLE FINAL
  ========================= */

  let cumulCible = 0;

  Object.values(agg).forEach(o => {
    const part =
      sommePoids > 0
        ? Math.round(capaciteRestante * o.poids / sommePoids)
        : 0;

    o.besoinCible = o.besoinRef + part;
    cumulCible += o.besoinCible;
  });

  /* Ajustement final pour tomber EXACTEMENT sur la capacité */
  let delta = capaciteTotale - cumulCible;
  if (delta !== 0) {
    const ordre = Object.values(agg)
      .sort((a, b) => b.besoinRef - a.besoinRef);

    let i = 0;
    while (delta !== 0) {
      ordre[i].besoinCible += delta > 0 ? 1 : -1;
      delta += delta > 0 ? -1 : 1;
      i = (i + 1) % ordre.length;
    }
  }

  /* =========================
     CONSTRUCTION TABLEAU
  ========================= */

  const rows = [];
  const total = {
    besoinStock: 0,
    besoinFlux: 0,
    besoinCible: 0,
    poses: 0,
    manque: 0
  };

  const hasImplantationPosee = IMPLANTATION_ACTIVE;

  Object.values(agg).forEach(o => {
    const cap = capByFam[o.fam] || 1;

    let emplPoses, manque, statut;

if (!IMPLANTATION_ACTIVE) {
  // ✅ PLAN VIERGE : RIEN N’EST POSÉ
  emplPoses = 0;
  manque = 0;
  statut = "ℹ️ Aucun emplacement posé";
} else {
  // ✅ IMPLANTATION ACTIVE (manuelle ou auto)
  emplPoses = Object.values(EMPLACEMENTS)
    .filter(e => e.famille === o.fam)
    .length;

  manque = Math.max(0, o.besoinCible - emplPoses);
  statut = manque === 0 ? "🟢 OK" : "🔴 Sous-dimensionné";
}

    rows.push({
      fam: o.fam,
      cap,
      besoinStock: o.besoinStock,
      besoinFlux: o.besoinFlux,
      besoinCible: o.besoinCible,
      poses: emplPoses,
      manque,
      statut
    });

    total.besoinStock += o.besoinStock;
    total.besoinFlux  += o.besoinFlux;
    total.besoinCible += o.besoinCible;
    total.poses       += emplPoses;
    total.manque      += manque;
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
        ${rows.map(r => `
          <tr>
            <td><b>${r.fam}</b></td>
            <td style="text-align:right">${r.cap.toFixed(2)}</td>
            <td style="text-align:right">${r.besoinStock}</td>
            <td style="text-align:right">${r.besoinFlux}</td>
            <td style="text-align:right"><b>${r.besoinCible}</b></td>
            <td style="text-align:right">${r.poses}</td>
            <td style="text-align:right">${r.manque}</td>
            <td style="text-align:center">${r.statut}</td>
          </tr>
        `).join("")}

        <tr style="border-top:2px solid #000; font-weight:bold; background:#f5f7fa;">
          <td>TOTAL</td>
          <td></td>
          <td style="text-align:right">${total.besoinStock}</td>
          <td style="text-align:right">${total.besoinFlux}</td>
          <td style="text-align:right">${total.besoinCible}</td>
          <td style="text-align:right">${total.poses}</td>
          <td style="text-align:right">${total.manque}</td>
          <td style="text-align:center">
            ${total.manque === 0 ? "🟢 OK" : "🔴 À ajuster"}
          </td>
        </tr>
      </tbody>
    </table>

    <div style="font-size:11px; margin-top:10px; color:#555;">
      <b>Lecture du tableau</b><br>
      • <b>Besoin stock</b> : emplacements minimum nécessaires pour contenir le stock réel (y compris stock dormant).<br>
      • <b>Besoin flux</b> : emplacements nécessaires pour absorber l’activité normale.<br>
      • <b>Besoin cible</b> : nombre d’emplacements à poser manuellement, tenant compte du stock, du flux et de la capacité réelle.<br><br>

      <b>Principe</b><br>
      Le stock et le flux sont prioritaires.  
      La marge sert uniquement à répartir la capacité restante entre familles.
    </div>
  `;
}

/************************************************
 * SIMULATION PICKING — VERSION PROPRE
 * BLOC M — COMPARAISON & AFFECTATION RÉELLE
 ************************************************/

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

/**
 * Affectation réaliste des références APRÈS implantation
 */
function assignReferencesToEmplacements() {
  const refUsage = computeRefUsage();
  const maxEmplByFam = HISTO_ANALYSIS.maxEmplByFam || {};

  const refToEmp = {};
  const empLoad = {};
  const capacityIssues = [];

  Object.keys(EMPLACEMENTS).forEach(empId => {
    empLoad[empId] = 0;
  });

  const familles = new Set(
  Object.values(ARTICLE_DATA)
    .map(a => getFamilleImplantation(a.famille))
);

  for (const fam of familles) {
    const maxEmpl = maxEmplByFam[fam] || 0;

    const refs = Object.keys(ARTICLE_DATA)
      .filter(r => getFamilleImplantation(ARTICLE_DATA[r].famille) === fam)
      .sort((a, b) => (refUsage[b] || 0) - (refUsage[a] || 0));

    const empsFam = Object.entries(EMPLACEMENTS)
      .filter(([, e]) => e.famille === fam)
      .map(([empId, e]) => ({ empId, ...e }));

    if (empsFam.length < maxEmpl) {
      capacityIssues.push({
        family: fam,
        required: maxEmpl,
        available: empsFam.length
      });
      continue;
    }

    const zonesByKey = {};
    empsFam.forEach(e => {
      const band = Math.floor((e.travee - 1) / 2);
      const key = `${e.allee}_${band}`;
      zonesByKey[key] ??= [];
      zonesByKey[key].push(e);
    });

    const zonesTriees = Object.values(zonesByKey);

    let zoneIdx = 0;
    let posIdx = 0;

    refs.forEach(ref => {
      const zone = zonesTriees[Math.min(zoneIdx, zonesTriees.length - 1)];
      const emp = zone[posIdx % zone.length];

      refToEmp[ref] = emp.empId;
      empLoad[emp.empId]++;
      posIdx++;

      if (posIdx >= zone.length) {
        posIdx = 0;
        zoneIdx++;
      }
    });
  }

  if (capacityIssues.length > 0) {
    return { feasible: false, issues: capacityIssues };
  }

  return { feasible: true, refToEmp, empLoad };
}

/**
 * Comparaison AVANT / APRÈS
 */
function runComparison() {
  const out = document.getElementById("comparisonResults");
  if (!out) return;

  const assign = assignReferencesToEmplacements();
  if (!assign || !assign.refToEmp) {
    out.innerHTML = "<b>Comparaison impossible</b>";
    return;
  }

  checkMappingCoherence(assign.refToEmp);

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

  const gain = tempsAvant - tempsApres;
  const pct = tempsAvant > 0 ? (gain / tempsAvant) * 100 : 0;

  out.innerHTML = `
    <h3>Comparaison AVANT / APRÈS</h3>
    <p><b>Temps AVANT :</b> ${(tempsAvant / 3600).toFixed(2)} h</p>
    <p><b>Temps APRÈS :</b> ${(tempsApres / 3600).toFixed(2)} h</p>
    <p><b>Gain :</b> ${(gain / 3600).toFixed(2)} h (${pct.toFixed(1)} %)</p>
  `;
}

/**
 * Vérifie la cohérence famille ↔ emplacement
 */
function checkMappingCoherence(refToEmp) {
  const errors = [];

  Object.entries(refToEmp).forEach(([ref, empId]) => {
    const famRefBrute = ARTICLE_DATA[ref]?.famille;
    const famRefImpl = getFamilleImplantation(famRefBrute);
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

function autoImplantationParBlocs_2Phases() {

  console.log("▶ autoImplantationParBlocs_2Phases appelée");

  IMPLANTATION_ACTIVE = false;

  /* =====================================================
     PHASE 0 — RESET
     (hors travées 1–2)
  ===================================================== */

  Object.values(EMPLACEMENTS).forEach(e => {
    if (e.travee > 2) e.famille = null;
  });

  const allees = ALLEES.split("");

  /* =====================================================
     PHASE 1 — CONSTRUCTION DES BLOCS
  ===================================================== */

  const DEMI_ALLEES = [
    { tStart: 10, tEnd: 16 },
    { tStart: 3,  tEnd: 9  }
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

  /* =====================================================
     PHASE 2 — DONNÉES MÉTIER
  ===================================================== */

  const p80 = HISTO_ANALYSIS.p80EmplByFam || {};
  const rotation = computeRotationByFamille();

  // importance = P80 × rotation (AUT incluse)
  const importance = {};
  let sommeImportance = 0;

  Object.keys(p80).forEach(fam => {
    const val = (p80[fam] || 0) * (rotation[fam] || 1);
    importance[fam] = val;
    sommeImportance += val;
  });

  if (sommeImportance === 0) {
    alert("❌ Importance totale nulle — implantation impossible");
    return;
  }

  /* =====================================================
     PHASE 3 — CIBLE PHYSIQUE MINIMUM (P80 STRICT)
  ===================================================== */

  const cibleEmpl = {};
  Object.keys(p80).forEach(fam => {
    cibleEmpl[fam] = Math.round(p80[fam] || 0);
  });

  /* =====================================================
     PHASE 4 — CAPACITÉ D’UN BLOC
  ===================================================== */

  const capBloc =
    Object.values(EMPLACEMENTS)
      .filter(e => e.travee >= 10 && e.travee <= 16).length
    / allees.length;

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
  const famsParImportance = Object.keys(poids)
    .sort((a, b) => poids[b] - poids[a]);

  blocsRestants.forEach(bloc => {
    const fam = famsParImportance[idxFam % famsParImportance.length];
    bloc.fam = fam;
    blocsAttribues[fam].push(bloc);
    idxFam++;
  });

  /* =====================================================
     PHASE 8 — POSE DES EMPLACEMENTS (BLOCS COMPLETS)
  ===================================================== */

  Object.entries(blocsAttribues).forEach(([fam, blocsFam]) => {
    blocsFam.forEach(bloc => {
      Object.values(EMPLACEMENTS)
        .filter(e =>
  e.famille === null &&
  e.allee === bloc.allee &&
  e.travee >= bloc.tStart &&
  e.travee <= bloc.tEnd &&
  emplacementExiste(e.allee, e.travee, e.position, e.niveau)
)
        .forEach(e => {
  e.famille = STRUCTURING_FAMILIES.has(fam) ? fam : "AUT";
});

    });
  });

  /* =====================================================
     FIN — RAFRAÎCHISSEMENT
  ===================================================== */

  IMPLANTATION_ACTIVE = true;

  rebuildEmpIndex();
  drawZonePlan();
  computeAideImplantation();

  alert("✅ Implantation par blocs terminée (P80 + % + AUT incluse)");
}

/************************************************
 * SIMULATION PICKING — VERSION PROPRE
 * BLOC N — DUPLICATION FAMILLE (PROPRE)
 ************************************************/

/**
 * Duplique les familles d’un niveau source vers un ou plusieurs niveaux cibles
 *
 * @param {string} sourceLevel  Niveau source (ex: "A")
 * @param {Array<string>} targetLevels  Niveaux cibles (ex: ["B","C"])
 * @param {"overwrite"|"fillEmpty"} mode
 *        - overwrite : écrase les familles existantes
 *        - fillEmpty : ne remplit que les cases vides
 */
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
  computeAideImplantation();
}

/* =========================
   BIND BOUTON DUPLICATION
========================= */

document.getElementById("btnDuplicate")?.addEventListener("click", () => {
  const source = FILTERS.niveau;
  if (!source) {
    alert("Niveau source non défini.");
    return;
  }

  const txt = prompt(
    `Dupliquer la famille du niveau ${source} vers quels niveaux ?\nExemple : B,C,D`,
    ""
  );
  if (!txt) return;

  const targets = txt
    .split(",")
    .map(s => s.trim().toUpperCase())
    .filter(
      s => s && s !== source && NIVEAUX_AUTORISES.includes(s)
    );

  if (!targets.length) {
    alert("Aucun niveau cible valide.");
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