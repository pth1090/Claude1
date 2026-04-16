"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertTriangle, CheckCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/use-toast";
import { normalizeDOI } from "@/lib/utils";
import type { DOIPreview } from "@/lib/types";

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

interface AddPaperDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = "doi" | "review";

export function AddPaperDialog({ open, onOpenChange }: AddPaperDialogProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("doi");
  const [doiInput, setDoiInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<DOIPreview | null>(null);

  // Review form state
  const [summary, setSummary] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [selectedFocuses, setSelectedFocuses] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  function reset() {
    setStep("doi");
    setDoiInput("");
    setError(null);
    setPreview(null);
    setSummary("");
    setNotes("");
    setSelectedProducts([]);
    setSelectedFocuses([]);
  }

  async function handleLookup() {
    const doi = normalizeDOI(doiInput);
    if (!doi) {
      setError("Bitte eine gültige DOI eingeben.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/doi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doi }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unbekannter Fehler");

      setPreview(data as DOIPreview);
      setSummary(data.ai_summary ?? "");
      setSelectedProducts(data.suggested_product_tags ?? []);
      setSelectedFocuses(data.suggested_focus_tags ?? []);
      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Abrufen der DOI");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!preview) return;
    setSaving(true);
    try {
      const res = await fetch("/api/papers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doi: preview.doi,
          title: preview.title,
          authors: preview.authors,
          year: preview.year,
          journal: preview.journal,
          abstract: preview.abstract,
          url: preview.url,
          ai_summary: summary,
          notes,
          product_tags: selectedProducts,
          focus_tags: selectedFocuses,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Speichern fehlgeschlagen");

      toast({ title: "Publikation gespeichert", variant: "success" } as Parameters<typeof toast>[0]);
      onOpenChange(false);
      reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  }

  function toggleTag(list: string[], setList: (v: string[]) => void, name: string) {
    setList(list.includes(name) ? list.filter((v) => v !== name) : [...list, name]);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {step === "doi" ? "Publikation hinzufügen" : "Angaben überprüfen"}
          </DialogTitle>
          <DialogDescription>
            {step === "doi"
              ? "DOI eingeben — Metadaten und KI-Zusammenfassung werden automatisch abgerufen."
              : "Bitte überprüfe die automatisch befüllten Felder und passe sie bei Bedarf an."}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: DOI input */}
        {step === "doi" && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="doi-input">DOI</Label>
              <div className="flex gap-2">
                <Input
                  id="doi-input"
                  placeholder="z.B. 10.1039/C8RE00148K oder https://doi.org/..."
                  value={doiInput}
                  onChange={(e) => setDoiInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !loading && handleLookup()}
                  className="flex-1"
                />
                <Button onClick={handleLookup} disabled={loading || !doiInput.trim()}>
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Laden...
                    </>
                  ) : (
                    "Abrufen"
                  )}
                </Button>
              </div>
            </div>
            {error && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                {error}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Review */}
        {step === "review" && preview && (
          <div className="space-y-5">
            {preview.abstract_missing && (
              <div className="flex items-start gap-2 rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                Kein Abstract in CrossRef verfügbar. Die KI-Zusammenfassung wurde nur aus Titel und Journal generiert.
              </div>
            )}

            {/* Metadata display */}
            <div className="rounded-md border bg-muted/30 p-4 space-y-2 text-sm">
              <div>
                <span className="font-medium">Titel:</span>{" "}
                <span className="text-muted-foreground">{preview.title}</span>
              </div>
              {preview.authors.length > 0 && (
                <div>
                  <span className="font-medium">Autoren:</span>{" "}
                  <span className="text-muted-foreground">
                    {preview.authors.map((a) => `${a.given} ${a.family}`).join(", ")}
                  </span>
                </div>
              )}
              <div className="flex gap-4">
                {preview.year && (
                  <div>
                    <span className="font-medium">Jahr:</span>{" "}
                    <span className="text-muted-foreground">{preview.year}</span>
                  </div>
                )}
                {preview.journal && (
                  <div>
                    <span className="font-medium">Journal:</span>{" "}
                    <span className="text-muted-foreground">{preview.journal}</span>
                  </div>
                )}
              </div>
            </div>

            {/* AI Summary */}
            <div className="space-y-1.5">
              <Label htmlFor="ai-summary">KI-Zusammenfassung (bearbeitbar)</Label>
              <Textarea
                id="ai-summary"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                rows={4}
                className="resize-none"
              />
            </div>

            <Separator />

            {/* Product Tags */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Produkte</Label>
              <div className="grid grid-cols-2 gap-2">
                {PRODUCT_TAGS.map((name) => (
                  <div key={name} className="flex items-center gap-2">
                    <Checkbox
                      id={`add-prod-${name}`}
                      checked={selectedProducts.includes(name)}
                      onCheckedChange={() => toggleTag(selectedProducts, setSelectedProducts, name)}
                    />
                    <Label htmlFor={`add-prod-${name}`} className="font-normal cursor-pointer text-sm">
                      {name}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Focus Tags */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Forschungsbereich</Label>
              <div className="grid grid-cols-2 gap-2">
                {FOCUS_TAGS.map((name) => (
                  <div key={name} className="flex items-center gap-2">
                    <Checkbox
                      id={`add-foc-${name}`}
                      checked={selectedFocuses.includes(name)}
                      onCheckedChange={() => toggleTag(selectedFocuses, setSelectedFocuses, name)}
                    />
                    <Label htmlFor={`add-foc-${name}`} className="font-normal cursor-pointer text-sm">
                      {name}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="notes">Interne Notizen (optional)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="z.B. Besonderheiten, Gerätevarianten, etc."
                rows={2}
                className="resize-none"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                {error}
              </div>
            )}

            <div className="flex justify-between gap-2 pt-1">
              <Button variant="outline" onClick={() => setStep("doi")} disabled={saving}>
                Zurück
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Speichern...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Publikation speichern
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
