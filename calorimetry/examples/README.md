# CSV-Format & Beispieldaten

## Enthaltene Beispieldateien

| Datei | Rows | Dauer | Zweck |
|-------|------|-------|-------|
| `calibration.csv` | 481 | 2400 s (40 min) | Parameteridentifikation — drei elektrische Heizschritte |
| `reaction.csv` | 361 | 1800 s (30 min) | Auswertung — exotherme Batch-Reaktion |

---

## Synthetischer Reaktor (Grundlage der Beispieldaten)

Die Daten wurden mit dem 2-State-Modell (MacLeod et al. 2018) und folgenden
**wahren Parametern** erzeugt (+ 0.02 °C Messrauschen):

| Parameter | Wert | Einheit | Bedeutung |
|-----------|------|---------|-----------|
| `ca0` | 4600 | J/K | Wärmekapazität Reaktor (konst. Term) |
| `ca1` | 1.8 | J/K² | Wärmekapazität Reaktor (Temp.-Koeff.) |
| `Cj` | 850 | J/K | Wärmekapazität Mantel |
| `ka0` | 160 | W/K | UA Reaktor–Mantel (konst. Term) |
| `ka1` | 0.4 | W/K² | UA Reaktor–Mantel (T_r-Koeff.) |
| `ka2` | -0.3 | W/K² | UA Reaktor–Mantel (T_j-Koeff.) |
| `ka3` | 3.8 | W/K | Wärmeverlust an Umgebung |
| `Q_stir` | 5.0 | W | Rührerleistung |

**Reaktor:** 5-L-Glasreaktor, Wasserfüllung, Mantelfluss 0.015 kg/s (≈ 0.9 L/min Wasser)

---

## `calibration.csv` — Drei Heizschritte

| Zeitraum | Q_calib | Zweck |
|----------|---------|-------|
| 0 – 200 s | 0 W | Einpendeln |
| 200 – 700 s | 20 W | Erster Schritt |
| 700 – 900 s | 0 W | Abkühlen |
| 900 – 1400 s | 40 W | Zweiter Schritt |
| 1400 – 1600 s | 0 W | Abkühlen |
| 1600 – 2100 s | 10 W | Dritter Schritt |
| 2100 – 2400 s | 0 W | Abkühlen |

Die drei verschiedenen Leistungsstufen helfen dem Optimizer, `C_r` und `UA_rj`
gut zu trennen. Nach Identifikation sollte der NRMSE für T_r < 0.5 % sein.

---

## `reaction.csv` — Exotherme Batch-Reaktion

Gaußförmige Wärmefreisetzung, Q_calib = 0 (keine externe Heizung):

```
Q_rxn(t) = 45 W · exp(−½·((t − 600 s) / 180 s)²)
```

| Kenngröße | Wert |
|-----------|------|
| Peak-Leistung | 45 W |
| Peak-Zeitpunkt | 600 s (10 min) |
| **Wahre Gesamtenergie** | **20.29 kJ** |
| Halbwertsbreite | ≈ 424 s (7 min) |

Die Auswertung mit den identifizierten Parametern sollte ~20 kJ liefern (±5 %).

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
