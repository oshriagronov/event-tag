<p align="center">
  <img src="public/logo.png" alt="EventTag Logo" width="300" style="border-radius: 16px;"/>
</p>

<p align="center">
  <strong>Private Selfie-Based Event Photo Sharing & Retrieval Platform</strong>
</p>

<p align="center">
  A privacy-first web application that lets event owners scan cloud photos and enables guests to retrieve their photos with a single selfie, making event photo sharing seamless, instant, and private.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/react-19-blue?logo=react" alt="React 19" />
  <img src="https://img.shields.io/badge/typescript-6-blue?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/vite-8-purple?logo=vite" alt="Vite 8" />
  <img src="https://img.shields.io/badge/tailwind-4-blue?logo=tailwindcss" alt="Tailwind CSS 4" />
  <img src="https://img.shields.io/badge/firebase-12-orange?logo=firebase" alt="Firebase 12" />
</p>



## What is EventTag?

EventTag is a privacy-first event photo sharing and retrieval platform designed to make sharing photos between event owners and guests as effortless and private as possible. Event owners connect cloud photo folders directly from **Dropbox** or **Box** (with **pCloud**, **Google Drive**, and **OneDrive** coming soon) for browser-based scanning, and guests scan a share link / QR code with a selfie to instantly find and download all photos they appear in.

### 🎯 The Goal
- **For Guests:** Instant, private, self-service retrieval of all their event photos via a simple selfie scan.
- **For Event Owners:** Effortless photo sharing with guests while keeping user privacy paramount and avoiding manual photo distribution.

**Privacy-First & On-Device AI:** All face detection, alignment, and 128-dimensional embedding extraction happen **100% locally in the user's browser** using WebAssembly (ONNX Runtime Web with SFace + face-api.js). Photos are ingested in-memory from cloud storage; **no photo files are ever uploaded to or saved on backend servers**. Only mathematical face vectors and metadata are stored in Firebase Firestore.



## Features

### 📸 Guest Experience
- **Selfie Search** — Guests capture or upload a selfie to instantly query event photos.
- **Strict Face Matching** — Calibrated 0.85 vector distance threshold prevents false positives.
- **Instant Photo Retrieval & Downloads** — View full-resolution photos directly from cloud storage and download them one by one.
- **QR Code & Share Links** — Instant access via event QR code or custom share URL (`qrcode.react`).

### 🛠️ Event Owner Experience
- **Multi-Cloud Storage Connection** — Connect photo libraries directly from **Dropbox** and **Box** (pCloud, Google Drive & OneDrive marked as "Soon").
- **Developer & Verification Guides** — Step-by-step documentation for developer setup and API verification for [pCloud](docs/PCLOUD_GUIDE.md) and [Box](docs/BOX_GUIDE.md).
- **Automatic Face Clustering** — On-device AI groups recognized faces automatically into distinct guest profiles.
- **Live Scanning Queue & Parallel Ingestion** — Scan multiple events concurrently with independent pause/stop controls per event, real-time ETA display, and performance warning alerts.
- **Multi-Event Management** — Isolated dashboard for creating, sharing, and deleting multiple events.


## Architecture

```
docs/
├── PCLOUD_GUIDE.md             # Developer setup & verification guide for pCloud
└── BOX_GUIDE.md                # Developer setup & verification guide for Box
src/
├── App.tsx                     # Root router, providers, and layout structure
├── main.tsx                    # React entry point
├── index.css                   # Global CSS & Tailwind CSS 4 setup
├── firebase.ts                 # Firebase initialization (Auth & Firestore)
├── components/
│   ├── AccessibilityWidget.tsx  # IS 5568 / WCAG 2.0 AA accessibility toolbar
│   ├── BoxIcon.tsx             # Official Box brand logo icon component
│   ├── CookieBanner.tsx        # Amendment 13 Privacy & Cookie Consent banner
│   ├── Dashboard.tsx           # Multi-event management & cloud provider connection
│   ├── DropboxIcon.tsx         # Official Dropbox brand logo icon component
│   ├── EventView.tsx           # Event workspace, gallery, scanning progress & face clusters
│   ├── FolderPicker.tsx        # Cloud folder selector modal
│   ├── Footer.tsx              # Footer with legal links & compliance info
│   ├── GoogleIcon.tsx          # Reusable official Google branding asset component
│   ├── GuestView.tsx           # Guest selfie search, face matching & photo gallery
│   ├── LandingPage.tsx         # Modern landing page with hero, features, FAQ & CTA
│   ├── LegalPage.tsx           # Terms of Service, Privacy Policy & Accessibility Statement
│   ├── PCloudIcon.tsx          # Official pCloud brand logo icon component
│   ├── PreferencesModal.tsx    # Granular privacy consent settings modal
│   ├── PrivacyBanner.tsx       # Ingest privacy assurance indicator
│   ├── PrivacyPage.tsx         # Detailed privacy compliance page
│   ├── SelfieCapture.tsx       # Live camera / file selfie capture tool
│   ├── SettingsModal.tsx       # Theme & font size preferences modal
│   ├── ShareModal.tsx          # Multi-platform share menu modal (WhatsApp, Telegram, Email, FB, X, QR)
│   └── SkipLink.tsx            # Accessible skip-to-main-content link
├── contexts/
│   ├── AuthContext.tsx         # Firebase Auth user session & cloud OAuth tokens
│   ├── ConsentContext.tsx      # Privacy Protection Law consent state
│   ├── ScannerContext.tsx      # Global scanning state (progress, pause, ETA)
│   └── SettingsContext.tsx     # Visual preferences context
├── services/
│   ├── box.ts                  # Box REST API v2.0 integration
│   ├── cloudProviders.ts       # Unified cloud provider abstraction layer
│   ├── dropbox.ts              # Dropbox Chooser & file streaming integration
│   ├── faceAlignment.ts        # Facial landmark alignment (112x112 similarity transform)
│   ├── faceMatching.ts         # Face vector distance & similarity matching
│   ├── firestore.ts            # Firestore CRUD & batched descriptor writer
│   ├── google.ts               # Google Drive API REST v3 integration
│   ├── onnxModel.ts            # ONNX Runtime Web (SFace WASM embedding extractor)
│   ├── pcloud.ts               # pCloud multi-region REST API integration
│   └── translations.ts         # Hebrew/English localization strings
└── utils/
    └── shareUtils.ts           # Web Share API & fallback share link helpers
```

### Data Flow

```
Cloud Storage (Google Drive / Dropbox)
  → In-Memory Image Fetch & Downscale (Max 1600px offscreen canvas)
    → @vladmandic/face-api (SSD MobileNet V1 Detection + 68 Landmarks)
      → Landmark Alignment (112x112 matrix transform)
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



## ⚡ Performance & Scanning Optimizations

1. **Offscreen Canvas Downscaling:** High-resolution photos are scaled to a maximum boundary of `1600px` before inference, reducing WebGL memory usage by over 90% and preventing browser out-of-memory crashes.
2. **Tuned Detection Recall:** SSD MobileNet V1 runs with `minConfidence = 0.45` to reliably detect faces under challenging event lighting, angles, and movement.
3. **Batched Database Writes:** Face vectors are buffered in memory and flushed to Firestore in chunks (15 photos or 50 faces), optimizing database performance.
4. **On-Device ONNX WASM Execution:** Face embeddings are extracted locally using SFace on ONNX Runtime Web with WebAssembly support.

---

## Getting Started

### Prerequisites
- **Node.js** 18+ and **npm**
- Modern Web Browser with WebGL / WASM support (Chrome, Edge, Safari, Firefox)

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
| `npm run build` | Runs TypeScript check (`tsc -b`) and Vite production bundle |
| `npm run preview` | Previews production build locally |
| `npm run lint` | Runs ESLint analysis across codebase |

---

## 🚀 Deployment (Vercel)

EventTag is optimized for zero-config deployment on **Vercel**:

### 1. Connect Repository
1. Import the project repository into your [Vercel Dashboard](https://vercel.com).
2. Set Framework Preset: **Vite**.
3. Output Directory: `dist`.

### 2. Configure Environment Variables
In Vercel Project Settings → **Environment Variables**, add:
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
- Add your Vercel deployment URL (e.g. `https://your-app.vercel.app`) to **Authorized JavaScript origins** and **Authorized redirect URIs**.

`vercel.json` is included in the project root to automatically handle SPA single-page routing rewrites and static WASM model cache headers.



## 🔒 Privacy & Security

EventTag is built around strict data privacy and regulatory compliance:

- **Zero Photo Uploads:** Photos are processed in client memory from Google Drive or Dropbox and are **never uploaded to backend servers**.
- **Local ML Processing:** All facial recognition runs on the client device via WASM and WebGL.
- **Mathematical Descriptors Only:** Only anonymous 128-dimensional floating point vectors are stored in Firestore.
- **Complete Account Deletion:** Deleting an account purges all associated Firestore events, photo references, and face descriptors, cancels active scans, disconnects cloud storage OAuth tokens, wipes local caches, deletes the Firebase Auth account, and resets privacy consent (`resetConsent()`) so the consent screen is presented on the next visit/login.
- **Israeli Privacy Protection Law (Amendment 13) Compliant:** User consent controls, transparent data policies, and no third-party tracking.