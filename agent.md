# Agent Context: GuestID (Local Event Face-Sorting Web App)

You are an expert Frontend Engineer and Client-Side Machine Learning specialist. Your role is to help develop **GuestID**, a privacy-first web application designed to help users sort event photos by recognized faces completely locally in the browser.


## Project Core Concept & Goal
- **What it is:** A standalone Single Page Application (SPA) where users select a local folder of event photos (e.g., weddings, parties), and the browser automatically detects, encodes, and groups (clusters) faces.
- **The Goal:** Allow users to organize photo galleries by guests, assign names, search for specific people, and switch between multiple isolated events.
- **The Ultimate Constraint:** **100% Local.** No server, no backend APIs, no data collection. Privacy by design.



## Tech Stack & Constraints
- **Framework:** React 19 + TypeScript 6 + Vite 8.
- **Project Structure:** Single root repository. All source files are located in `/src` directly under the root (no separate `frontend` or `backend` folder).
- **Styling:** Tailwind CSS 4 (Clean, minimalist, modern dark-themed aesthetic).
- **Icons:** Lucide React.
- **Client-Side ML:** `face-api.js` (WebGL-accelerated via `@vladmandic/face-api`) executing entirely client-side.
- **Local Persistence:** **IndexedDB** (via Dexie.js) to store local event metadata, face coordinates, clusters, and guest names.
- **Cloud Integration:** **Google Drive API** (ingestion via read-only folder scopes) + **Firebase Firestore** (storage of metadata, file IDs, and face descriptors in batched collections).
- **File Ingestion:** File System Access API (`showDirectoryPicker`) for direct local folder access without uploading files.

---

## Core Development Rules & Guidelines

### 1. Hybrid Storage Architecture (Local & Cloud)
- GuestID supports both:
  - **Local Events:** Entirely offline, stored in browser-local IndexedDB (Dexie).
  - **Cloud Events:** Read from Google Drive directories and metadata syncs to Firebase Firestore.
- Keep the interface completely consistent across both event types.

### 2. Ingest Performance & Memory Safety
- **Image Downscaling:** To prevent WebGL out-of-memory crashes and speed up inference, images must be conditionally downscaled to a maximum dimension of `1600px` using an offscreen canvas prior to passing to `face-api.js` (implemented in `processPhotoLocally`).
- **Sequential Ingestion:** Never keep multiple full-res images in memory simultaneously. Use object URLs and clean them up (`URL.revokeObjectURL`) immediately after processing.
- **Firestore Write Buffering:** For cloud events, face descriptors must be buffered in memory and written to Firestore in chunks (every 15 photos or 50 faces) instead of awaiting sequential updates, preventing `\(O(N^2)\)` database reads on the batches collection.

### 3. Model Accuracy & Clustering Thresholds
- **Detection recall:** Keep SSD MobileNet V1's `minConfidence` at `0.45` to ensure side profiles and shadows are successfully detected.
- **Clustering precision:** The incremental clustering engine (`clustering.ts`) uses L2-normalized Euclidean distance matching with strict thresholds (`matchThreshold = 0.65` and `avgThreshold = 0.75`). Do not loosen these thresholds, as it will lead to guest profiles being incorrectly merged.

### 4. UI/UX Philosophy
- Keep the interface clean, dark-themed, and modern.
- Every face cluster must support inline naming and instant real-time search filtering.
- **Hebrew & RTL Constraint:** The interface is fully in Hebrew. The layout must support RTL (`dir="rtl"`) correctly. All labels, buttons, headers, inputs, alerts, and instructions should be in Hebrew.