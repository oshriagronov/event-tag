# Agent Context: EventTag (Private Selfie-Based Cloud Event Photo Sharing Web App)

You are an expert Frontend Engineer and Client-Side Machine Learning specialist. Your role is to help develop **EventTag**, a privacy-first web application designed to scan event photos loaded directly from cloud storage (Dropbox & Google Drive active; OneDrive marked as "Soon") so guests can instantly retrieve their personal photos using a selfie in the easiest and most private way possible, with face descriptors synced securely in the cloud.


## Project Core Concept & Goal
- **What it is:** A web application where event organizers connect photos from cloud storage (Dropbox & Google Drive active; OneDrive coming soon), and the browser automatically scans, detects, and encodes faces locally. Guests can then scan a QR code / share link and upload a selfie to instantly retrieve all photos they appear in.
- **The Goal:** Make photo sharing between event organizers and guests as seamless, instant, and private as possible. Event organizers connect and scan their cloud photo folders, while guests self-service retrieve and download their personal event photos using a selfie.
- **The Ultimate Constraint:** **Cloud Ingest with Local Processing.** Images are read directly from cloud storage or local disk into browser memory, all face detection and recognition happens locally in the user's browser, and only mathematical face descriptors are stored in Firebase Firestore. No actual photo files are uploaded to or stored on our servers.


## Tech Stack & Project Architecture
- **Framework:** React 19 + TypeScript 6 + Vite 8.
- **Styling & UI:** Vanilla CSS + Tailwind CSS 4 (`@tailwindcss/vite`), clean dark-themed responsive design.
- **Icons:** Lucide React + custom official brand vectors (`GoogleIcon`, `DropboxIcon`).
- **Client-Side ML Engine:** 
  - Face detection & landmark extraction via `@vladmandic/face-api` (SSD MobileNet V1 + 68-point landmarks).
  - Face embedding extraction via **ONNX Runtime Web** executing an optimized **SFace** (MobileFaceNet backbone) model on WASM (128-dimensional L2-normalized vectors).
- **Cloud & Database:**
  - **Firebase Auth:** Google Sign-In & Email Authentication.
  - **Firebase Firestore:** Reactive storage of metadata, cloud file references, face descriptors, user profiles, allowlists, and system configuration.
  - **Security Rules Enforcement:** Strict Firestore database rules (`firestore.rules`) enforcing Admin role authorization (`isAdmin()`), blocking restricted users (`isUserActive()`), enforcing global Maintenance Mode (`isNotMaintenanceMode()`), enforcing login Allowlist Mode (`isUserAllowlisted()`), enforcing dynamic tier quota limits (`getPhotoQuotaLimit()`), and maintaining immutable system audit logs (`/audit_logs/{logId}`).
- **Admin & Management System:**
  - **AdminManagement Component & adminService:** Comprehensive 5-tool Admin suite (`/admin`) derived from Google Stitch MCP. Features dedicated side menu navigation for:
    1. **User Management:** Email/name search, user blocking/unblocking, bulk status/allowlist/premium operations, free premium plan grants (`premiumUntil`), Allowlist Mode toggle (Open vs Restricted), and Maintenance Mode toggle.
    2. **System Health & Overview Metrics:** Real-time aggregated stats (Photos Indexed, Detected Faces, Face Embeddings), Cloud Provider Fabric distribution chart (Google Drive vs. Dropbox), and Event Telemetry (Active, Scanning, Completed).
    3. **System Audit Logs (`audit_logs`):** Immutable audit log trail tracking admin changes (user status, allowlist updates, premium plan changes, maintenance toggles, quota edits) with timestamps, severity levels (Info, Warning, Security), and performed-by email/ID.
    4. **Allowlist CSV Bulk Import & Export:** Multiline text/drag-and-drop CSV parser with instant email validation, preview table, bulk import, and CSV download export.
    5. **Quota & Tier Limits Management:** Form to edit Standard and Premium tier photo limits per event (`maxPhotosPerEvent`), stored in `/system/config` and dynamically enforced at the Firestore Security Rules level (`getPhotoQuotaLimit()`).
  - **Quota & Tier Limits Enforcement (`quotaService`):** Client-side tier evaluation (`standard`, `premium`, `admin`) enforcing per-event photo limits (`maxPhotosPerEvent`), proactive creation modal photo warnings/disabled states, and Firestore capacity/high-demand error interceptor (`isFirebaseQuotaOrDemandError`) with graceful bilingual notifications ("יש לנו עומס גבוה היום במערכת, אנא נסה שוב מחר.").
  - **MaintenanceOverlay:** Full-screen maintenance mode display for non-admin users when maintenance mode is active.
- **Contexts & Modal System:**
  - **ModalContext:** Unified asynchronous modal system for confirm/alert dialogs styled like the application theme (dark backdrop blur, accessibility IS 5568 / WCAG compliant, bidi-isolated).
  - **ShareModal & shareUtils:** Native OS Web Share API integration (`navigator.share`) with automatic fallback to a custom multi-platform share modal (WhatsApp, Telegram, Email, Facebook, X/Twitter, QR Code).
- **Cloud Storage Integrations:**
  - **Dropbox API:** Direct Dropbox folder connection & file stream ingestion, automated Dropbox event folder creation, public link permission delegation (`makeFolderPublic`), local photo upload, and 2-worker parallel face scanning.
  - **Google Drive API:** Non-restricted `drive.file` scope ingestion with client-side local photo upload to automated Drive event folders, automatic public link permission delegation (`makeFolderPublic`), and 2-worker parallel face scanning.
- **Deployment & Hosting:** Optimized for Vercel deployment with `vercel.json` SPA route rewrites (`/(.*)` -> `/index.html`), static WASM model cache headers, and consent-gated Vercel Analytics (`@vercel/analytics`) & Speed Insights (`@vercel/speed-insights`) via `VercelTrackers` as well as Firebase Analytics via `FirebaseAnalytics`.

- **Local Utilities & Caching:** `qrcode.react` (share link QR codes), `dexie` (client-side IndexedDB caching).

---

## Agent Skill Directives (.agents/skills)

Agents working on this repository **MUST** consult and apply the relevant skills in `.agents/skills/` when handling domain-specific features or refactoring:

1. **Hebrew & RTL Best Practices (`.agents/skills/hebrew-rtl-best-practices/SKILL.md`)**
   - **When to use:** Any UI component, layout adjustment, styling modification, or text formatting.
   - **Key requirements:** Document root `<html lang="he" dir="rtl">`, CSS logical properties (`margin-inline-start`, `padding-inline-end`, Tailwind `ms-*`, `pe-*`, `inset-s-*`), `unicode-bidi: isolate` for mixed Hebrew/English strings (phone numbers, IDs, prices), `dir="auto"` on form inputs, and mirroring directional icons while leaving non-directional icons untouched.

2. **Israeli Accessibility Compliance (`.agents/skills/israeli-accessibility-compliance/SKILL.md`)**
   - **When to use:** Building UI components, modal overlays, interactive buttons, or auditing accessible flows.
   - **Key requirements:** Israeli Standard IS 5568 / WCAG 2.0 AA compliance, maintaining `AccessibilityWidget.tsx`, `SkipLink.tsx`, full keyboard navigation (visible focus rings), ARIA roles and labels, contrast controls, and screen-reader compatibility.

3. **Israeli Privacy Shield (`.agents/skills/israeli-privacy-shield/SKILL.md`)**
   - **When to use:** Managing user data, privacy banners, cookie consent, terms of service, or authentication rules.
   - **Key requirements:** Israeli Privacy Protection Law 1981 & Amendment 13 compliance, maintaining `ConsentContext.tsx`, `CookieBanner.tsx`, `PreferencesModal.tsx`, data minimization principles, and clear user privacy disclosures.

4. **Israeli AppSec Scanner (`.agents/skills/israeli-appsec-scanner/SKILL.md`)**
   - **When to use:** Reviewing API security, environment variables, cloud provider tokens, or user data sanitization.
   - **Key requirements:** OWASP Top 10 web security, secure handling of Google/Dropbox OAuth tokens, Firestore security rules enforcement, secret leaks prevention, and safe DOM rendering.

---

## Core Development Rules & Guidelines

### 1. Storage Architecture (Cloud-Only & Privacy-First)
- EventTag supports **Cloud Events only**.
- All photos are ingested on-the-fly from cloud providers (Google Drive / Dropbox) directly into browser memory.
- **Persistent Cloud Provider Connections:** When a user connects a cloud provider (Dropbox, Google Drive, OneDrive), the connection state (`dropbox_connected`, `google_connected`, `onedrive_connected`) is stored persistently in `localStorage` and remains active continuously until the user explicitly clicks "Disconnect" ("נתק") in Settings. Token refreshes and OAuth consents are strictly user-driven on explicit button clicks to prevent unexpected popups upon sign in or navigation. Expired tokens mark the provider as expired with in-app reconnect actions.
- All metadata, image file references, face descriptors, and clusters sync to Firebase Firestore. No photo binaries are ever uploaded to backend servers.
- **Account Deletion & Data Purge:** When a user deletes their account, all associated Firestore events and subcollections (`photos`, `faceBatches`) are deleted, cloud provider OAuth tokens and persistent connections are disconnected, active scanning loops are cancelled, client-side storage & IndexedDB are wiped, Firebase Auth user account is deleted, and privacy consent is completely reset (`resetConsent()`) so the consent banner is re-triggered on next visit/login.

### 2. Ingest Performance & Memory Safety
- **Image Downscaling:** To prevent WebGL out-of-memory crashes and speed up inference, images must be conditionally downscaled to a maximum dimension of `1600px` using an offscreen canvas prior to passing to `face-api.js` (implemented in scanning workflow).
- **Sequential Ingestion:** Never keep multiple full-res images in memory simultaneously. Revoke object URLs immediately after processing.
- **Firestore Write Buffering:** Face descriptors must be buffered in memory and written to Firestore in chunks (every 15 photos or 50 faces) instead of awaiting sequential updates, preventing database write performance degradation.
- **Parallel Multi-Event Ingestion:** `ScannerContext` tracks scan loops, pause flags, and cancellations independently per event ID (`scanStates` map, `pausedEventsRef`, `cancelledEventsRef`), allowing multiple events to scan in parallel. A warning modal notifies users on event creation during an active scan regarding potential performance impacts.

### 3. Model Accuracy, Mobile Selfie Capture & Clustering Thresholds
- **Detection recall:** Keep SSD MobileNet V1's `minConfidence` at `0.45` for event photo scanning and `0.38` for guest selfie capture to ensure side profiles, mobile camera soft focus, and shadows are successfully detected.
- **EXIF Auto-Orientation & Rotational Fallback:** All uploaded guest files and mobile camera captures are auto-oriented using `createImageBitmap(file, { imageOrientation: 'from-image' })`. If face detection fails at 0°, a rotational fallback sequence (90°, 270°, 180°) is executed on canvas to guarantee detection regardless of phone holding orientation or missing EXIF metadata.
- **Clustering precision:** Incremental face clustering uses L2-normalized Euclidean distance matching with calibrated thresholds (`matchThreshold = 0.90` and `avgThreshold = 0.95`). Guest selfie matches in `GuestView.tsx` use a strict threshold of `0.85` to prevent false positives.

### 4. UI/UX & Localization
- **Google Stitch MCP as Design Source of Truth:** Use Google Stitch MCP (`StitchMCP`) for every design choice needed. The project in Google Stitch named `event-tag` is the single source of truth for all designs and UI decisions. Do NOT rely on local design files as they will be removed; always fetch screens, variants, design systems, and visual specs from the `event-tag` Google Stitch project.
- Interface is dark-themed, sleek, and modern.
- **Hebrew & RTL Constraint:** The interface is localized in Hebrew (`dir="rtl"`). All labels, buttons, headers, inputs, alerts, and instructions should be in Hebrew with proper bidi isolation.
- **Official Google Branding & Assets:** All Google sign-in buttons, Google Drive provider indicators, and Google logos across the application **MUST** use the official branding assets located in `/public/google-login/` (via `<GoogleIcon />` component or direct references to `/public/google-login/`), and never use generic or custom inline SVGs.
- **Official Dropbox Branding & Assets:** All Dropbox provider indicators, logos, and brand buttons across the application **MUST** strictly comply with [Dropbox Brand Guidelines](https://brand.dropbox.com/) (via `<DropboxIcon />` component using exact `#0061FE` Dropbox Blue color and standard un-distorted 5-rhombus glyph vector), and never use custom or modified inline SVGs.

### 5. Documentation Maintenance & Self-Updating Context
- **Rule:** Whenever the architecture of the project (e.g., adding/removing folders, components, contexts, services) or the core logical/data flows change, the agent **MUST** immediately update `AGENTS.md` and `README.md` to reflect the updated state. This ensures that agent instructions and project documentation are always accurate and aligned with the current codebase.
- **README Guidelines:** Keep `README.md` clean, professional, and concise. Avoid excessive or unnecessary emojis.

### 6. Linting & Verification Rule
- **Mandatory Linting & Type-Check:** Before completing any task or declaring success, the agent **MUST** run `npm run lint` and `npm run build`, and resolve all reported warnings and errors. Never leave unhandled ESLint errors, warnings, or unused imports.