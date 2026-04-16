"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, ExternalLink, Pencil, Trash2, Save, X, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { formatAuthors } from "@/lib/utils";
import type { Paper } from "@/lib/types";

const PRODUCT_TAGS = [
  "Flow / Microreactor", "SyrDos", "LabMan", "LabVision",
  "LabKit", "LabBox", "RAMOS", "AutoSam", "Filtration", "DOE",
];
const FOCUS_TAGS = [
  "Flow Chemistry", "Crystallization", "Calorimetry", "Polymerization",
  "Biotechnology (OTR/RAMOS)", "Solvent Extraction",
  "Self-optimization / Machine Learning", "Scale-up",
  "Hydrogenation", "Spectroscopy / PAT",
];

interface PaperDetailProps {
  paper: Paper;
}

export function PaperDetail({ paper }: PaperDetailProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [editing, setEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [summary, setSummary] = useState(paper.ai_summary ?? "");
  const [notes, setNotes] = useState(paper.notes ?? "");
  const [selectedProducts, setSelectedProducts] = useState(
    paper.tags.filter((t) => t.type === "product").map((t) => t.name)
  );
  const [selectedFocuses, setSelectedFocuses] = useState(
    paper.tags.filter((t) => t.type === "focus").map((t) => t.name)
  );

  function toggleTag(list: string[], setList: (v: string[]) => void, name: string) {
    setList(list.includes(name) ? list.filter((v) => v !== name) : [...list, name]);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/papers/${paper.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ai_summary: summary,
          notes,
          product_tags: selectedProducts,
          focus_tags: selectedFocuses,
        }),
      });
      if (!res.ok) throw new Error("Speichern fehlgeschlagen");
      toast({ title: "Änderungen gespeichert", variant: "success" } as Parameters<typeof toast>[0]);
      setEditing(false);
      router.refresh();
    } catch (err) {
      toast({
        title: "Fehler",
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/papers/${paper.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error("Löschen fehlgeschlagen");
      toast({ title: "Publikation gelöscht" });
      router.push("/");
      router.refresh();
    } catch (err) {
      toast({
        title: "Fehler",
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
        variant: "destructive",
      });
      setDeleting(false);
    }
  }

  const productTags = paper.tags.filter((t) => t.type === "product");
  const focusTags = paper.tags.filter((t) => t.type === "focus");

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Back */}
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Zurück zur Übersicht
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex-1">
          <h1 className="text-xl font-bold leading-snug mb-2">{paper.title}</h1>
          <p className="text-sm text-muted-foreground italic">
            {formatAuthors(paper.authors)}
            {paper.journal && <span className="not-italic"> · {paper.journal}</span>}
            {paper.year && <span className="not-italic"> · {paper.year}</span>}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {editing ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditing(false)} disabled={saving}>
                <X className="h-4 w-4" />
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4 mr-1.5" />
                Bearbeiten
              </Button>
              <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Tags */}
      {!editing && (
        <div className="flex flex-wrap gap-1.5 mb-6">
          {productTags.map((t) => <Badge key={t.id} variant="product">{t.name}</Badge>)}
          {focusTags.map((t) => <Badge key={t.id} variant="focus">{t.name}</Badge>)}
        </div>
      )}

      {editing && (
        <div className="mb-6 space-y-4 rounded-md border p-4 bg-muted/20">
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide">Produkte</Label>
            <div className="grid grid-cols-2 gap-2">
              {PRODUCT_TAGS.map((name) => (
                <div key={name} className="flex items-center gap-2">
                  <Checkbox
                    id={`ep-${name}`}
                    checked={selectedProducts.includes(name)}
                    onCheckedChange={() => toggleTag(selectedProducts, setSelectedProducts, name)}
                  />
                  <Label htmlFor={`ep-${name}`} className="font-normal cursor-pointer text-sm">{name}</Label>
                </div>
              ))}
            </div>
          </div>
          <Separator />
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide">Forschungsbereich</Label>
            <div className="grid grid-cols-2 gap-2">
              {FOCUS_TAGS.map((name) => (
                <div key={name} className="flex items-center gap-2">
                  <Checkbox
                    id={`ef-${name}`}
                    checked={selectedFocuses.includes(name)}
                    onCheckedChange={() => toggleTag(selectedFocuses, setSelectedFocuses, name)}
                  />
                  <Label htmlFor={`ef-${name}`} className="font-normal cursor-pointer text-sm">{name}</Label>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <Separator className="mb-6" />

      {/* DOI link */}
      {paper.url && (
        <a
          href={paper.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline mb-6"
        >
          <ExternalLink className="h-4 w-4" />
          {paper.doi}
        </a>
      )}

      {/* AI Summary */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          KI-Zusammenfassung
        </h2>
        {editing ? (
          <Textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={4}
            className="resize-none"
          />
        ) : (
          <p className="text-sm leading-relaxed">
            {paper.ai_summary ?? <span className="text-muted-foreground italic">Keine Zusammenfassung verfügbar.</span>}
          </p>
        )}
      </section>

      {/* Abstract */}
      {paper.abstract && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Abstract
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">{paper.abstract}</p>
        </section>
      )}

      {/* Notes */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Interne Notizen
        </h2>
        {editing ? (
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Interne Notizen..."
            rows={3}
            className="resize-none"
          />
        ) : (
          <p className="text-sm leading-relaxed">
            {paper.notes ?? <span className="text-muted-foreground italic">Keine Notizen.</span>}
          </p>
        )}
      </section>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Publikation löschen?</DialogTitle>
            <DialogDescription>
              Diese Aktion kann nicht rückgängig gemacht werden. Die Publikation wird dauerhaft gelöscht.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Abbrechen
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Löschen
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
