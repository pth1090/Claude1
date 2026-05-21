# CSV-Format & Beispieldaten

## Enthaltene Beispieldateien

| Datei | Rows | Dauer | Zweck |
|-------|------|-------|-------|
| `calibration.csv` | 541 | 2700 s (45 min) | Parameteridentifikation — drei elektrische Heizschritte |
| `reaction.csv` | 401 | 2000 s (33 min) | Auswertung — exotherme Batch-Reaktion |

---

## Synthetischer Reaktor (Grundlage der Beispieldaten)

2-L-Glasreaktor, Wasserfüllung, sehr geringer Mantelfluss (0.001 kg/s ≈ 0.06 L/min).
Der niedrige Fluss ist entscheidend: er sorgt für ausreichend große Temperatursignale (ΔT_r ≈ 7 °C), die eine zuverlässige Parameteridentifikation ermöglichen.

**Wahre Parameter** (erzeugt mit dem 2-State-Modell + 0.02 °C Messrauschen):

| Parameter | Wert | Einheit | Bedeutung |
|-----------|------|---------|-----------|
| `ca0` | 2000 | J/K | Wärmekapazität Reaktor (konst. Term) |
| `ca1` | 1.0 | J/K² | Wärmekapazität Reaktor (Temp.-Koeff.) |
| `Cj` | 400 | J/K | Wärmekapazität Mantel |
| `ka0` | 80 | W/K | UA Reaktor–Mantel (konst. Term) |
| `ka1` | 0.2 | W/K² | UA Reaktor–Mantel (T_r-Koeff.) |
| `ka2` | -0.15 | W/K² | UA Reaktor–Mantel (T_j-Koeff.) |
| `ka3` | 2.0 | W/K | Wärmeverlust an Umgebung |
| `Q_stir` | 2.0 | W | Rührerleistung |

> **Wichtig beim Upload:** `Q_Rührer = 2.0 W` im Identifikations-Formular eintragen.

---

## `calibration.csv` — Drei Heizschritte

| Zeitraum | Q_calib | Δ T_r (ca.) |
|----------|---------|-------------|
| 0 – 200 s | 0 W | Einpendeln |
| 200 – 800 s | 25 W | ~3 °C Anstieg |
| 800 – 1000 s | 0 W | Abkühlen |
| 1000 – 1600 s | 50 W | ~6 °C Anstieg |
| 1600 – 1800 s | 0 W | Abkühlen |
| 1800 – 2400 s | 15 W | ~2 °C Anstieg |
| 2400 – 2700 s | 0 W | Abkühlen |

Drei verschiedene Leistungsstufen trennen `C_r` und `UA_rj` zuverlässig.
**Erwarteter NRMSE nach Identifikation: < 0.5 %**

---

## `reaction.csv` — Exotherme Batch-Reaktion

Gaußförmige Wärmefreisetzung, Q_calib = 0:

```
Q_rxn(t) = 60 W · exp(−½·((t − 700 s) / 200 s)²)
```

| Kenngröße | Wert |
|-----------|------|
| Peak-Leistung | 60 W |
| Peak-Zeitpunkt | 700 s (≈ 12 min) |
| **Wahre Gesamtenergie** | **30.07 kJ** |
| Temperatur-Anstieg T_r | ≈ +6.6 °C |

Die Auswertung sollte ~30 kJ liefern (±5 %).

---

## Pflicht-Spalten

| Spalte | Einheit | Aliases |
|--------|---------|---------|
| `time_s` | s | `t`, `time`, `Zeit_s` |
| `T_r` | °C | `T_reactor`, `T_reaktor` |
| `T_jin` | °C | `T_jacket_in`, `T_mantel_ein` |
| `T_jout` | °C | `T_jacket_out`, `T_mantel_aus` |

## Optionale Spalten

| Spalte | Einheit | Default |
|--------|---------|---------|
| `T_amb` | °C | Mittelwert von T_r |
| `flow_kg_s` | kg/s | 0 |
| `flow_L_min` | L/min | → wird automatisch zu kg/s umgerechnet |
| `Q_calib_W` | W | 0 |
