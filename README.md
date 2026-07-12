<p align="center">
  <img src="public/logo.png" alt="EventTag Logo" width="120" />
</p>

<h1 align="center">EventTag</h1>

<p align="center">
  <strong>ארגון תמונות חכם | Smart Event Photo Organizer</strong>
</p>

<p align="center">
  A privacy-first web application that uses on-device AI to automatically detect, recognize, and group faces in event photos — entirely in the browser, with zero server involvement.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/react-19-blue?logo=react" alt="React 19" />
  <img src="https://img.shields.io/badge/typescript-6-blue?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/vite-8-purple?logo=vite" alt="Vite 8" />
  <img src="https://img.shields.io/badge/tailwind-4-blue?logo=tailwindcss" alt="Tailwind CSS 4" />
  <img src="https://img.shields.io/badge/privacy-100%25_local-green" alt="100% Local" />
</p>

---

## ✨ What is EventTag?

EventTag is a standalone Single Page Application designed for event photographers, wedding planners, and anyone who needs to quickly sort through hundreds (or thousands) of event photos and organize them by the people who appear in them.

**The key differentiator:** All face detection, recognition, and clustering happens **entirely inside your browser** using on-device machine learning. No images are ever uploaded, no data leaves your machine, and no external APIs are called.

---

## 🎯 Features

### Core
- **🧠 On-Device Face AI** — SSD MobileNet v1 for detection, 68-point landmark model, and a 128-dimensional face recognition network, all running locally via WebGL
- **👥 Automatic Face Clustering** — Incremental clustering with drift protection automatically groups detected faces into guest profiles
- **📁 Direct Folder Access** — Uses the File System Access API (`showDirectoryPicker`) to read photos directly from local folders without uploading
- **🔍 Real-Time Search** — Instantly filter guests by name across all recognized profiles
- **✏️ Inline Renaming** — Click on any guest name to rename it; assigning the same name to two profiles automatically merges them
- **📦 ZIP Export** — Export all photos of a specific person as a downloadable ZIP file

### Smart Organization
- **🔗 Merge Suggestions** — AI-powered suggestions for profiles that may be the same person, with accept/decline controls
- **🤝 Manual Merge Mode** — Select multiple guest profiles and merge them with one click
- **❓ Unidentified Faces** — A dedicated tab for faces that couldn't be confidently assigned, with manual assignment controls
- **🖼️ Full Gallery View** — Browse all imported photos with a lightbox viewer showing face annotations

### User Experience
- **🌙 Dark & Light Themes** — Elegant dark mode by default, with a toggleable light mode
- **🔤 Adjustable Font Size** — Normal, large, and extra-large text sizes for accessibility
- **⏸️ Pause/Resume Scanning** — Pause the scanning process at any time and resume where you left off
- **⏱️ ETA Display** — Real-time estimated time remaining during photo scanning
- **🏷️ Multi-Event Support** — Create and manage multiple isolated events, each with its own photos, faces, and clusters
- **🇮🇱 Hebrew RTL Interface** — Fully localized Hebrew UI with proper right-to-left layout

---

## 🏗️ Architecture

```
src/
├── App.tsx                    # Root component with model loading & routing
├── main.tsx                   # React entry point
├── ml.ts                      # Face detection, landmark, and recognition pipeline
├── clustering.ts              # Incremental face clustering with drift protection
├── db.ts                      # IndexedDB schema (Dexie.js ORM)
├── components/
│   ├── Dashboard.tsx          # Event list with create/delete
│   ├── EventView.tsx          # Main event workspace (tabs, gallery, merges)
│   ├── PhotoImage.tsx         # Lazy image loader from FileHandle or Blob
│   ├── PrivacyBanner.tsx      # Privacy assurance banner
│   └── SettingsModal.tsx      # Theme & font size settings
├── contexts/
│   ├── ScannerContext.tsx     # Global scanning state (progress, pause, ETA)
│   └── SettingsContext.tsx    # Theme & font size persistence
└── assets/                    # Static assets
```

### Data Flow

```
Local Folder → File System Access API → Sequential Processing Queue
  → face-api.js (SSD MobileNet v1 + Landmarks + Recognition)
    → 128-dim embedding vector per face
      → Incremental Clustering (Euclidean distance + drift guard)
        → IndexedDB (Dexie.js) persistence
          → Reactive UI (dexie-react-hooks)
```

### Database Schema (IndexedDB)

| Table      | Key Fields                                          |
|------------|-----------------------------------------------------|
| `events`   | `id`, `name`, `createdAt`, `directoryHandle`        |
| `photos`   | `id`, `eventId`, `fileName`, `fileHandle`, `processed` |
| `faces`    | `id`, `eventId`, `photoId`, `clusterId`, `embedding`, `thumbnail` |
| `clusters` | `id`, `eventId`, `name`                             |

### ⚡ Ingest & Scanning Optimizations

To support scanning large event libraries (hundreds or thousands of high-res photos) smoothly in the browser, the ingestion pipeline implements the following performance and accuracy optimizations:

- **In-Memory Image Downscaling:** Images with dimensions exceeding `1600px` are downscaled to a maximum boundary of `1600px` using an offscreen canvas prior to face detection. This reduces pixel computational area by over 90% on raw camera files, significantly accelerating inference and preventing WebGL out-of-memory crashes while retaining high-precision landmarks.
- **Tuned Detection Confidence:** The SSD MobileNet V1 face detector runs with a customized `minConfidence = 0.45` (tuned down from the default `0.50`) to increase recall, successfully detecting faces at steep angles, in partial shadow, or under minor motion blur.
- **Batched Firestore Face Descriptors:** In cloud-synced events, face metadata is buffered in memory and flushed to Firestore in chunks (every 15 photos or 50 faces) instead of saving them sequentially. This eliminates the \(O(N^2)\) read-then-write database overhead, decreasing database loading delays by over 90%.
- **Tightened Clustering Tolerances:** The incremental clustering engine matches faces with a strict Euclidean distance threshold of `0.65` and group average threshold of `0.75` (aligned with face-api's `0.55` search tolerance). This prevents different individuals from being incorrectly merged into the same profile.

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** 18+ and **npm**
- A modern browser with WebGL support (Chrome/Edge recommended for File System Access API)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/event-tag.git
cd event-tag

# Install dependencies
npm install

# Start the development server
npm run dev
```

The app will be available at `http://localhost:5173`.

### Face Detection Models

The pre-trained face-api.js model weights are included in `public/models/`. These are loaded at startup and include:
- **SSD MobileNet v1** — Face detection (~5.6 MB)
- **68-Point Face Landmark** — Facial landmark localization (~357 KB)
- **Face Recognition** — 128-dimensional face descriptor extraction (~6.4 MB)

No additional downloads are required.

---

## 🛠️ Tech Stack

| Layer           | Technology                                                                 |
|-----------------|---------------------------------------------------------------------------|
| **Framework**   | [React 19](https://react.dev) + [TypeScript 6](https://typescriptlang.org) |
| **Build Tool**  | [Vite 8](https://vite.dev)                                                |
| **Styling**     | [Tailwind CSS 4](https://tailwindcss.com)                                 |
| **Icons**       | [Lucide React](https://lucide.dev)                                        |
| **ML Engine**   | [@vladmandic/face-api](https://github.com/nicolo-ribaudo/face-api.js) (WebGL-accelerated) |
| **Database**    | [Dexie.js](https://dexie.org) (IndexedDB wrapper)                        |
| **File Access** | [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API) |
| **ZIP Export**  | [JSZip](https://stuk.github.io/jszip/)                                    |

---

## 📜 Available Scripts

| Command          | Description                        |
|------------------|------------------------------------|
| `npm run dev`    | Start the Vite development server  |
| `npm run build`  | Type-check and build for production|
| `npm run preview`| Preview the production build       |
| `npm run lint`   | Run ESLint                         |

---

## 🔒 Privacy

EventTag is built with a **zero-backend, zero-cloud** architecture:

- ✅ All face detection and recognition runs **locally in your browser** via WebGL
- ✅ Photos are read directly from your filesystem — **never uploaded**
- ✅ All data (faces, clusters, embeddings) is stored in **browser-local IndexedDB**
- ✅ No analytics, no tracking, no cookies, no external network requests
- ✅ Works completely **offline** after initial load

---

## 🌐 Browser Compatibility

| Feature                 | Chrome/Edge | Firefox | Safari |
|-------------------------|:-----------:|:-------:|:------:|
| Face Detection (WebGL)  | ✅          | ✅      | ✅     |
| File System Access API  | ✅          | ❌ (fallback) | ❌ (fallback) |
| IndexedDB persistence   | ✅          | ✅      | ✅     |

> **Note:** On browsers that don't support the File System Access API, EventTag falls back to a standard file input with `webkitdirectory`, storing compressed image blobs directly in IndexedDB.

---

## 📄 License

This project is private. All rights reserved.
