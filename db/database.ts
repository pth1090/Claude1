import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import type { Paper, PaperRow, Tag, Author, TagWithCount } from "@/lib/types";

const DB_PATH =
  process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "papers.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  // Ensure data directory exists
  const dir = path.dirname(DB_PATH);
  fs.mkdirSync(dir, { recursive: true });

  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initializeDatabase(db);
  return db;
}

function initializeDatabase(database: Database.Database): void {
  database.exec(`
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
}

// ── Tag helpers ──────────────────────────────────────────────────────────────

export function getAllTags(): Tag[] {
  return getDb().prepare("SELECT * FROM tags ORDER BY type, name").all() as Tag[];
}

export function getTagsWithCounts(): { products: TagWithCount[]; focuses: TagWithCount[] } {
  const rows = getDb()
    .prepare(
      `SELECT t.id, t.name, t.type, COUNT(pt.paper_id) as count
       FROM tags t
       LEFT JOIN paper_tags pt ON pt.tag_id = t.id
       GROUP BY t.id
       ORDER BY t.type, t.name`
    )
    .all() as TagWithCount[];

  return {
    products: rows.filter((t) => t.type === "product"),
    focuses: rows.filter((t) => t.type === "focus"),
  };
}

export function upsertTag(name: string, type: "product" | "focus"): number {
  const database = getDb();
  database.prepare("INSERT OR IGNORE INTO tags (name, type) VALUES (?, ?)").run(name, type);
  const row = database.prepare("SELECT id FROM tags WHERE name = ?").get(name) as { id: number };
  return row.id;
}

// ── Paper helpers ─────────────────────────────────────────────────────────────

function hydratePaper(row: PaperRow, tags: Tag[]): Paper {
  return {
    ...row,
    authors: JSON.parse(row.authors || "[]") as Author[],
    tags,
  };
}

function getPaperTags(paperId: number): Tag[] {
  return getDb()
    .prepare(
      `SELECT t.* FROM tags t
       JOIN paper_tags pt ON pt.tag_id = t.id
       WHERE pt.paper_id = ?
       ORDER BY t.type, t.name`
    )
    .all(paperId) as Tag[];
}

export function getPapers(params: {
  products?: string[];
  focuses?: string[];
  q?: string;
  year?: number;
}): Paper[] {
  const database = getDb();
  const conditions: string[] = [];
  const bindings: (string | number)[] = [];

  if (params.q) {
    conditions.push(
      `(p.title LIKE ? OR p.authors LIKE ? OR p.abstract LIKE ? OR p.ai_summary LIKE ? OR p.journal LIKE ?)`
    );
    const like = `%${params.q}%`;
    bindings.push(like, like, like, like, like);
  }

  if (params.year) {
    conditions.push("p.year = ?");
    bindings.push(params.year);
  }

  let sql = `SELECT DISTINCT p.* FROM papers p`;

  // Product filter (OR within group)
  if (params.products && params.products.length > 0) {
    sql += `
      JOIN paper_tags pt_prod ON pt_prod.paper_id = p.id
      JOIN tags t_prod ON t_prod.id = pt_prod.tag_id AND t_prod.type = 'product'
        AND t_prod.name IN (${params.products.map(() => "?").join(",")})`;
    bindings.unshift(...params.products);
  }

  // Focus filter (OR within group)
  if (params.focuses && params.focuses.length > 0) {
    sql += `
      JOIN paper_tags pt_foc ON pt_foc.paper_id = p.id
      JOIN tags t_foc ON t_foc.id = pt_foc.tag_id AND t_foc.type = 'focus'
        AND t_foc.name IN (${params.focuses.map(() => "?").join(",")})`;
    // Focus bindings go after product bindings but before text search bindings
    // Need to rebuild binding order: products first, then focuses, then conditions
  }

  // Rebuild with correct binding order
  const allBindings: (string | number)[] = [];
  if (params.products && params.products.length > 0) allBindings.push(...params.products);
  if (params.focuses && params.focuses.length > 0) allBindings.push(...params.focuses);

  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(" AND ")}`;
    if (params.q) {
      const like = `%${params.q}%`;
      allBindings.push(like, like, like, like, like);
    }
    if (params.year) allBindings.push(params.year);
  }

  sql += " ORDER BY p.year DESC NULLS LAST, p.created_at DESC";

  const rows = database.prepare(sql).all(...allBindings) as PaperRow[];
  return rows.map((row) => hydratePaper(row, getPaperTags(row.id)));
}

export function getPaperById(id: number): Paper | null {
  const row = getDb()
    .prepare("SELECT * FROM papers WHERE id = ?")
    .get(id) as PaperRow | undefined;
  if (!row) return null;
  return hydratePaper(row, getPaperTags(row.id));
}

export function getPaperByDOI(doi: string): Paper | null {
  const row = getDb()
    .prepare("SELECT * FROM papers WHERE doi = ?")
    .get(doi) as PaperRow | undefined;
  if (!row) return null;
  return hydratePaper(row, getPaperTags(row.id));
}

export function createPaper(data: {
  doi: string;
  title: string;
  authors: Author[];
  year: number | null;
  journal: string | null;
  abstract: string | null;
  ai_summary: string | null;
  notes: string | null;
  url: string | null;
  product_tags: string[];
  focus_tags: string[];
}): Paper {
  const database = getDb();

  const result = database
    .prepare(
      `INSERT INTO papers (doi, title, authors, year, journal, abstract, ai_summary, notes, url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      data.doi,
      data.title,
      JSON.stringify(data.authors),
      data.year,
      data.journal,
      data.abstract,
      data.ai_summary,
      data.notes,
      data.url
    );

  const paperId = result.lastInsertRowid as number;
  setTagsForPaper(paperId, data.product_tags, "product");
  setTagsForPaper(paperId, data.focus_tags, "focus");

  return getPaperById(paperId)!;
}

export function updatePaper(
  id: number,
  data: {
    title?: string;
    ai_summary?: string;
    notes?: string;
    product_tags?: string[];
    focus_tags?: string[];
  }
): Paper | null {
  const database = getDb();
  const fields: string[] = [];
  const values: (string | null)[] = [];

  if (data.title !== undefined) { fields.push("title = ?"); values.push(data.title); }
  if (data.ai_summary !== undefined) { fields.push("ai_summary = ?"); values.push(data.ai_summary); }
  if (data.notes !== undefined) { fields.push("notes = ?"); values.push(data.notes); }

  if (fields.length > 0) {
    fields.push("updated_at = datetime('now')");
    database
      .prepare(`UPDATE papers SET ${fields.join(", ")} WHERE id = ?`)
      .run(...values, id);
  }

  if (data.product_tags !== undefined) setTagsForPaper(id, data.product_tags, "product");
  if (data.focus_tags !== undefined) setTagsForPaper(id, data.focus_tags, "focus");

  return getPaperById(id);
}

export function deletePaper(id: number): boolean {
  const result = getDb().prepare("DELETE FROM papers WHERE id = ?").run(id);
  return result.changes > 0;
}

function setTagsForPaper(
  paperId: number,
  tagNames: string[],
  type: "product" | "focus"
): void {
  const database = getDb();

  // Remove existing tags of this type for this paper
  database
    .prepare(
      `DELETE FROM paper_tags WHERE paper_id = ? AND tag_id IN
       (SELECT id FROM tags WHERE type = ?)`
    )
    .run(paperId, type);

  // Add new tags
  for (const name of tagNames) {
    const tagId = upsertTag(name, type);
    database
      .prepare("INSERT OR IGNORE INTO paper_tags (paper_id, tag_id) VALUES (?, ?)")
      .run(paperId, tagId);
  }
}
