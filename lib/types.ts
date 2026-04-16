export interface Author {
  given: string;
  family: string;
}

export interface Tag {
  id: number;
  name: string;
  type: "product" | "focus";
}

export interface Paper {
  id: number;
  doi: string;
  title: string;
  authors: Author[];
  year: number | null;
  journal: string | null;
  abstract: string | null;
  ai_summary: string | null;
  notes: string | null;
  url: string | null;
  created_at: string;
  updated_at: string;
  tags: Tag[];
}

export interface PaperRow {
  id: number;
  doi: string;
  title: string;
  authors: string; // JSON string
  year: number | null;
  journal: string | null;
  abstract: string | null;
  ai_summary: string | null;
  notes: string | null;
  url: string | null;
  created_at: string;
  updated_at: string;
}

export interface DOIPreview {
  doi: string;
  title: string;
  authors: Author[];
  year: number | null;
  journal: string | null;
  abstract: string | null;
  url: string;
  ai_summary: string;
  suggested_product_tags: string[];
  suggested_focus_tags: string[];
  abstract_missing: boolean;
}

export interface CreatePaperRequest {
  doi: string;
  title: string;
  authors: Author[];
  year: number | null;
  journal: string | null;
  abstract: string | null;
  url: string | null;
  ai_summary: string;
  notes: string;
  product_tags: string[];
  focus_tags: string[];
}

export interface UpdatePaperRequest {
  title?: string;
  ai_summary?: string;
  notes?: string;
  product_tags?: string[];
  focus_tags?: string[];
}

export interface PapersResponse {
  papers: Paper[];
  total: number;
}

export interface TagWithCount extends Tag {
  count: number;
}

export interface TagsResponse {
  products: TagWithCount[];
  focuses: TagWithCount[];
}
