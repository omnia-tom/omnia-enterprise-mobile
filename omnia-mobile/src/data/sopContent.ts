/**
 * SOP content for Dakkota assembly procedures.
 * Key: "{procedureId}-{stationId}" (e.g. "FBG-001")
 * @see DAK-SOP-FBG-001_plaintext.txt, SOP_QR_REFERENCE.md
 */

const SOP_CONTENT: Record<string, string> = {
  'FBG-001': `PROCEDURE: Front Bumper & Grille
CODE: FBG
STATION: 001
CYCLE TIME: 18 minutes
PPE: Safety glasses, gloves, steel-toe boots

---

STEP 1: Inspect & Stage Components
1. Retrieve bumper assembly from rack. Verify part number matches build sheet.
2. Inspect outer surface for paint defects, scratches, or stress marks. Tag and quarantine any defective unit.
3. Stage clip kit and grille insert on assembly table within arm's reach before beginning.

STEP 2: Mount Upper Brackets
1. Position bumper assembly on fixture stand, outer face down.
2. Align left upper bracket tab with vehicle frame slot — should drop in without force.
3. Align right upper bracket — both tabs must be flush before proceeding.
4. Hand-tighten M8 bolts (x2 per side) to hold brackets in place. Do not final torque yet.

STEP 3: Seat Lower Clips
WARNING: Maintain consistent left-to-right motion across all 6 lower clips.
1. Working left-to-right, align lower clip rail with the vehicle fascia lip.
2. Using clip installer tool, press each clip until fully seated — audible click confirms engagement.
3. Total lower clips: 6. Verify all 6 are clicked before releasing fixture.
4. Run fingertip along full clip rail — no raised clips, no gaps.

STEP 4: Install Grille Insert
1. Orient grille insert with Dakkota emblem facing outward.
2. Align top edge tabs (x3) into bumper top rail slots — insert straight down, do not tilt.
3. Press lower grille edge until all 4 lower clips engage — audible click for each.
4. Verify grille flush alignment across full width — maximum gap: 1.5mm.

STEP 5: Final Torque
WARNING: Apply torque stripe to each fastener immediately after torquing.
1. Upper bracket bolts left side (x2): 12 Nm — 10mm socket.
2. Upper bracket bolts right side (x2): 12 Nm — 10mm socket.
3. Lower support brackets (x2): 8 Nm — 8mm socket.

---

QUALITY CHECKS:
- All 6 lower clips seated — no gap at fascia lip
- Grille flush — no edges exceeding 1.5mm
- All bracket bolts torqued and torque stripe applied
- No surface scratches introduced during installation
- Grille emblem centered and upright
- Build sheet signed and scanned`,
};

/** Map procedureId → taskId for TaskDetailScreen */
export const PROCEDURE_TO_TASK: Record<string, string> = {
  FBG: 'task-fbg',
  FF: 'task-ff',
  RB: 'task-rb',
  FS: 'task-fs',
  RS: 'task-rs',
  OH: 'task-oh',
  TW: 'task-tw',
};

export function getSopContent(procedureId: string, stationId: string): string | null {
  const key = `${procedureId}-${stationId}`;
  return SOP_CONTENT[key] ?? null;
}
