# SOP & QR Code Structure Reference

Use this when creating your real SOP document and QR codes for testing. The app parses QR payloads according to the rules below.

---

## QR Code Format

**The QR code must encode plain text (not a URL) in this format:**

```
DAKKOTA-{procedureId}-{stationId}
```

| Part | Description | Example |
|------|-------------|---------|
| **Prefix** | Always `DAKKOTA-` (case-insensitive) | `DAKKOTA-` |
| **procedureId** | Short code for the assembly procedure | `FBG`, `FS`, `TW` |
| **stationId** | Station or line identifier | `001`, `A-12` |

---

## Procedure ID Options (for your SOP)

These map to the assembly tasks in the app:

| Procedure ID | Assembly Component | Task in App |
|--------------|-------------------|-------------|
| `FBG` | Front Bumper & Grille | ✓ |
| `FF` | Front Fascia | ✓ |
| `RB` | Rear Bumper | ✓ |
| `FS` | Front Suspension | ✓ |
| `RS` | Rear Suspension | ✓ |
| `OH` | Overhead Systems | ✓ |
| `TW` | Tire & Wheel Assembly | ✓ |

You can use other procedure IDs (e.g. `UNKNOWN`) — the app will accept them and display them; only these have linked task content.

---

## Example QR Payloads

| QR Content | Station | Procedure |
|------------|---------|-----------|
| `DAKKOTA-FBG-001` | 001 | Front Bumper & Grille |
| `DAKKOTA-FS-A12` | A12 | Front Suspension |
| `DAKKOTA-TW-STATION-3` | STATION-3 | Tire & Wheel |
| `DAKKOTA-OH-001` | 001 | Overhead Systems |

---

## Where This Is Defined in the Codebase

| File | What It Contains |
|------|------------------|
| `src/config/DakkotaConfig.ts` | `qrPrefix`, `parseWorkstationQR()`, assembly domains |
| `src/screens/WorkstationSelectScreen.tsx` | Dark station picker + optional QR scan modal; loads SOP, navigates to TaskDetail |
| `src/data/sopContent.ts` | SOP content keyed by `{procedureId}-{stationId}`; procedure→task mapping |
| `src/services/taskData.ts` | Task definitions (id, title, category) — maps to procedure IDs |
| `src/theme.ts` | Category labels (e.g. `front_bumper_grille` → "Front Bumper & Grille") |

## Test Assets

| File | Purpose |
|------|---------|
| `DAK-SOP-FBG-001_plaintext.txt` | SOP content for Front Bumper & Grille, station 001 |
| `QR_CODE_txt.png` | QR encoding `DAKKOTA-FBG-001` — use for scanner testing |

---

## Parsing Logic (from `DakkotaConfig.ts`)

1. Payload must start with `DAKKOTA-` (case-insensitive)
2. Rest is split by `-`; first part = `procedureId`, remainder = `stationId`
3. `DAKKOTA-FBG-001` → `procedureId: "FBG"`, `stationId: "001"`
4. `DAKKOTA-FS-A-12` → `procedureId: "FS"`, `stationId: "A-12"`

---

## Adjusting Your SOP

1. **QR code content:** Encode `DAKKOTA-{procedure}-{station}` as plain text
2. **Procedure codes:** Use the table above, or add new codes and we can extend the parser
3. **Station IDs:** Use whatever fits your layout (e.g. `001`, `LINE-A`, `STATION-3`)

If your SOP uses a different format, share it and we can update `parseWorkstationQR()` to support it.
