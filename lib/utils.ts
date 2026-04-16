import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Author } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatAuthors(authors: Author[]): string {
  if (!authors || authors.length === 0) return "Unknown authors";
  if (authors.length === 1) {
    return `${authors[0].given} ${authors[0].family}`;
  }
  if (authors.length === 2) {
    return `${authors[0].given} ${authors[0].family} & ${authors[1].given} ${authors[1].family}`;
  }
  return `${authors[0].given} ${authors[0].family} et al.`;
}

export function normalizeDOI(input: string): string {
  // Strip URL prefixes
  return input
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/^doi:/i, "");
}
