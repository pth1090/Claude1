# CSV-Format für die kalorimetrische Batch-Auswertung

## Pflicht-Spalten

| Spalte | Einheit | Aliases |
|--------|---------|---------|
| `time_s` | s | `t`, `time`, `Zeit_s` |
| `T_r` | °C | `T_reactor`, `T_reaktor` |
| `T_jin` | °C | `T_jacket_in`, `T_mantel_ein` |
| `T_jout` | °C | `T_jacket_out`, `T_mantel_aus` |

## Optionale Spalten

| Spalte | Einheit | Aliases | Default |
|--------|---------|---------|---------|
| `T_amb` | °C | `T_ambient`, `T_umgebung` | Mittelwert von T_r |
| `flow_kg_s` | kg/s | `mdot` | 0 |
| `flow_L_min` | L/min | `Volumenstrom_L_min` | — (wird automatisch zu kg/s umgerechnet) |
| `Q_calib_W` | W | `Q_calib`, `P_calib` | 0 |

## Beispiel Kalibrier-CSV

```csv
time_s,T_r,T_jin,T_jout,T_amb,flow_L_min,Q_calib_W
0,25.00,24.80,24.85,22.0,10.0,0.0
10,25.01,24.81,24.86,22.0,10.0,0.0
20,25.05,24.82,24.87,22.0,10.0,10.0
30,25.12,24.85,24.90,22.0,10.0,10.0
60,25.45,24.92,24.98,22.0,10.0,10.0
```

## Beispiel Versuchs-CSV

```csv
time_s,T_r,T_jin,T_jout,T_amb,flow_L_min,Q_calib_W
0,25.00,24.80,24.85,22.0,10.0,0.0
10,25.02,24.81,24.86,22.0,10.0,0.0
30,25.30,24.82,24.87,22.0,10.0,0.0
60,26.10,24.80,24.85,22.0,10.0,0.0
120,27.50,24.78,24.84,22.0,10.0,0.0
```

## Hinweise

- Zeitstempel müssen monoton ansteigend sein.
- Temperaturen in °C (keine automatische K→°C Umrechnung).
- `Q_calib_W = 0` im Reaktionsversuch, falls keine externe Heizung aktiv ist.
- Mindestens 60 Messpunkte für zuverlässige Parameteridentifikation empfohlen.
- Fehlende Werte (NaN) in Pflicht-Spalten werden automatisch entfernt.
