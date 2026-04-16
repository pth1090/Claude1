/**
 * Idempotent seed script — safe to run multiple times.
 * Run with: npx tsx db/seed.ts
 */
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH =
  process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "papers.db");

const dir = path.dirname(DB_PATH);
fs.mkdirSync(dir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ── Schema ───────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS papers (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    doi         TEXT    UNIQUE NOT NULL,
    title       TEXT    NOT NULL,
    authors     TEXT    NOT NULL DEFAULT '[]',
    year        INTEGER,
    journal     TEXT,
    abstract    TEXT,
    ai_summary  TEXT,
    notes       TEXT,
    url         TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS tags (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT UNIQUE NOT NULL,
    type  TEXT NOT NULL CHECK(type IN ('product', 'focus'))
  );
  CREATE TABLE IF NOT EXISTS paper_tags (
    paper_id  INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    tag_id    INTEGER NOT NULL REFERENCES tags(id)   ON DELETE CASCADE,
    PRIMARY KEY (paper_id, tag_id)
  );
  CREATE INDEX IF NOT EXISTS idx_papers_year    ON papers(year);
  CREATE INDEX IF NOT EXISTS idx_paper_tags_tag ON paper_tags(tag_id);
  CREATE INDEX IF NOT EXISTS idx_tags_type      ON tags(type);
`);

// ── Helper functions ─────────────────────────────────────────────────────────
function upsertTag(name: string, type: "product" | "focus"): number {
  db.prepare("INSERT OR IGNORE INTO tags (name, type) VALUES (?, ?)").run(name, type);
  return (db.prepare("SELECT id FROM tags WHERE name = ?").get(name) as { id: number }).id;
}

function addPaper(paper: {
  doi: string;
  title: string;
  authors: string;
  year: number | null;
  journal: string | null;
  url: string;
  product_tags: string[];
  focus_tags: string[];
  notes?: string;
}): boolean {
  const res = db
    .prepare(
      `INSERT OR IGNORE INTO papers (doi, title, authors, year, journal, url, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      paper.doi,
      paper.title,
      paper.authors,
      paper.year,
      paper.journal,
      paper.url,
      paper.notes ?? null
    );

  if (res.changes === 0) return false; // already exists

  const paperId = res.lastInsertRowid as number;

  for (const name of paper.product_tags) {
    const tagId = upsertTag(name, "product");
    db.prepare("INSERT OR IGNORE INTO paper_tags (paper_id, tag_id) VALUES (?, ?)").run(paperId, tagId);
  }
  for (const name of paper.focus_tags) {
    const tagId = upsertTag(name, "focus");
    db.prepare("INSERT OR IGNORE INTO paper_tags (paper_id, tag_id) VALUES (?, ?)").run(paperId, tagId);
  }

  return true;
}

// ── Seed tags ─────────────────────────────────────────────────────────────────
const PRODUCT_TAGS = [
  "Flow / Microreactor",
  "SyrDos",
  "LabMan",
  "LabVision",
  "LabKit",
  "LabBox",
  "RAMOS",
  "AutoSam",
  "Filtration",
  "DOE",
];

const FOCUS_TAGS = [
  "Flow Chemistry",
  "Crystallization",
  "Calorimetry",
  "Polymerization",
  "Biotechnology (OTR/RAMOS)",
  "Solvent Extraction",
  "Self-optimization / Machine Learning",
  "Scale-up",
  "Hydrogenation",
  "Spectroscopy / PAT",
];

for (const name of PRODUCT_TAGS) upsertTag(name, "product");
for (const name of FOCUS_TAGS) upsertTag(name, "focus");

console.log("Tags seeded.");

// ── Seed papers ───────────────────────────────────────────────────────────────
const papers = [
  {
    doi: "10.1039/C8RE00148K",
    title: "Model-based scale-up and reactor design for solvent-free synthesis of an ionic liquid in a millistructured flow reactor",
    authors: JSON.stringify([
      { given: "Sebastian", family: "Schwolow" },
      { given: "Benedikt", family: "Mutsch" },
      { given: "Norbert", family: "Kockmann" },
      { given: "Thorsten", family: "Röder" },
    ]),
    year: 2019,
    journal: "Reaction Chemistry & Engineering",
    url: "https://doi.org/10.1039/C8RE00148K",
    product_tags: ["Flow / Microreactor"],
    focus_tags: ["Flow Chemistry", "Scale-up"],
  },
  {
    doi: "10.1039/D0RE00081G",
    title: "Self-optimising processes and real-time-optimisation of organic syntheses in a microreactor system using Nelder–Mead and design of experiments",
    authors: JSON.stringify([
      { given: "Verena", family: "Fath" },
      { given: "Norbert", family: "Kockmann" },
      { given: "Jürgen", family: "Otto" },
      { given: "Thorsten", family: "Röder" },
    ]),
    year: 2020,
    journal: "Reaction Chemistry & Engineering",
    url: "https://doi.org/10.1039/D0RE00081G",
    product_tags: ["Flow / Microreactor"],
    focus_tags: ["Flow Chemistry", "Self-optimization / Machine Learning"],
  },
  {
    doi: "10.1007/s40831-022-00540-w",
    title: "One-Step Solvometallurgical Process for Purification of Lithium Chloride to Battery Grade",
    authors: JSON.stringify([
      { given: "Dženita", family: "Avdibegović" },
      { given: "Viet Tu", family: "Nguyen" },
      { given: "Koen", family: "Binnemans" },
    ]),
    year: 2022,
    journal: "Journal of Sustainable Metallurgy",
    url: "https://doi.org/10.1007/s40831-022-00540-w",
    product_tags: ["LabKit", "Filtration"],
    focus_tags: ["Solvent Extraction"],
  },
  {
    doi: "10.3390/reactions3040035",
    title: "Measuring Kinetics in Flow Using Isoperibolic Flow Calorimetry",
    authors: JSON.stringify([
      { given: "Timothy Aljoscha", family: "Frede" },
      { given: "Moritz", family: "Greive" },
      { given: "Norbert", family: "Kockmann" },
    ]),
    year: 2022,
    journal: "Reactions",
    url: "https://doi.org/10.3390/reactions3040035",
    product_tags: ["LabMan"],
    focus_tags: ["Calorimetry", "Flow Chemistry"],
  },
  {
    doi: "10.1039/D3RE00173C",
    title: "Chemometric tools for kinetic investigations of a homogeneously catalysed Sonogashira cross-coupling reaction in flow",
    authors: JSON.stringify([
      { given: "Lisa", family: "Schulz" },
      { given: "Mathias", family: "Sawall" },
      { given: "Norbert", family: "Kockmann" },
      { given: "Thorsten", family: "Röder" },
    ]),
    year: 2023,
    journal: "Reaction Chemistry & Engineering",
    url: "https://doi.org/10.1039/D3RE00173C",
    product_tags: ["SyrDos", "LabMan", "Flow / Microreactor"],
    focus_tags: ["Flow Chemistry", "Spectroscopy / PAT"],
  },
  {
    doi: "10.1002/ceat.202000011",
    title: "Lab-Scale Microreactor Plant for the Study of Methylations with Liquid Chloromethane",
    authors: JSON.stringify([
      { given: "Clarissa V.", family: "Benzin" },
      { given: "Norbert", family: "Kockmann" },
      { given: "Thorsten", family: "Röder" },
    ]),
    year: 2020,
    journal: "Chemical Engineering & Technology",
    url: "https://doi.org/10.1002/ceat.202000011",
    product_tags: ["Flow / Microreactor", "SyrDos", "AutoSam", "LabBox"],
    focus_tags: ["Flow Chemistry"],
  },
  {
    doi: "10.1002/mame.202000688",
    title: "Automated Solvent-Free Polymerization of Hyperbranched Polyglycerol with Tailored Molecular Weight by Online Torque Detection",
    authors: JSON.stringify([
      { given: "Matthias", family: "Wallert" },
      { given: "Johann", family: "Plaschke" },
      { given: "Mathias", family: "Dimde" },
      { given: "Vahid", family: "Ahmadi" },
      { given: "Stephan", family: "Block" },
      { given: "Rainer", family: "Haag" },
    ]),
    year: 2021,
    journal: "Macromolecular Materials and Engineering",
    url: "https://doi.org/10.1002/mame.202000688",
    product_tags: ["LabKit"],
    focus_tags: ["Polymerization"],
  },
  {
    doi: "10.1016/j.fluid.2020.112893",
    title: "Automated measurement of pH-dependent solid-liquid equilibria of itaconic acid and protocatechuic acid",
    authors: JSON.stringify([]),
    year: 2021,
    journal: "Fluid Phase Equilibria",
    url: "https://doi.org/10.1016/j.fluid.2020.112893",
    product_tags: ["LabMan", "LabVision"],
    focus_tags: ["Crystallization"],
  },
  {
    doi: "10.1007/s41981-021-00140-x",
    title: "Simultaneous self-optimisation of yield and purity through successive combination of inline FT-IR spectroscopy and online mass spectrometry in flow reactions",
    authors: JSON.stringify([
      { given: "V.", family: "Fath" },
      { given: "P.", family: "Lau" },
      { given: "C.", family: "Greve" },
    ]),
    year: 2021,
    journal: "Journal of Flow Chemistry",
    url: "https://doi.org/10.1007/s41981-021-00140-x",
    product_tags: ["LabMan", "SyrDos", "Flow / Microreactor"],
    focus_tags: ["Flow Chemistry", "Self-optimization / Machine Learning", "Spectroscopy / PAT"],
    notes: "Uses Matlab for optimization control",
  },
  {
    doi: "10.1002/ceat.201900074",
    title: "In Situ Reaction Monitoring of Unstable Lithiated Intermediates through Inline FTIR Spectroscopy",
    authors: JSON.stringify([
      { given: "Verena", family: "Fath" },
      { given: "Norbert", family: "Kockmann" },
      { given: "Thorsten", family: "Röder" },
    ]),
    year: 2019,
    journal: "Chemical Engineering & Technology",
    url: "https://doi.org/10.1002/ceat.201900074",
    product_tags: ["SyrDos", "LabMan", "Flow / Microreactor"],
    focus_tags: ["Flow Chemistry", "Spectroscopy / PAT"],
  },
  {
    doi: "10.3390/pr11010279",
    title: "Data Management of Microscale Reaction Calorimeter Using a Modular Open-Source IoT-Platform",
    authors: JSON.stringify([
      { given: "T.A.", family: "Frede" },
      { given: "C.", family: "Weber" },
      { given: "T.", family: "Brockhoff" },
      { given: "T.", family: "Christ" },
      { given: "D.", family: "Ludwig" },
      { given: "N.", family: "Kockmann" },
    ]),
    year: 2023,
    journal: "Processes",
    url: "https://doi.org/10.3390/pr11010279",
    product_tags: ["LabMan", "LabVision", "Flow / Microreactor"],
    focus_tags: ["Calorimetry", "Flow Chemistry"],
  },
  {
    doi: "10.1021/acs.oprd.9b00265",
    title: "Model-based scale-up predictions: from micro- to millireactors using inline fourier transform infrared spectroscopy",
    authors: JSON.stringify([
      { given: "V.", family: "Fath" },
      { given: "S.", family: "Szmais" },
      { given: "P.", family: "Lau" },
      { given: "N.", family: "Kockmann" },
    ]),
    year: 2019,
    journal: "Organic Process Research & Development",
    url: "https://doi.org/10.1021/acs.oprd.9b00265",
    product_tags: ["LabMan", "Flow / Microreactor"],
    focus_tags: ["Flow Chemistry", "Scale-up", "Spectroscopy / PAT"],
  },
  {
    doi: "10.1002/cite.202000223",
    title: "Software-guided Microfluidic Reaction Calorimeter Based on Thermoelectric Modules",
    authors: JSON.stringify([
      { given: "T.A.", family: "Frede" },
      { given: "I.", family: "Burke" },
      { given: "N.", family: "Kockmann" },
    ]),
    year: 2021,
    journal: "Chemie Ingenieur Technik",
    url: "https://doi.org/10.1002/cite.202000223",
    product_tags: ["LabMan", "LabVision"],
    focus_tags: ["Calorimetry"],
  },
  {
    doi: "10.1039/D2RE00208F",
    title: "Autonomous model-based experimental design for rapid reaction development",
    authors: JSON.stringify([]),
    year: 2022,
    journal: "Reaction Chemistry & Engineering",
    url: "https://doi.org/10.1039/D2RE00208F",
    product_tags: ["LabMan"],
    focus_tags: ["Self-optimization / Machine Learning", "DOE"],
    notes: "Uses Design of Experiments",
  },
  {
    doi: "10.3390/fluids5040223",
    title: "A Gas-Liquid Flow and Interphase Mass Transfer in LL Microreactors",
    authors: JSON.stringify([
      { given: "B.J.", family: "Doyle" },
      { given: "F.", family: "Morin" },
      { given: "J.B.", family: "Haelssig" },
      { given: "D.M.", family: "Roberge" },
      { given: "A.", family: "Macchi" },
    ]),
    year: 2020,
    journal: "Fluids",
    url: "https://doi.org/10.3390/fluids5040223",
    product_tags: ["SyrDos", "LabBox", "Flow / Microreactor"],
    focus_tags: ["Flow Chemistry"],
  },
  {
    doi: "10.1021/acs.oprd.9b00336",
    title: "Scalable Wolff–Kishner Reductions in Extreme Process Windows Using a Silicon Carbide Flow Reactor",
    authors: JSON.stringify([
      { given: "Desiree", family: "Znidar" },
      { given: "Anne", family: "O'Kearney-McMullan" },
      { given: "Rachel", family: "Munday" },
      { given: "Charlotte", family: "Wiles" },
      { given: "Peter", family: "Poechlauer" },
      { given: "Christoph", family: "Schmoelzer" },
      { given: "Doris", family: "Dallinger" },
      { given: "C. Oliver", family: "Kappe" },
    ]),
    year: 2019,
    journal: "Organic Process Research & Development",
    url: "https://doi.org/10.1021/acs.oprd.9b00336",
    product_tags: ["SyrDos"],
    focus_tags: ["Flow Chemistry"],
  },
  {
    doi: "10.3390/pr11082457",
    title: "Small-Scale Solids Production Plant with Cooling Crystallization, Washing, and Drying in a Modular, Continuous Plant",
    authors: JSON.stringify([
      { given: "S.", family: "Höving" },
      { given: "T.", family: "Schmidt" },
      { given: "M.", family: "Peters" },
      { given: "H.", family: "Lapainis" },
      { given: "N.", family: "Kockmann" },
    ]),
    year: 2023,
    journal: "Processes",
    url: "https://doi.org/10.3390/pr11082457",
    product_tags: ["SyrDos", "LabMan", "LabVision"],
    focus_tags: ["Crystallization"],
  },
  {
    doi: "10.1007/s41981-020-00138-x",
    title: "Nucleation in continuous flow cooling sonocrystallization for coiled capillary crystallizers",
    authors: JSON.stringify([
      { given: "M.", family: "Schmalenberg" },
      { given: "L.K.", family: "Weick" },
      { given: "N.", family: "Kockmann" },
    ]),
    year: 2021,
    journal: "Journal of Flow Chemistry",
    url: "https://doi.org/10.1007/s41981-020-00138-x",
    product_tags: ["LabMan", "LabVision"],
    focus_tags: ["Crystallization"],
  },
  {
    doi: "10.1039/C9RE00127A",
    title: "Continuous flow synthesis of amine oxides by oxidation of tertiary amines",
    authors: JSON.stringify([
      { given: "Tobias", family: "Baumeister" },
      { given: "Stefan", family: "Zikeli" },
      { given: "Hannes", family: "Kitzler" },
      { given: "Paul", family: "Aigner" },
      { given: "Piotr P.", family: "Wieczorek" },
      { given: "Thorsten", family: "Röder" },
    ]),
    year: 2019,
    journal: "Reaction Chemistry & Engineering",
    url: "https://doi.org/10.1039/C9RE00127A",
    product_tags: ["SyrDos"],
    focus_tags: ["Flow Chemistry"],
  },
  {
    doi: "10.1016/j.cej.2019.123340",
    title: "Automated self-optimisation of multi-step reaction and separation processes using machine learning",
    authors: JSON.stringify([
      { given: "Adam D.", family: "Clayton" },
      { given: "Artur M.", family: "Schweidtmann" },
      { given: "Graeme", family: "Clemens" },
      { given: "Jamie A.", family: "Manson" },
      { given: "Connor J.", family: "Taylor" },
      { given: "Richard A.", family: "Bourne" },
    ]),
    year: 2020,
    journal: "Chemical Engineering Journal",
    url: "https://doi.org/10.1016/j.cej.2019.123340",
    product_tags: ["SyrDos"],
    focus_tags: ["Self-optimization / Machine Learning", "Flow Chemistry"],
    notes: "Uses SyrDos with Matlab",
  },
  {
    doi: "10.1007/s41981-021-00145-6",
    title: "Software-guided microscale flow calorimeter for efficient acquisition of thermokinetic data",
    authors: JSON.stringify([
      { given: "T.A.", family: "Frede" },
      { given: "M.", family: "Dietz" },
      { given: "N.", family: "Kockmann" },
    ]),
    year: 2021,
    journal: "Journal of Flow Chemistry",
    url: "https://doi.org/10.1007/s41981-021-00145-6",
    product_tags: ["LabMan", "SyrDos"],
    focus_tags: ["Calorimetry", "Flow Chemistry"],
  },
  {
    doi: "10.1039/D0RE00048E",
    title: "Multivariate analysis of inline benchtop NMR data enables rapid optimization of a complex nitration in flow",
    authors: JSON.stringify([
      { given: "Peter", family: "Sagmeister" },
      { given: "Johannes", family: "Poms" },
      { given: "Jason D.", family: "Williams" },
      { given: "C. Oliver", family: "Kappe" },
    ]),
    year: 2020,
    journal: "Reaction Chemistry & Engineering",
    url: "https://doi.org/10.1039/D0RE00048E",
    product_tags: ["SyrDos"],
    focus_tags: ["Flow Chemistry", "Spectroscopy / PAT", "Self-optimization / Machine Learning"],
    notes: "Uses Ehrfeld reactor with SyrDos and inline NMR",
  },
  {
    doi: "10.1039/D3RE00032J",
    title: "Mechanistic origins of accelerated hydrogenation of mixed alkylaromatics by synchronised adsorption over Rh/SiO2",
    authors: JSON.stringify([
      { given: "Nikolay", family: "Cherkasov" },
    ]),
    year: 2023,
    journal: "Reaction Chemistry & Engineering",
    url: "https://doi.org/10.1039/D3RE00032J",
    product_tags: ["AutoSam"],
    focus_tags: ["Hydrogenation"],
  },
  {
    doi: "10.1039/C9GC02238D",
    title: "Methanesulfonic acid: a sustainable acidic solvent for recovering metals from the jarosite residue of the zinc industry",
    authors: JSON.stringify([
      { given: "Koen", family: "Binnemans" },
    ]),
    year: 2019,
    journal: "Green Chemistry",
    url: "https://doi.org/10.1039/C9GC02238D",
    product_tags: ["LabKit"],
    focus_tags: ["Solvent Extraction"],
  },
  {
    doi: "10.1002/advs.202105547",
    title: "Autonomous Multi-Step and Multi-Objective Optimization Facilitated by Real-Time Process Analytics",
    authors: JSON.stringify([
      { given: "Peter", family: "Sagmeister" },
      { given: "Florian F.", family: "Ort" },
      { given: "Clemens E.", family: "Jusner" },
      { given: "Dominique", family: "Hebrault" },
      { given: "Thomas", family: "Tampone" },
      { given: "Frederic G.", family: "Buono" },
      { given: "Jason D.", family: "Williams" },
      { given: "C. Oliver", family: "Kappe" },
    ]),
    year: 2022,
    journal: "Advanced Science",
    url: "https://doi.org/10.1002/advs.202105547",
    product_tags: ["SyrDos"],
    focus_tags: ["Self-optimization / Machine Learning", "Flow Chemistry", "Spectroscopy / PAT"],
    notes: "Uses Ehrfeld reactor with SyrDos; automation via Evon XAMcontrol",
  },
  {
    doi: "10.1021/acs.iecr.3c02070",
    title: "CO2 Solubility in Fast Pyrolysis Bio-oil",
    authors: JSON.stringify([
      { given: "Clarissa", family: "Baehr" },
      { given: "Ramazan", family: "Acar" },
      { given: "Chaima", family: "Hamrita" },
      { given: "Klaus", family: "Raffelt" },
      { given: "Nicolaus", family: "Dahmen" },
    ]),
    year: 2023,
    journal: "Industrial & Engineering Chemistry Research",
    url: "https://doi.org/10.1021/acs.iecr.3c02070",
    product_tags: ["LabVision"],
    focus_tags: ["Solvent Extraction"],
  },
  {
    doi: "10.1002/ceat.202200616",
    title: "From Lab to Pilot Scale: Commissioning of an Integrated Device for the Generation of Crystals",
    authors: JSON.stringify([
      { given: "Timo", family: "Dobler" },
      { given: "Stefan", family: "Höving" },
      { given: "Norbert", family: "Kockmann" },
      { given: "Hermann", family: "Nirschl" },
    ]),
    year: 2023,
    journal: "Chemical Engineering & Technology",
    url: "https://doi.org/10.1002/ceat.202200616",
    product_tags: ["LabVision"],
    focus_tags: ["Crystallization", "Scale-up"],
  },
  {
    doi: "10.1021/acs.iecr.9b01040",
    title: "An Experimental Assessment of Model-Based Solvent Selection for Enhancing Reaction Kinetics",
    authors: JSON.stringify([
      { given: "A.", family: "Tsichla" },
      { given: "C.", family: "Severins" },
      { given: "M.", family: "Gottfried" },
    ]),
    year: 2019,
    journal: "Industrial & Engineering Chemistry Research",
    url: "https://doi.org/10.1021/acs.iecr.9b01040",
    product_tags: ["LabMan"],
    focus_tags: ["Flow Chemistry", "Self-optimization / Machine Learning"],
  },
  {
    doi: "10.1021/acs.oprd.7b00039",
    title: "Continuous Selective Hydrogenation of Refametinib Iodo-nitroaniline Key Intermediate DIM-NA over Raney Cobalt Catalyst at kg/day Scale with Online UV-Visible Conversion Control",
    authors: JSON.stringify([
      { given: "Mourad", family: "Ben Said" },
      { given: "Todor", family: "Baramov" },
      { given: "Tanja", family: "Herrmann" },
      { given: "Michael", family: "Gottfried" },
      { given: "Jorma", family: "Hassfeld" },
      { given: "Stefan", family: "Roggan" },
    ]),
    year: 2017,
    journal: "Organic Process Research & Development",
    url: "https://doi.org/10.1021/acs.oprd.7b00039",
    product_tags: ["Flow / Microreactor"],
    focus_tags: ["Hydrogenation", "Flow Chemistry", "Scale-up"],
  },
  {
    doi: "10.1039/C9RE00087A",
    title: "Laboratory of the future: a modular flow platform with multiple integrated PAT tools for multistep reactions",
    authors: JSON.stringify([
      { given: "Peter", family: "Sagmeister" },
      { given: "Jason D.", family: "Williams" },
      { given: "Christopher A.", family: "Hone" },
      { given: "C. Oliver", family: "Kappe" },
    ]),
    year: 2019,
    journal: "Reaction Chemistry & Engineering",
    url: "https://doi.org/10.1039/C9RE00087A",
    product_tags: ["Flow / Microreactor"],
    focus_tags: ["Flow Chemistry", "Spectroscopy / PAT"],
  },
  {
    doi: "10.1016/S1369-703X(00)00116-9",
    title: "Device for sterile online measurement of the oxygen transfer rate in shaking flasks",
    authors: JSON.stringify([
      { given: "Tibor", family: "Anderlei" },
      { given: "Jochen", family: "Büchs" },
    ]),
    year: 2001,
    journal: "Biochemical Engineering Journal",
    url: "https://doi.org/10.1016/S1369-703X(00)00116-9",
    product_tags: ["RAMOS"],
    focus_tags: ["Biotechnology (OTR/RAMOS)"],
  },
  {
    doi: "10.1016/S1369-703X(03)00181-5",
    title: "Online respiration activity measurement (OTR, CTR, RQ) in shake flasks",
    authors: JSON.stringify([
      { given: "Tibor", family: "Anderlei" },
      { given: "Werner", family: "Zang" },
      { given: "Manfred", family: "Papaspyrou" },
      { given: "Jochen", family: "Büchs" },
    ]),
    year: 2004,
    journal: "Biochemical Engineering Journal",
    url: "https://doi.org/10.1016/S1369-703X(03)00181-5",
    product_tags: ["RAMOS"],
    focus_tags: ["Biotechnology (OTR/RAMOS)"],
  },
  {
    doi: "10.1002/elsc.201300156",
    title: "Phototrophic growth of Arthrospira platensis in a respiration activity monitoring system for shake flasks (RAMOS)",
    authors: JSON.stringify([
      { given: "Maria Lisa", family: "Socher" },
      { given: "Felix", family: "Lenk" },
      { given: "Katja", family: "Geipel" },
      { given: "Thomas", family: "Bley" },
      { given: "Juliane", family: "Steingroewer" },
    ]),
    year: 2014,
    journal: "Engineering in Life Sciences",
    url: "https://doi.org/10.1002/elsc.201300156",
    product_tags: ["RAMOS"],
    focus_tags: ["Biotechnology (OTR/RAMOS)"],
    notes: "Also uses Cultilux accessory",
  },
  {
    doi: "10.1016/j.jbiotec.2008.01.003",
    title: "Respiration activity monitoring system (RAMOS), an efficient tool to study the influence of the oxygen transfer rate on the synthesis of lipopeptide by Bacillus subtilis ATCC6633",
    authors: JSON.stringify([
      { given: "J.S.", family: "Guez" },
      { given: "C.H.", family: "Chenikher" },
      { given: "J.B.", family: "Cassar" },
      { given: "P.", family: "Jacques" },
    ]),
    year: 2008,
    journal: "Journal of Biotechnology",
    url: "https://doi.org/10.1016/j.jbiotec.2008.01.003",
    product_tags: ["RAMOS"],
    focus_tags: ["Biotechnology (OTR/RAMOS)"],
  },
  {
    doi: "10.1016/j.scitotenv.2020.137862",
    title: "Alternative type of Ames test allows for dynamic mutagenicity detection by online monitoring of respiration activity",
    authors: JSON.stringify([
      { given: "Kira", family: "Kauffmann" },
      { given: "Jochen", family: "Büchs" },
    ]),
    year: 2020,
    journal: "Science of the Total Environment",
    url: "https://doi.org/10.1016/j.scitotenv.2020.137862",
    product_tags: ["RAMOS"],
    focus_tags: ["Biotechnology (OTR/RAMOS)"],
  },
  {
    doi: "10.1101/624536",
    title: "The metabolic response of Pseudomonas taiwanensis to NADH dehydrogenase deficiency",
    authors: JSON.stringify([
      { given: "Salome C.", family: "Nies" },
      { given: "Robert", family: "Dinger" },
      { given: "Jochen", family: "Büchs" },
      { given: "Lars M.", family: "Blank" },
      { given: "Birgitta E.", family: "Ebert" },
    ]),
    year: 2019,
    journal: "bioRxiv",
    url: "https://doi.org/10.1101/624536",
    product_tags: ["RAMOS"],
    focus_tags: ["Biotechnology (OTR/RAMOS)"],
  },
  {
    doi: "10.1002/cctc.202501630",
    title: "Development and Kinetic Modeling of Continuous-Flow Asymmetric Hydrogenation With Integrated Catalyst Recycling",
    authors: JSON.stringify([
      { given: "Maurice", family: "Moll" },
      { given: "Thorsten", family: "Röder" },
      { given: "Björn", family: "Wängler" },
      { given: "Carmen", family: "Wängler" },
      { given: "Alexander", family: "Fabricius" },
      { given: "Nico", family: "Maier" },
    ]),
    year: 2026,
    journal: "ChemCatChem",
    url: "https://doi.org/10.1002/cctc.202501630",
    product_tags: ["Flow / Microreactor", "SyrDos", "AutoSam"],
    focus_tags: ["Flow Chemistry", "Hydrogenation"],
  },
];

// ── Run seed ─────────────────────────────────────────────────────────────────
let inserted = 0;
let skipped = 0;

for (const paper of papers) {
  if (addPaper(paper)) {
    inserted++;
  } else {
    skipped++;
  }
}

console.log(`\nSeed complete: ${inserted} papers inserted, ${skipped} skipped (already exist).`);
console.log(`Total papers in DB: ${(db.prepare("SELECT COUNT(*) as c FROM papers").get() as { c: number }).c}`);
console.log(`Total tags in DB: ${(db.prepare("SELECT COUNT(*) as c FROM tags").get() as { c: number }).c}`);

db.close();
