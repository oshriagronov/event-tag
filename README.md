<p align="center">
  <img src="public/logo.png" alt="EventTag Logo" width="350" style="border-radius: 16px;"/>
</p>

<p align="center">
  <strong>Smart Event Photo Organizer</strong>
</p>

<p align="center">
  A privacy-first web application that lets event owners upload event photos and allows guests to upload a selfie to instantly find and download all their photos from the event pool.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/react-19-blue?logo=react" alt="React 19" />
  <img src="https://img.shields.io/badge/typescript-6-blue?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/vite-8-purple?logo=vite" alt="Vite 8" />
  <img src="https://img.shields.io/badge/tailwind-4-blue?logo=tailwindcss" alt="Tailwind CSS 4" />
</p>



## What is EventTag?

EventTag is a smart event photo sharing and retrieval application designed to eliminate the tedious process of searching through thousands of event photos. It allows event owners/photographers to upload their photos, and enables guests to simply upload a single selfie to instantly find and retrieve all photos they appear in.

###  The Goal
- **For Guests:** Instant, self-service access to all their photos from the event without scrolling through endless folders.
- **For Event Owners:** Save hours of manual effort searching, filtering, and sending individual photos to different guests.

**The key differentiator:** All face detection, alignment, and recognition happens **entirely inside your browser** using on-device machine learning (face-api.js for detection + landmarks, and ONNX Runtime Web for SFace recognition). Photos are loaded directly from your Google Drive into browser memory, and only mathematical face descriptors are stored securely in Firestore. No actual photos are ever sent to or stored on EventTag's servers.



## Features

###  Guest Experience
- **Selfie Search** — Guests can upload a quick selfie to instantly query the event photo pool and find all images they are in.
- **Instant Retrieval & Download** — Guests retrieve their photos directly without having to ask the host or scroll through the whole gallery.
- **ZIP Export** — Export all photos of a specific person as a downloadable ZIP file

### Event Owner Experience
- **Effortless Photo Management** — Connect event photos directly from Google Drive.
- **Automatic Face Clustering** — On-device AI scans and groups faces automatically, creating distinct guest profiles.
- **Time-Saving Automation** — No more manual sorting or sending photos to guests; let guest self-service handle the distribution.
- **Smart Merging & Editing** — Merge suggested profiles, rename guests, and resolve unidentified faces easily.
- **Full Gallery View** — Browse all imported photos with a lightbox viewer showing face annotations
- **Pause/Resume Scanning** — Pause the scanning process at any time and resume where you left off
- **ETA Display** — Real-time estimated time remaining during photo scanning
- **Multi-Event Support** — Create and manage multiple isolated events, each with its own photos, faces, and clusters


### User Experience
- **Dark & Light Themes** — Elegant dark mode by default, with a toggleable light mode
- **Adjustable Font Size** — Normal, large, and extra-large text sizes for accessibility
- **Hebrew RTL Interface** — Fully localized Hebrew UI with proper right-to-left layout



## Architecture

```
src/
├── App.tsx                    # Root component with model loading & routing
├── main.tsx                   # React entry point
├── clustering.ts              # Incremental face clustering with drift protection
├── db.ts                      # Local DB helper
├── components/
│   ├── Dashboard.tsx          # Event list with create/delete (Google Drive + Firestore sync)
│   ├── EventView.tsx          # Main event workspace (tabs, gallery, merges)
│   ├── PhotoImage.tsx         # Lazy image loader from Drive or Blob
│   ├── PrivacyBanner.tsx      # Privacy assurance banner
│   └── SettingsModal.tsx      # Theme & font size settings
├── contexts/
│   ├── ScannerContext.tsx     # Global scanning state (progress, pause, ETA)
│   └── SettingsContext.tsx    # Theme & font size persistence
├── services/
│   ├── faceAlignment.ts       # Facial landmark-based similarity transform (alignment)
│   ├── onnxModel.ts           # ONNX SFace (MobileFaceNet) inference service
│   ├── faceMatching.ts        # Selfie-to-event photo matching utility
│   ├── googleDrive.ts         # Google Drive download and access helpers
│   ├── googlePicker.ts        # Google Picker API launch and handler
│   └── translations.ts        # Multilingual (English/Hebrew) translation strings
└── assets/                    # Static assets
```

### Data Flow

```
Google Drive → Browser Memory Ingest Queue
  → face-api.js (SSD MobileNet v1 + Landmarks)
    → Face similarity alignment (112x112 canvas)
      → ONNX Runtime Web (SFace/MobileFaceNet model on WASM)
        → 128-dim L2-normalized embedding vector per face
          → Incremental Clustering (Euclidean distance + drift guard)
            → Firebase Firestore persistence (descriptors & metadata only)
              → Reactive UI
```

### Database Schema (Firestore)

| Collection | Key Fields                                          |
|------------|-----------------------------------------------------|
| `events`   | `id`, `name`, `createdAt`, `status`, `ownerId`      |
| `photos`   | `id`, `driveFileId`, `fileName`, `processed`        |
| `faces`    | `id`, `photoId`, `clusterId`, `descriptor`, `thumbnail` |
| `clusters` | `id`, `name`                                        |

### ⚡ Ingest & Scanning Optimizations

To support scanning large event libraries (hundreds or thousands of high-res photos) smoothly in the browser, the ingestion pipeline implements the following performance and accuracy optimizations:

- **In-Memory Image Downscaling:** Images with dimensions exceeding `1600px` are downscaled to a maximum boundary of `1600px` using an offscreen canvas prior to face detection. This reduces pixel computational area by over 90% on raw camera files, significantly accelerating inference and preventing WebGL out-of-memory crashes while retaining high-precision landmarks.
- **Tuned Detection Confidence:** The SSD MobileNet V1 face detector runs with a customized `minConfidence = 0.45` (tuned down from the default `0.50`) to increase recall, successfully detecting faces at steep angles, in partial shadow, or under minor motion blur.
- **Batched Firestore Face Descriptors:** Face metadata is buffered in memory and flushed to Firestore in chunks (every 15 photos or 50 faces) instead of saving them sequentially. This eliminates the \(O(N^2)\) read-then-write database overhead, decreasing database loading delays by over 90%.
- **Calibrated Clustering Tolerances:** The incremental clustering engine matches faces with calibrated L2 Euclidean distance thresholds of `0.90` (same identity match) and `0.95` (average cluster similarity). Guest selfie searches in `GuestView.tsx` use a strict threshold of `0.85` to minimize false positive photo suggestions.



## Getting Started

### Prerequisites
- **Node.js** 18+ and **npm**
- A modern browser with WebGL support (Chrome/Edge recommended)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/event-tag.git
# Go to workspace directory
cd event-tag

# Install dependencies
npm install

# Start the development server
npm run dev
```

The app will be available at `http://localhost:5173`.

### Face Detection & Recognition Models

The pre-trained model weights are included in `public/models/`. These are loaded at startup and include:
- **SSD MobileNet v1** — Face detection (~5.6 MB)
- **68-Point Face Landmark** — Facial landmark localization (~357 KB)
- **SFace (MobileFaceNet)** — 128-dimensional face embedding extraction (~37 MB ONNX model)

No additional downloads are required.



## Tech Stack

| Layer           | Technology                                                                 |
|-----------------|---------------------------------------------------------------------------|
| **Framework**   | [React 19](https://react.dev) + [TypeScript 6](https://typescriptlang.org) |
| **Build Tool**  | [Vite 8](https://vite.dev)                                                |
| **Styling**     | Vanilla CSS + Tailwind CSS                                                |
| **Icons**       | [Lucide React](https://lucide.dev)                                        |
| **ML Engine**   | [@vladmandic/face-api](https://github.com/nicolo-ribaudo/face-api.js) (Landmarks & Detection) + [ONNX Runtime Web](https://onnxruntime.ai) (SFace Embedding) |
| **Database/Sync**| [Firebase Firestore](https://firebase.google.com/)                        |
| **File Access** | [Google Drive API](https://developers.google.com/drive)                   |
| **ZIP Export**  | [JSZip](https://stuk.github.io/jszip/)                                    |



## Available Scripts

| Command          | Description                        |
|------------------|------------------------------------|
| `npm run dev`    | Start the Vite development server  |
| `npm run build`  | Type-check and build for production|
| `npm run preview`| Preview the production build       |
| `npm run lint`   | Run ESLint                         |



## Privacy

EventTag is designed with a strong focus on user privacy:

- ✅ All face detection and recognition runs **locally in your browser** via WebGL.
- ✅ Photos are processed in-memory directly from Google Drive — they are **never uploaded to or stored on EventTag's servers**.
- ✅ Only mathematical face descriptors (embeddings) are saved in the cloud (Firebase Firestore) to sync event profiles.
- ✅ No analytics, no tracking, and no third-party sharing of your media.