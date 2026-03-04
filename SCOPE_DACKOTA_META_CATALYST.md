# Dakkota Meta Catalyst Grant – Scope Adaptation

This document maps the grant application requirements to the current Omnia mobile app and outlines the changes needed to adapt the platform for the Project ARIA Bridge deployment.

**Branch:** `dakkota-meta-catalyst`  
**Reference:** `Omnia_Dakkota_Meta_Catalyst_Grant_Application.md`

---

## Executive Summary

The grant specifies a **manufacturing-focused** deployment with two main layers:

1. **Layer 1:** Contextual audio instruction via Meta Ray-Ban (hands-free, QR-triggered)
2. **Layer 2:** Behavioral data capture — **video from glasses** (hand pose, egocentric view) plus IMU where available

The current app already has **video streaming, barcode detection, and hand pose** from the glasses camera. The Dakkota scope requires:

- **Keep and extend** video capture — it is the primary data source for behavioral/motion signatures (hand pose, wrist movement, egocentric view)
- **Add** Dakkota-specific flows: workstation QR → assembly procedure → audio instructions
- **Add** consent framework: **audio-based, hands-free** consent at the start of each **workday** (not every session) so workers remain gloves-on
- **Maintain** privacy-protecting features (pseudonymization, access controls, data minimization where appropriate)
- **Defer** heavy labeling to Project ARIA deployment — current phase is collection infrastructure and basic context (QR workstation, session metadata)

---

## 1. Layer 1: Contextual Audio Instruction

### Grant Requirements

| Requirement | Current State | Action |
|-------------|---------------|--------|
| Step-by-step assembly instructions triggered by QR codes at workstations | `QRScanner.tsx` exists; used for pairing, not workstation context | **Adapt:** Use QR for workstation ID + assembly procedure ID instead of pairing only |
| Audio confirmation at quality checkpoints (yes/no via voice) | Voice commands exist in `MetaWearablesModule.swift` (SFSpeechRecognizer) | **Extend:** Add yes/no confirmation flow; match Dakkota SOP terminology |
| Supervisor escalation alerts to glasses | Not implemented | **New:** Firebase-driven alert channel → TTS on glasses |
| Multi-language (English/Spanish) | Not implemented | **New:** i18n; TTS language selection per worker |
| Battery and connectivity monitoring | BLE device health in `ble.ts`; Meta device status in Firestore | **Keep:** Already present; ensure Firestore schema supports Dakkota dashboard |
| Gloves-on operation (no touch during assembly) | App has touch navigation | **New:** "Assembly mode" — QR-scanned workstation sets context; all interaction via voice or QR |

### Implementation Notes

- **QR → Workstation flow:** Create `WorkstationScanScreen` that:
  1. Parses QR payload: `station_id` + `procedure_id` (e.g. `DAKKOTA-FBG-001` for Front Bumper & Grille)
  2. Writes active session to Firestore: `{ stationId, procedureId, userId, startedAt }`
  3. Loads procedure steps from Firestore or local config
  4. Delivers steps via TTS (reuse `elevenLabsTTS` or native AVSpeechSynthesizer)
- **Dakkota assembly domains:** Map to procedures:
  - Front Bumper & Grille
  - Front & Rear Fascia
  - Front Suspension Module
  - Rear Suspension Module
  - Overhead Systems
  - Tire & Wheel Assembly
- **Noise calibration:** Grant mentions "instruction volume adapts based on measured background noise." Consider native API for ambient noise level if Meta DAT exposes it; otherwise document as Phase 2.

---

## 2. Layer 2: Behavioral Data Capture (Video + Sensors)

### Grant Requirements

| Requirement | Current State | Action |
|-------------|---------------|--------|
| Video from glasses (egocentric view, hand pose, motion) | **StreamSession** + hand pose + barcode already implemented | **Keep:** Video is the primary data source; extend pipeline for session context and storage |
| IMU streams (accelerometer, gyroscope, magnetometer @ 50Hz) | Not exposed in current integration | **Optional:** Add via Meta DAT if available; video-based hand pose covers wrist motion today |
| Audio instruction delivery logs (timestamps, voice command class only) | TTS and voice exist; no structured logging | **New:** Log `{ instructionId, timestamp, workerResponse?: 'yes' \| 'no' }` |
| Workstation context (QR station ID, procedure ID, shift timestamp) | Not tracked | **New:** Firestore schema `sessions` with workstation, procedure, shift |
| Quality outcome linkage (pass/fail from Dakkota QC) | Not implemented | **New:** API or Firestore integration for QC outcomes; link by session/part |
| Device telemetry (battery, connectivity, session duration) | Partially in Firestore devices | **Extend:** Add `sessionTelemetry` subcollection |

### Implementation Notes

- **Video as primary source:** Hand pose, wrist/arm tracking, and egocentric view come from the glasses camera. This phase builds the collection infrastructure; **heavy labeling/annotation is deferred to Project ARIA deployment**.
- **IMU:** Add if Meta DAT exposes sensor APIs; enhances motion data but video-based pose is sufficient for initial deployment.
- **Edge buffer:** Grant requires on-device encrypted buffer before sync. Add local encrypted buffer if not present; ensure video frames and derived features are properly buffered and linked to session context.
- **Firestore schema (proposed):**

```
/sessions/{sessionId}
  - userId (string)
  - deviceId (string)
  - stationId (string)      // from QR
  - procedureId (string)    // from QR
  - startedAt (Timestamp)
  - endedAt (Timestamp)
  - consentGivenAt (Timestamp)
  - qualityOutcome? ('pass' | 'fail' | null)  // from Dakkota QC

/sessions/{sessionId}/motion_samples  (optional; IMU if available)
  - timestamp, accel_x/y/z, gyro_x/y/z, mag_x/y/z

/sessions/{sessionId}/video_frames  (or Cloud Storage for bulk)
  - hand pose, derived features; link to session for downstream labeling in ARIA phase

/sessions/{sessionId}/instruction_logs
  - instructionId, timestamp, voiceResponse?
```

---

## 3. Consent Framework

### Grant Requirements

| Requirement | Action |
|-------------|--------|
| Informed consent before data collection | **New:** **Audio-based** consent — hands-free so workers remain gloves-on |
| Consent frequency | **Per workday** — once at shift start, not every session |
| Pause or terminate via voice command or supervisor app | **New:** Voice command "stop recording" / "pause"; supervisor app action to terminate |
| Consent records: worker ID, timestamp, data types | **New:** Firestore `consent_records` collection |
| Privacy protections | Maintain throughout: pseudonymization, access controls, data minimization where appropriate |

### Implementation Notes

- **Audio consent flow:** At workday start, worker hears consent prompt via glasses (e.g. "Do you consent to data collection for training and quality improvement? Say yes or no"). Voice response captured; no touch required.
- Store consent in `consent_records/{recordId}`: `{ userId, workdayId, dataTypes[], consentedAt, audioResponse }`.
- Consent gates all session data collection for that workday; no per-session re-prompt.
- Voice: Extend `MetaWearablesModule` to recognize "stop", "pause", "terminate" for session control.

---

## 4. Privacy and Data Minimization

### Grant Requirements

| Requirement | Current State | Action |
|-------------|---------------|--------|
| Raw audio NOT stored — only processed locally for voice commands | Unclear if raw audio is stored | **Verify:** Ensure no raw audio persistence; only command class (e.g. "yes"/"no") |
| Video collected with privacy protections | Video streaming for hand pose, egocentric capture | **Keep:** Video is core data source; maintain privacy safeguards (consent, pseudonymization, access controls) |
| Worker identity pseudonymized | Firestore uses userId | **Review:** Use pseudonymous worker ID in dataset; identity mapping in separate, access-controlled registry |
| Location = workstation ID only (QR); no GPS | Location may exist in other flows | **Ensure:** Dakkota flow uses only `stationId` from QR, no GPS |

### Implementation Notes

- **Privacy-protecting features to maintain:** Informed consent (audio, per workday), pseudonymous worker IDs in dataset, access-controlled storage, no raw audio persistence, workstation-only location.
- Add `DakkotaConfig.ts` for feature flags and deployment-specific behavior (workstation flow, consent flow, etc.).

---

## 5. Worker-Centered Design

### Grant Requirements

| Requirement | Action |
|-------------|--------|
| Gloves-on: audio-triggered or QR-scanned only | Design "Assembly Mode" with no touch after QR scan |
| Noise environment: volume adapts to ambient noise | Phase 2 if API available |
| Cognitive load: use Dakkota SOP terminology exactly | Procedure content must come from Dakkota SOPs; store in Firestore or config |

---

## 6. Technical Architecture Alignment

### Current Stack (from README / package.json)

- React Native + Expo
- Firebase (Auth, Firestore)
- react-native-ble-plx
- expo-camera (QRScanner)
- expo-task-manager, expo-background-fetch
- Meta Wearables DAT (iOS) — video streaming, barcode, hand pose

### Grant-Specific Additions

| Component | Status | Priority |
|-----------|--------|----------|
| WorkstationScanScreen / Assembly flow | Not present | P0 |
| Audio-based consent (per workday) | Not present | P0 |
| Procedure steps content (Dakkota SOPs) | Not present | P0 |
| Video/session linkage (workstation context) | Partial | P0 |
| Instruction delivery logs to Firestore | Not present | P1 |
| Voice yes/no at checkpoints | Voice exists; flow missing | P1 |
| Multi-language (EN/ES) | Not present | P1 |
| Supervisor escalation | Not present | P2 |
| IMU streaming (50Hz) | Optional; if DAT supports | P2 |

---

## 7. Suggested Implementation Order

### Phase A: Foundation (Weeks 1–2)

1. Create `dakkota-meta-catalyst` branch (done)
2. Add `DakkotaConfig` for deployment-specific behavior (workstation flow, consent flow)
3. Implement **audio-based consent** (per workday, hands-free); consent record persistence
4. Implement `WorkstationScanScreen`: QR → station + procedure → create session in Firestore

### Phase B: Audio Instruction (Weeks 2–4)

5. Define Firestore schema for `procedures` and `procedure_steps` (Dakkota SOP format)
6. Implement step-by-step audio delivery using existing TTS (elevenLabs or native)
7. Add quality checkpoint steps with voice yes/no confirmation
8. Log instruction events to Firestore

### Phase C: Data Pipeline (Weeks 4–6)

9. Link video/hand pose output to session context (station, procedure, workday)
10. Implement edge buffer (local encrypted store) for video frames / derived features
11. Sync to Firebase (Firestore or Cloud Storage) with session linkage; **heavy labeling deferred to Project ARIA**
12. Add session telemetry (battery, duration); optionally add IMU if DAT supports

### Phase D: Polish (Weeks 6–8)

13. Multi-language (EN/ES) for UI and TTS
14. Supervisor escalation channel (Firebase → glasses TTS)
15. Integrate Dakkota QC pass/fail linkage (API or manual entry)
16. Documentation and grant milestone reporting

---

## 8. File-Level Checklist

| File / Area | Changes |
|-------------|---------|
| `omnia-mobile/src/navigation/index.tsx` | Add `WorkstationScan`, `ConsentScreen` routes |
| `omnia-mobile/src/screens/WorkstationScanScreen.tsx` | **New** — QR scan for station + procedure |
| `omnia-mobile/src/screens/ConsentScreen.tsx` | **New** — audio-based consent (per workday, hands-free) |
| `omnia-mobile/src/screens/AssemblyInstructionScreen.tsx` | **New** — step-by-step audio, voice confirm |
| `omnia-mobile/src/services/dakkotaSession.ts` | **New** — session creation, motion log, consent |
| `omnia-mobile/src/config/DakkotaConfig.ts` | **New** — feature flags, deployment mode |
| `omnia-mobile/ios/omniamobile/MetaWearablesModule.swift` | Add voice "stop"/"pause"; extend voice for audio consent (yes/no); optional IMU streaming |
| `omnia-mobile/src/services/firebase.ts` | Firestore schema for sessions, consent_records, procedures |
| `omnia-mobile/src/components/QRScanner.tsx` | Reuse; add parsing for workstation QR format |
| `omnia-mobile/App.tsx` | Route to Dakkota flow when in assembly mode |

---

## 9. Branch Strategy

- Work on `dakkota-meta-catalyst`; keep `main` as owner's primary branch.
- Push this branch to `origin` when ready:  
  `git push -u origin dakkota-meta-catalyst`
- Owner can review and merge when appropriate, or maintain as separate deployment track.

---

## 10. Labeling Strategy

- **Current phase (Meta Ray-Ban):** Build collection infrastructure. Capture video, hand pose, and session context (QR workstation, procedure ID, instruction logs). Store with minimal labeling — enough to link sessions to QC outcomes and procedure steps.
- **Project ARIA deployment:** Real labeling work — dense video annotation, 3D pose, procedural compliance tagging — happens when migrating to Project ARIA Gen 2. The current phase creates the pipeline and dataset structure that ARIA will consume.

---

*Last updated: March 2026*
