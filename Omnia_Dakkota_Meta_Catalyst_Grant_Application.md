# META CATALYST GRANT APPLICATION
### Wearables Developer Access Toolkit Integration

## Project ARIA Bridge: Expert Motion Intelligence for Automotive Manufacturing

**Applicant Organizations:** Omnia (Aequilibrium, Inc.) × Dakkota Integrated Systems  
**Location:** Chicago, Illinois | theomnia.ai | dakkota.com  
**Application Date:** March 2026  
**Grant Requested:** $200,000 USD  
**Platform:** Meta Ray-Ban Smart Glasses → Project ARIA Gen 2 (Target)

---

## EXECUTIVE SUMMARY

Omnia and Dakkota Integrated Systems are jointly applying for the Meta Catalyst Grant to deploy a Meta Ray-Ban smart glasses integration into live automotive manufacturing environments — establishing the first large-scale, production-grade behavioral dataset of skilled factory workers. This application is the strategic precursor to a Project ARIA Gen 2 deployment.

> **The Core Value Proposition**
>
> America is facing a critical skills transfer crisis: approximately 3.5 million skilled manufacturing jobs will need to be filled over the next decade, yet the expert workers who hold tacit procedural knowledge are retiring faster than that knowledge can be documented. Omnia and Dakkota are building the infrastructure to capture, store, and eventually transfer that knowledge — at scale — starting with Meta Ray-Ban and designed from day one to migrate to Project ARIA Gen 2.

Dakkota Integrated Systems is a Tier 1 automotive supplier delivering pre-assembled systems — front and rear bumpers, fascias, overhead systems, suspension modules, door panels, tire and wheel assemblies — to the Ford Motor Company's assembly plants. Their factories represent one of the most demanding, procedure-intensive manufacturing environments in North America: workers assemble complex, multi-component systems under strict just-in-time delivery windows, following exacting quality control processes where deviations carry direct OEM consequences.

Omnia is a spatial computing and AI company whose foundational thesis is that expert worker behavior — captured through wearable sensors — constitutes one of the most valuable and underutilized data assets in the global economy. Omnia has built an enterprise mobile platform (React Native, Firebase, Bluetooth/BLE) already integrated with Meta Ray-Ban smart glasses via the Developer Access Toolkit, enabling hands-free audio instruction delivery and initial sensor data collection.

This grant will fund the first production deployment of that platform inside a Dakkota facility, with three outcomes: (1) immediate workforce training impact, reducing onboarding time for new assembly workers; (2) the collection of a proprietary, consent-based dataset of expert wrist and hand movements during complex assembly procedures; and (3) the architectural foundations — data pipelines, consent frameworks, edge processing — required to scale to Project ARIA Gen 2 full-field capture.

---

## 1. SOCIAL AND ECONOMIC VALUE

### 1.1 The Problem: Skills Drain at Industrial Scale

The U.S. manufacturing sector faces a structural crisis that is both immediate and generational. The Deloitte/Manufacturing Institute forecast that 2.1 million manufacturing positions could go unfilled by 2030 due to the skills gap. Among Tier 1 automotive suppliers — companies like Dakkota — the challenge is acute: the most experienced assembly workers, those who perform complex multi-component integration with near-zero error rates, are nearing retirement age. Their expertise is embodied and procedural; it cannot be captured in a manual or a training video.

The problem is not instruction — it is translation. New workers receive written SOPs, verbal walk-throughs, and side-by-side mentorship, but the tacit knowledge that distinguishes a master assembler (the angle of a wrist during torque application, the micro-adjustments during fitment, the haptic feedback loop during fastening) is invisible to conventional training methods. This knowledge gap translates into: higher defect rates during onboarding periods, increased supervisor load, slower line throughput, and — at the OEM level — potential assembly quality issues that carry significant warranty and recall risk.

### 1.2 Dakkota: The Ideal Deployment Environment

Dakkota Integrated Systems is one of the most sophisticated Tier 1 suppliers in the Ford supply chain. Their integrated systems model — supplying fully assembled front bumpers and grilles, front and rear fascias, front and rear suspension modules, overhead systems, and tire and wheel assemblies — means that assembly workers must execute multi-step, high-precision procedures on safety-critical and aesthetically prominent vehicle components. Each of these systems involves unique sub-assembly workflows with different tooling, fastener sequences, and quality checkpoints.

| Component System | Assembly Complexity |
|---|---|
| Front Bumper & Grille | Multi-part integration, alignment-critical, visible quality surface |
| Front & Rear Fascia | Paint-matched trim, clip/fastener sequence, fit tolerance sensitive |
| Front Suspension Module | Safety-critical, torque-sequence dependent, multi-tool workflow |
| Rear Suspension Module | Safety-critical, multi-axis positioning, alignment verification |
| Overhead Systems | Confined-space assembly, wiring integration, sequence-dependent |
| Tire & Wheel Assembly | Torque-critical, balance-sensitive, safety-rated fastening |

### 1.3 The Wearables Opportunity: Hands-Free at the Point of Work

Smart glasses are uniquely suited to this environment because the hands are occupied. A worker installing a front suspension module cannot consult a tablet, cannot divert visual attention to a screen mounted on a cart, and cannot pause to replay a training video. The value proposition of hands-free audio instruction is not marginal — it is categorically different from any alternative delivery mechanism.

> **Why Wearables — The Irreplaceable Advantage**
>
> Audio-first instruction delivered through Meta Ray-Ban glasses allows a new Dakkota assembler to receive step-by-step guidance on fastener sequence, torque specification, quality check cues, and process deviations — without ever removing their hands from the component. No existing training technology achieves this. Tablets require visual engagement. Overhead displays require head movement. Supervisor narration requires a dedicated trainer. Smart glasses deliver expert knowledge exactly when and where it is needed, at zero additional manual load.

Beyond instruction delivery, the Meta Ray-Ban's built-in microphone array and Omnia's existing mobile platform enable a second, equally important function: the passive and active capture of worker behavior during assembly. When a worker executes a correct procedure, the glasses can timestamp that moment. When audio instruction triggers a physical response, the latency and quality of that response can be measured. Over time, this creates a behavioral dataset of unprecedented fidelity for skilled manufacturing work.

---

## 2. ORIGINALITY AND INNOVATION

### 2.1 The Two-Layer Innovation Stack

Omnia's approach is not simply "put a smart glasses app on the factory floor." It is the deliberate construction of a two-layer innovation stack: an immediate training-delivery layer (what Meta Ray-Ban enables today) and a behavioral data layer (what this deployment will create for future Project ARIA integration).

#### Layer 1: Contextual Audio Instruction via Meta Ray-Ban

Using the Meta Wearables Developer Access Toolkit integrated with Omnia's existing React Native enterprise mobile platform, workers receive:

- Step-by-step assembly instructions triggered by QR codes at each workstation — no manual app navigation required
- Audio confirmation prompts at quality checkpoints (e.g., "Torque applied? Confirm: yes/no" via voice response)
- Supervisor escalation alerts sent directly to the glasses when a deviation is detected
- Multi-language support (English/Spanish) for Dakkota's diverse workforce
- Battery and connectivity monitoring through Omnia's existing BLE-based device management infrastructure

#### Layer 2: Behavioral Data Collection (Video + Sensors)

The Meta Ray-Ban's built-in camera and sensors, combined with Omnia's data collection architecture, enable the passive capture of assembly behavioral signals. **Video from the glasses is the primary data source** — hand pose, egocentric view, and wrist/arm motion — complemented by IMU where available. In this initial deployment, Omnia will focus on wrist and hand movement signatures during the following procedure types:

- Fastener application sequences (wrist rotation axis, speed, applied force proxy via accelerometer)
- Component alignment maneuvers (bilateral arm coordination, position stabilization)
- Quality inspection gestures (range of motion patterns, hesitation markers, correction events)
- Tool handoff and transition events (motion discontinuities, grip change signatures)

These data streams, while less comprehensive than Project ARIA Gen 2's full-field EgoBlur capture, are sufficient to build labeled training datasets for: gesture recognition models for future AR overlay triggering; procedural compliance detection (did the worker complete step 4 before step 5?); and anomaly detection (motion signatures that precede quality escapes).

### 2.2 The Dataset: Why It Matters Beyond This Deployment

The dataset Omnia and Dakkota will create is, to our knowledge, without precedent in two specific respects: it is generated from live production workers (not laboratory simulations), and it is labeled against real assembly outcomes (pass/fail quality data from Dakkota's existing QC infrastructure).

> **Dataset Value Proposition**
>
> Most existing industrial motion datasets are captured in research labs with actors performing simulated tasks. Dakkota's workers are performing actual production assembly on components that will be installed in vehicles delivered to consumers. When we capture a wrist motion signature during front suspension installation, and that suspension passes or fails Dakkota's torque verification check, we have a ground-truth labeled data point of extraordinary value. At scale — across dozens of workers, multiple facilities, and months of operation — this becomes a foundational training corpus for embodied AI in industrial settings.

This dataset has direct downstream applications in: fine-tuning Project ARIA Gen 2 models for industrial egocentric video understanding; training reinforcement learning agents for humanoid robotics (assembly task completion); developing quality prediction models that operate from motion signals alone; and creating the next generation of AR overlay triggering based on recognized physical gestures rather than button presses.

### 2.3 The AI Flywheel: Teaching New Workers to Move Like Veterans

The most powerful long-term application of this data collection strategy is one that closes the loop entirely: using the motion signatures of Dakkota's most experienced workers to directly improve the real-time AI guidance delivered to new ones. This is the core flywheel Omnia is building.

In the initial deployment, Omnia will specifically target data collection sessions with Dakkota's senior assemblers — workers with 10, 15, or 20+ years of experience on specific stations. These are the individuals whose wrist movements are optimally efficient, whose fastener sequences are error-free, and whose quality instincts are encoded in their physical behavior. Their motion signatures become the ground truth: the model of what excellent assembly looks and feels like, captured at the sensor level.

> **From Expert Capture to Novice Coaching — The Feedback Loop**
>
> **Phase 1 (Capture):** Senior workers wear Meta Ray-Ban glasses during production. Omnia records their motion signatures — wrist rotation profiles, arm movement sequences, tool transition patterns, pace and rhythm — timestamped against procedure steps and quality outcomes.
>
> **Phase 2 (Modeling):** Omnia's AI pipeline extracts the motion features that distinguish expert performance: the correct torque application arc, the efficient component alignment sequence, the characteristic hesitation-free rhythm of a worker who has performed a task ten thousand times.
>
> **Phase 3 (Coaching):** New workers wearing the glasses receive not just audio instructions, but adaptive, personalized feedback based on how their movements compare to the expert baseline. "Apply more rotation on the fastener" or "Hold the component steady before seating" — real-time micro-coaching derived directly from what the veterans actually do, not just what the manual says.

This creates a compounding return on the data investment. Every shift a senior worker spends in the system enriches the expert model. Every shift a new worker spends guided by that model compresses their learning curve. Over time, the gap between a first-week assembler and a ten-year veteran — a gap that today takes years to close and costs Dakkota in defects, rework, and supervisor time — begins to narrow within weeks.

Critically, this is not a hypothetical future capability. It is the direct architectural consequence of the data collection infrastructure being built in this deployment. The labeled motion dataset, the QC outcome linkage, the per-worker longitudinal tracking — each of these components is a prerequisite for the coaching model, and each is being built now. The Catalyst grant funds the foundation; the flywheel is what runs on top of it.

The implications extend beyond Dakkota. Every Tier 1 supplier faces the same knowledge transfer problem. Every skilled trade — welding, machining, quality inspection, precision assembly — has a generation of experts whose embodied knowledge has never been systematically captured. Omnia's platform, validated at Dakkota, becomes the template for deploying this flywheel across the broader manufacturing economy.

### 2.4 Technical Architecture: Built for ARIA Migration

Omnia's platform architecture (React Native / TypeScript / Firebase / BLE) has been designed from the outset with sensor data extensibility as a first-class concern. The Meta Ray-Ban integration uses the Wearables DAT to expose device sensor streams through a React Native bridge, which feeds into Omnia's existing Firebase time-series data pipeline.

| System Component | Current (Meta Ray-Ban) → Future (Project ARIA Gen 2) |
|---|---|
| Instruction Delivery | Audio via glasses speaker → Audio + spatial AR overlay on workstation |
| Motion Capture | Egocentric video + hand pose + IMU (Meta Ray-Ban) → Full egocentric video + IMU (ARIA Gen 2) |
| Data Pipeline | Firebase edge buffer + cloud sync → On-device EgoBlur + privacy-safe cloud |
| Labeling | QR-triggered timestamps + QC outcome (collection phase) → Dense video annotation + 3D pose (ARIA phase) |
| Consent Framework | Audio-based per-workday consent (hands-free) → IRB-compliant protocol (in development) |
| Storage | Firebase Firestore + Cloud Storage → Distributed storage with compute-at-edge |

---

## 3. CRITICAL TIMING

### 3.1 Why Now for Omnia

Omnia has reached a strategic inflection point. Following a commercial partnership agreement with Dakkota that establishes the framework for technology deployment across Dakkota's manufacturing network, Omnia has the access, the partner, and the platform — but requires the capital and the Meta partnership to execute the first production deployment. This grant represents the moment at which Omnia's technology transitions from demonstrated capability to production-proven system.

Critically, the Dakkota commercial agreement includes a two-phase structure: Phase 1 is the current deployment (technology pilot and IP demonstration), and Phase 2 is a broader equity and licensing arrangement. The Phase 2 structure is contingent on Phase 1 demonstrating measurable outcomes. The Catalyst grant directly funds Phase 1, which unlocks Phase 2 — a potential multi-facility, multi-year rollout representing 10x the initial deployment scale.

### 3.2 Why Now for the Industry

The automotive supply chain is in the midst of a significant workforce transition driven by three simultaneous forces: the retirement of Baby Boomer assembly workers; the shift to electric vehicle platforms requiring retraining of existing workforces; and OEM quality pressure intensifying as supply chains recover from pandemic-era disruptions. Dakkota and its peers are under active pressure from Ford to improve first-time quality metrics and reduce supplier-attributable defects. Smart glasses-delivered instruction is a direct response to this pressure, deployable now, with technology that exists today.

### 3.3 Why Now for Project ARIA

Meta's Project ARIA research program has demonstrated the research potential of egocentric AI data collection. The transition from ARIA to commercial-scale data is the critical challenge: finding partners with the domain access, consent infrastructure, and data labeling capability to generate high-quality production datasets. Omnia and Dakkota represent exactly this: a live production environment with thousands of procedural assembly events per shift, a workforce capable of providing informed consent, and an existing data infrastructure designed for ARIA integration.

> **The ARIA Bridge Strategy**
>
> This Catalyst grant is explicitly designed as a bridge. We are not building a Meta Ray-Ban app for its own sake. We are using the Meta Ray-Ban's availability, affordability, and DAT integration to build the data infrastructure, consent protocols, worker familiarity, and labeled dataset that will make a Project ARIA Gen 2 deployment immediately productive from day one. Every architectural decision in this deployment — edge buffering, consent UI, QR-triggered labeling, Firebase schema — has been made with ARIA migration as the design constraint.

### 3.4 Deployment Timeline

| Timeline | Milestone |
|---|---|
| Month 1–2 | Hardware procurement (10 Meta Ray-Ban units), DAT integration finalization, Dakkota facility access and safety certification |
| Month 3 | Pilot deployment: 5 workers, Front Bumper & Grille station, audio instruction baseline testing |
| Month 4–5 | Expand to 20 workers across 3 assembly stations, activate data collection pipeline, consent enrollment |
| Month 6 | Dataset milestone: 10,000+ labeled motion events, instruction efficacy report, onboarding time reduction measurement |
| Month 7–9 | Scale to full pilot station coverage (all 6 assembly domains), data pipeline optimization |
| Month 10–12 | Project ARIA Gen 2 integration design, grant impact report, Phase 2 Dakkota proposal |

---

## 4. USER EXPERIENCE AND TRUST

### 4.1 Worker-Centered Design

Omnia's enterprise mobile platform was designed with factory workers as the primary user — not IT administrators, not supervisors, not data scientists. This means the interaction design for the Meta Ray-Ban integration is built around three constraints specific to the manufacturing floor environment:

- **Gloves-on operation:** All navigation is audio-triggered or QR-scanned; no touchscreen interaction is required during assembly
- **Noise environment:** Audio delivery is calibrated for high-ambient-noise environments; instruction volume adapts based on measured background noise levels
- **Cognitive load minimization:** Instructions follow the Dakkota standard operating procedure format exactly, using the same terminology workers already know, reducing cognitive translation overhead

### 4.2 Privacy Architecture

The data Omnia collects is sensor data from consented workers in a controlled B2B environment. Our privacy architecture includes:

#### Consent Framework
- **Audio-based informed consent** at the start of each workday — hands-free so workers remain gloves-on; no touchscreen required
- Workers can pause or terminate data collection at any time via voice command or supervisor app
- Consent records stored with worker ID, timestamp, and specific data types consented to
- Consent is obtained once per workday (not per session), reducing friction for shift workers

#### Data Minimization
- Audio from the glasses microphone is NOT stored — only processed locally for voice command recognition (e.g., yes/no, start, stop)
- **Video from the glasses camera IS captured** as the primary behavioral data source (hand pose, egocentric view, wrist/arm motion signatures); privacy protections applied (consent, pseudonymization, access controls)
- Worker identity is pseudonymized in the dataset; real identity mapping held in separate, access-controlled registry
- Location data is limited to workstation ID (QR-scanned); GPS is not used inside the facility

#### Data Storage and Security
- All data encrypted in transit (TLS 1.3) and at rest (AES-256)
- Firebase Firestore with security rules limiting access to Omnia platform services only
- No data shared with third parties without separate explicit consent
- Data retention policy: raw sensor data archived after 90 days; derived behavioral features retained indefinitely

### 4.3 Organizational Data Governance

Dakkota retains full visibility into all data collected from their workers through a dedicated supervisor dashboard in Omnia's enterprise platform. Dakkota can: review consent enrollment status for any worker, export or delete any worker's data on request, set facility-level data collection parameters (which assembly stations, which data types), and receive automated alerts if any anomalous data volumes or access patterns are detected.

> **Meta AUP Compliance**
>
> This application is designed to comply fully with the Meta Wearables Developer Acceptable Use Policy. The deployment is B2B in a controlled factory environment where all individuals present are either Dakkota employees with informed consent or authorized visitors who have signed facility access agreements. No data is collected from the general public. Video capture is used solely for consented worker training and voluntary motion data collection in a controlled industrial setting. All audio processing is on-device. The application purpose — worker training and behavioral dataset creation — falls clearly within permitted professional and industrial use cases.

---

## 5. EXISTING PLATFORM AND TECHNICAL CAPABILITY

### 5.1 The Omnia Enterprise Mobile Platform

Omnia has an existing, deployed React Native enterprise mobile application (available at github.com/omnia-tom/omnia-enterprise-mobile) that serves as the technical foundation for this grant application.

| Capability | Implementation Status |
|---|---|
| Meta Ray-Ban Integration | Meta Wearables DAT iOS SDK integrated via React Native Swift bridge; device discovery, connection, and event streaming implemented |
| Bluetooth/BLE Management | react-native-ble-plx for low-energy device pairing and background state management |
| Authentication | Firebase Auth with enterprise SSO; worker identity management |
| Data Pipeline | Firebase Firestore for real-time sensor data buffering; Firebase Cloud Storage for larger data payloads |
| Background Processing | expo-task-manager + expo-background-fetch for continuous device monitoring without active app foreground |
| QR-Based Activation | expo-barcode-scanner for workstation identification and instruction context setting |
| Device Management | BLE-based device health monitoring (battery, connectivity, firmware version) |

### 5.2 Technical Team

- **Aldo Fenili (Founder & CEO):** Corporate architecture, product strategy, enterprise client management, Dakkota relationship owner
- **Tom Shannon (Co-Founder & Lead Engineer):** React Native, TypeScript, iOS Swift bridging, Firebase architecture, BLE protocol implementation, Meta DAT SDK integration
- **Industrial data pipeline engineering:** Omnia's existing NSFLOW partnership has produced production experience in real-time sensor data collection, edge buffering, and cloud synchronization

### 5.3 Pathway to Scale

- **Dakkota Network Expansion:** Dakkota operates multiple manufacturing facilities. A successful pilot at Facility 1 creates an internal business case for expansion across their entire manufacturing network — potentially 500+ workers across 5+ facilities
- **Ford Supply Chain Adjacency:** As a Tier 1 Ford supplier, Dakkota's adoption creates a reference case directly within Ford's supply chain ecosystem, opening conversations with adjacent Tier 1 and Tier 2 suppliers
- **Platform Licensing Model:** Omnia's platform is designed for multi-tenant enterprise deployment. Each new facility is an incremental software configuration, not a new development project
- **ARIA Gen 2 Dataset Licensing:** The behavioral dataset created in this deployment has independent commercial value as a training corpus for embodied AI research — creating a secondary revenue stream that funds continued expansion

---

## 6. SUBMISSION SUMMARY — PROJECT ARIA ALIGNMENT

*Per guidance from the Meta Reality Labs team, we include the following summary to support downstream Project ARIA Gen 2 consideration.*

### Intended Recording Environment

Primary deployment environment: Dakkota Integrated Systems manufacturing facility, Tier 1 automotive supplier. Controlled-access factory floor with designated assembly stations for front/rear bumpers, fascias, front and rear suspension modules, overhead systems, and tire/wheel assemblies. Workers are at fixed or semi-fixed stations with predictable movement patterns and defined task boundaries. The environment is indoors, has stable lighting with industrial overhead fluorescents supplemented by task lighting, and has defined acoustic characteristics (high ambient industrial noise, consistent background frequency signature). All individuals in the recording environment are either consented employees or authorized visitors under facility access agreements.

### Approximate Units Needed and Timeline

| Phase | Unit Count and Scope |
|---|---|
| Phase 1 (Months 1–6) | 10 Meta Ray-Ban units — pilot deployment across 2 assembly stations, 15–20 workers on rotating shifts |
| Phase 2 (Months 7–12) | 30 Meta Ray-Ban units — full-station deployment across 6 assembly domains |
| ARIA Gen 2 Target (Year 2) | 20 Project ARIA Gen 2 units — upgrade cohort for full-field egocentric data collection |
| Long-term Scale | 100+ units across Dakkota network expansion (3–5 facilities) |

### Data Collected and How It Will Be Stored and Used

#### Data Types Collected (Meta Ray-Ban Phase)
- **Egocentric video and hand pose** from the glasses camera — primary source for wrist/arm motion signatures and behavioral modeling
- Inertial sensor streams (where available): accelerometer (3-axis), gyroscope (3-axis), magnetometer — 50Hz during active assembly
- Audio instruction delivery logs: timestamps of instruction events, worker voice-command responses (command class only, not raw audio)
- Workstation context: QR-scanned station ID, assembly procedure ID, shift timestamp
- Quality outcome linkage: assembly pass/fail status from Dakkota's existing QC system, linked to session timestamps
- Device telemetry: battery level, connectivity quality, session duration

*Note: Heavy labeling (dense annotation, 3D pose) is deferred to the Project ARIA Gen 2 phase; the Ray-Ban phase builds collection infrastructure and session context for downstream ARIA integration.*

#### Storage Architecture
- **Edge buffer:** On-device sensor data buffered in Omnia mobile app local storage (encrypted)
- **Primary store:** Firebase Firestore (real-time sync) + Firebase Cloud Storage (large payloads) — Google Cloud us-central1 region
- **Backup:** Automated daily export to Google Cloud Storage with versioning and 90-day raw retention
- **Derived features:** Extracted motion features stored in BigQuery for model training access

#### How Data Will Be Used
- **Immediate (Year 1):** Training efficacy analysis — does audio instruction reduce onboarding time and error rates? This directly informs Dakkota's workforce development metrics
- **Short-term (Year 1–2):** Procedural compliance modeling — can motion signatures predict whether a worker completed the correct assembly sequence? This creates a quality assurance feedback loop
- **Medium-term (Year 2–3):** Project ARIA Gen 2 integration — the labeled motion dataset from the Ray-Ban phase becomes the ground-truth annotation layer for Project ARIA Gen 2 video collection, enabling dense labeling at scale
- **Long-term (Year 3+):** Foundation model contribution — the combined dataset (motion + full egocentric video) contributes to training data for embodied AI systems capable of understanding and eventually replicating expert assembly behavior

> **The Dataset's Broader Scientific Value**
>
> What Omnia and Dakkota will create is the first longitudinal, production-labeled behavioral dataset of skilled workers performing safety-critical physical assembly tasks. Unlike academic motion capture datasets, ours is: (1) collected during real production runs with real quality outcomes; (2) labeled against ground-truth procedural sequences from Dakkota's SOPs; (3) longitudinal — we will track the same workers over months, enabling learning curve and expertise development modeling; and (4) multi-domain — spanning 6 distinct assembly procedure types with different tooling, component sizes, and motion requirements. This dataset will be of direct relevance to Meta's Project ARIA research agenda on egocentric AI and embodied intelligence.

---

## 7. GRANT BUDGET — $200,000 REQUEST

| Budget Item | Amount |
|---|---|
| Hardware: 30 Meta Ray-Ban Smart Glasses (phased) | $45,000 |
| Software Engineering: DAT SDK integration, data pipeline, QC system API | $60,000 |
| Data Infrastructure: Firebase scaling, BigQuery, storage, security audit | $25,000 |
| Facility Deployment: Safety certification, Dakkota IT integration, cabling/network | $20,000 |
| Consent & Compliance: Legal review, consent UI, privacy audit, data governance docs | $15,000 |
| Worker Training: Onboarding program development, supervisor training curriculum | $10,000 |
| Project Management & Reporting: Grant reporting, milestone documentation, impact metrics | $10,000 |
| Contingency (7.5%) | $15,000 |
| **TOTAL** | **$200,000** |

---

## 8. CONCLUSION

Omnia and Dakkota are applying for this grant not to explore whether smart glasses can add value in manufacturing — we already know they can. We are applying to execute the deployment that will prove it, at scale, in one of the most demanding production environments in the American automotive supply chain.

The Meta Ray-Ban is the right tool for this moment: affordable, deployable today, DAT-accessible, and capable of delivering the hands-free audio instruction that new Dakkota assemblers need. More importantly, this deployment is the first chapter of a longer story: the creation of a proprietary, production-labeled behavioral dataset of skilled manufacturing workers that will become a foundational asset for Project ARIA Gen 2 industrial deployment and, ultimately, for the training of embodied AI systems that can help address the skilled labor crisis at national scale.

This is a grant application with a clear path to pilot, a committed Tier 1 automotive partner, an existing production-grade codebase, and a data collection thesis that directly advances Meta's stated research priorities in egocentric AI and wearable intelligence. We are ready to build — and we are asking for the partnership and funding to begin.

---

*Omnia (Aequilibrium, Inc.) × Dakkota Integrated Systems | Chicago, Illinois | March 2026*  
*github.com/omnia-tom/omnia-enterprise-mobile | theomnia.ai*
