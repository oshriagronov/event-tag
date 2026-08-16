<p align="center">
  <img src="public/logo-with-bg.svg" alt="EventTag Logo" width="280" />
</p>

<p align="center">
  <strong>Private Selfie-Based Event Photo Sharing & Retrieval Platform</strong>
</p>

<p align="center">
  A privacy-first web application that lets event organizers scan cloud photos and enables guests to retrieve their photos with a single selfie, making event photo sharing seamless, instant, and private.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/react-19-blue?logo=react" alt="React 19" />
  <img src="https://img.shields.io/badge/typescript-6-blue?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/vite-8-purple?logo=vite" alt="Vite 8" />
  <img src="https://img.shields.io/badge/tailwind-4-blue?logo=tailwindcss" alt="Tailwind CSS 4" />
  <img src="https://img.shields.io/badge/firebase-12-orange?logo=firebase" alt="Firebase 12" />
</p>


## What is EventTag?

EventTag is a privacy-first event photo sharing and retrieval platform designed to make sharing photos between event organizers and guests effortless and secure. Event organizers connect cloud photo folders directly from **Dropbox** or **Google Drive** (with **OneDrive** coming soon) for browser-based scanning, and guests scan a share link or QR code with a selfie to instantly find and download all photos they appear in.

### The Goal
- **For Guests:** Instant, private, self-service retrieval and download of their event photos using a simple selfie.
- **For Event Organizers:** Effortless photo distribution directly from cloud storage without manual sorting or tagging.

**Privacy-First & On-Device AI:** All face detection, alignment, and 128-dimensional embedding extraction occur **100% locally in the user's browser** using WebAssembly (ONNX Runtime Web with SFace + `@vladmandic/face-api`). Photos are ingested in-memory from cloud storage or local disk; **no photo files are ever uploaded to or stored on backend servers**. Only mathematical face vectors and metadata sync to Firebase Firestore.


## Features

### Guest Experience
- **Selfie Search:** Capture or upload a selfie to query event photos in real time.
- **EXIF Auto-Orientation & Rotational Fallback:** Automatic orientation fixes and 4-point rotational detection (0°, 90°, 180°, 270°) to ensure detection regardless of camera angle.
- **Strict Face Matching:** Calibrated 0.85 vector distance threshold prevents false positives.
- **Photo Retrieval & Downloads:** View full-resolution photos directly from cloud storage with single photo and bulk ZIP download (`jszip`) options.
- **QR Code & Social Sharing:** Instant access via dynamic QR codes (`qrcode.react`) and multi-platform share menus (WhatsApp, Telegram, Facebook, X, Email).

### Event Organizer Experience
- **Multi-Cloud Storage Integrations:** Connect folders directly from **Dropbox** and **Google Drive** (OneDrive marked as "Soon").
- **Cloud Auto-Ingest & Upload:** Ingest local photos to automatically create event folders in Dropbox or Google Drive with public view permissions.
- **2-Worker Parallel Face Scanning:** Multi-worker pipeline performing offscreen canvas downscaling (max 1600px), face detection, 112x112 landmark alignment, and SFace WASM embedding extraction.
- **Multi-Event Parallel Ingestion:** Scan multiple events concurrently with independent pause, resume, and cancel controls per event alongside live ETA metrics.
- **Automatic Face Clustering:** On-device incremental clustering groups detected faces into distinct guest profiles.
- **Dynamic Tier & Quota Limits:** Dynamic tier limits (`standard`, `premium`, `admin`) enforced client-side (`quotaService`) and on Firestore security rules, with graceful capacity error handling.

### Admin Management Suite (`/admin`)
- **User Management:** Email/name search, account blocking/unblocking, allowlist management, and premium plan grants with expiration tracking.
- **System Health & Metrics:** Aggregated metrics (indexed photos, detected faces, face embeddings), cloud provider distribution, and event status telemetry.
- **Immutable System Audit Logs:** Structured audit log trail (`audit_logs`) tracking administrative actions with severity levels, timestamps, and admin identity.
- **Allowlist CSV Import/Export:** Multiline text and drag-and-drop CSV parser with instant email validation, preview table, bulk import, and CSV export.
- **Quota Configuration:** Dynamic configuration of per-event photo limits for standard and premium tiers stored in `/system/config`.

### Privacy, Compliance & Accessibility
- **Israeli Privacy Protection Law & Amendment 13 Compliance:** Built-in cookie consent banner, granular privacy preferences modal, data minimization, and automated data purging upon account deletion.
- **Israeli Standard IS 5568 / WCAG 2.0 AA Accessibility:** Dedicated accessibility toolbar widget, keyboard navigation, high contrast controls, font scaling, and screen reader compatibility.
- **Hebrew & RTL Optimization:** Fully localized in Hebrew (`dir="rtl"`) using CSS logical properties and bidirectional text isolation.


## Architecture

```
src/
├── App.tsx                     # Root router, providers, and layout structure
├── main.tsx                    # React entry point
├── index.css                   # Global CSS & Tailwind CSS 4 setup
├── firebase.ts                 # Firebase initialization (Auth & Firestore)
├── components/
│   ├── AccessibilityWidget.tsx  # IS 5568 / WCAG 2.0 AA accessibility toolbar
│   ├── AdminManagement.tsx      # Admin panel (User Management, Health, Audit Logs, Allowlist, Quotas)
│   ├── AllowlistManagement.tsx  # Allowlist management tool component
│   ├── CookieBanner.tsx        # Amendment 13 Privacy & Cookie Consent banner
│   ├── Dashboard.tsx           # Multi-event management & cloud provider connection
│   ├── DropboxIcon.tsx         # Official Dropbox brand logo icon component
│   ├── EventView.tsx           # Event workspace, gallery, scanning progress & face clusters
│   ├── FirebaseAnalytics.tsx   # Consent-gated Firebase Analytics telemetry component
│   ├── FolderPicker.tsx        # Cloud folder selector modal
│   ├── Footer.tsx              # Footer with legal links & compliance info
│   ├── GoogleIcon.tsx          # Official Google branding asset component
│   ├── GuestView.tsx           # Guest selfie search, face matching & photo gallery
│   ├── LandingPage.tsx         # Modern landing page with hero, features, FAQ & CTA
│   ├── LegalPage.tsx           # Terms of Service, Privacy Policy & Accessibility Statement
│   ├── MaintenanceOverlay.tsx  # Maintenance mode full-screen overlay for non-admin users
│   ├── PreferencesModal.tsx    # Granular privacy consent settings modal
│   ├── PrivacyBanner.tsx       # Ingest privacy assurance indicator
│   ├── PrivacyPage.tsx         # Detailed privacy compliance page
│   ├── SelfieCapture.tsx       # Live camera / file selfie capture tool with rotational fallback
│   ├── SettingsModal.tsx       # Theme & font size preferences modal
│   ├── ShareModal.tsx          # Multi-platform share menu modal (WhatsApp, Telegram, Email, FB, X, QR)
│   ├── SkipLink.tsx            # Accessible skip-to-main-content link
│   └── VercelTrackers.tsx      # Consent-gated Vercel Analytics & Speed Insights component
├── contexts/
│   ├── AuthContext.tsx         # Firebase Auth session, user profiles, roles & cloud OAuth tokens
│   ├── ConsentContext.tsx      # Privacy Protection Law consent state
│   ├── ModalContext.tsx        # Unified asynchronous modal dialog system
│   ├── ScannerContext.tsx      # Global scanning state (progress, pause, ETA, parallel workers)
│   └── SettingsContext.tsx     # Visual preferences context
├── services/
│   ├── adminService.ts         # User management, system metrics, audit logs, allowlist, quota limits
│   ├── cloudProviders.ts       # Unified cloud provider abstraction layer
│   ├── dropbox.ts              # Dropbox Chooser & file streaming integration
│   ├── faceAlignment.ts        # Facial landmark alignment (112x112 similarity transform)
│   ├── faceMatching.ts         # Face vector distance & similarity matching
│   ├── firestore.ts            # Firestore CRUD & batched descriptor writer
│   ├── google.ts               # Google Drive API REST v3 integration
│   ├── modelLoader.ts          # SFace WASM model asset loader
│   ├── onnxModel.ts            # ONNX Runtime Web (SFace WASM 128-dim embedding extractor)
│   ├── quotaService.ts         # Dynamic tier quota calculator & capacity error handler
│   └── translations.ts         # Hebrew/English localization strings
└── utils/
    └── shareUtils.ts           # Web Share API & fallback share link helpers
```

### Data Flow

```
Cloud Storage (Google Drive / Dropbox)
  → In-Memory Image Fetch & Downscale (Max 1600px offscreen canvas)
    → @vladmandic/face-api (SSD MobileNet V1 Detection + 68 Landmarks)
      → Landmark Alignment (112x112 similarity transform)
        → ONNX Runtime Web (SFace WASM 128-dim vector extraction)
          → Incremental Face Clustering (L2 Euclidean distance matching)
            → Firebase Firestore Batched Write (Descriptors & metadata only)
              → Real-time Dashboard & Guest Selfie Search UI
```

### Firestore Database Schema

| Collection | Description | Key Fields |
|------------|-------------|------------|
| `events`   | Event metadata & access codes | `id`, `name`, `createdAt`, `ownerId`, `shareCode`, `provider` |
| `photos`   | References to cloud files | `id`, `eventId`, `driveFileId`/`dropboxPath`, `fileName`, `processed` |
| `faces`    | Extracted face vectors & bounding boxes | `id`, `photoId`, `clusterId`, `descriptor` (128 floats), `boundingBox` |
| `clusters` | Face group clusters assigned to guests | `id`, `eventId`, `name`, `faceCount` |
| `users`    | User account profiles and roles | `uid`, `email`, `role`, `status`, `tier`, `premiumUntil`, `allowlisted` |
| `audit_logs` | Immutable system audit log trail | `id`, `timestamp`, `action`, `performedBy`, `severity`, `details` |
| `system`   | Global configuration documents | `maintenanceMode`, `allowlistMode`, `maxPhotosPerEvent` |


## Performance & Scanning Optimizations

1. **Offscreen Canvas Downscaling:** High-resolution photos are scaled to a maximum dimension of `1600px` before inference, preventing WebGL out-of-memory errors and accelerating throughput.
2. **Tuned Detection Recall:** SSD MobileNet V1 operates at `minConfidence = 0.45` for event photos and `0.38` for guest selfies to reliably capture varying lighting and angles.
3. **Batched Database Writes:** Face vectors are buffered in memory and flushed to Firestore in chunks (15 photos or 50 faces), avoiding individual write bottlenecks.
4. **On-Device ONNX WASM Execution:** 128-dimensional face embeddings are extracted using SFace running on ONNX Runtime Web via WebAssembly.


## Getting Started

### Prerequisites
- **Node.js** 18+ and **npm**
- Modern Web Browser with WebGL and WebAssembly support (Chrome, Edge, Safari, Firefox)

### Installation & Execution

```bash
# Clone repository
git clone https://github.com/oshriagronov/event-tag.git
cd event-tag

# Install dependencies
npm install

# Start Vite development server
npm run dev
```


## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Starts local dev server at `http://localhost:5173` |
| `npm run build` | Runs TypeScript check (`tsc -b`) and builds production bundle |
| `npm run preview` | Previews production build locally |
| `npm run lint` | Runs ESLint analysis across the codebase |


## Deployment (Vercel)

EventTag is configured for zero-config deployment on **Vercel**:

### 1. Connect Repository
1. Import the repository into your [Vercel Dashboard](https://vercel.com).
2. Set Framework Preset: **Vite**.
3. Output Directory: `dist`.

### 2. Configure Environment Variables
In Vercel Project Settings → **Environment Variables**, configure:
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_DROPBOX_CLIENT_ID`
- `VITE_GOOGLE_CLIENT_ID`
- `VITE_ONEDRIVE_CLIENT_ID`

### 3. Update OAuth Authorized Redirect URIs
In Firebase Console, Google Cloud Console, and Dropbox App Console:
- Add your Vercel deployment URL (e.g., `https://your-app.vercel.app`) to **Authorized JavaScript origins** and **Authorized redirect URIs**.

`vercel.json` in the root directory manages SPA routing rewrites (`/(.*)` -> `/index.html`) and static WASM cache headers.


## Privacy & Security

- **Zero Photo Uploads:** Photos are ingested in client memory from cloud storage providers and are never uploaded to backend servers.
- **Local Client-Side ML:** Facial recognition inference runs entirely on the user's device via WebAssembly.
- **Mathematical Descriptors Only:** Only anonymous 128-dimensional floating point vectors are stored in Firestore.
- **Complete Account Deletion & Data Purging:** Purges associated Firestore events, photo references, and face descriptors, revokes OAuth connections, wipes client caches, deletes the Firebase Auth account, and resets consent flags.
- **Israeli Privacy Protection Law (Amendment 13) Compliant:** User consent controls, transparent policies, and zero third-party tracking.