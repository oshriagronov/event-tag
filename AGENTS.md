# Agent Context: GuestID (Cloud Event Face-Sorting Web App)

You are an expert Frontend Engineer and Client-Side Machine Learning specialist. Your role is to help develop **GuestID**, a privacy-first web application designed to help users sort event photos by recognized faces using images loaded from Google Drive, with face descriptors synced securely in the cloud.


## Project Core Concept & Goal
- **What it is:** A web application where users select event photos from Google Drive using the native Google Picker (`drive.file` scope), and the browser automatically detects, encodes, and groups (clusters) faces.
- **The Goal:** Allow users to organize photo galleries by guests, assign names, search for specific people, and manage multiple events.
- **The Ultimate Constraint:** **Cloud Ingest with Local Processing.** Images are read directly from Google Drive into browser memory, all face detection and recognition happens locally in the user's browser, and only mathematical face descriptors are stored in Firebase Firestore. No actual photo files are uploaded to or stored on our servers.


- **Tech Stack & Constraints**
- **Framework:** React 19 + TypeScript 6 + Vite 8.
- **Project Structure:** Single root repository. All source files are located in `/src` directly under the root.
- **Styling:** Vanilla CSS + Tailwind CSS (Clean, minimalist, modern dark-themed aesthetic).
- **Icons:** Lucide React.
- **Client-Side ML:** Face detection & landmark extraction via `@vladmandic/face-api` (SSD MobileNet V1 + 68-point landmarks) + Face recognition via **ONNX Runtime Web** executing an optimized **SFace** (MobileFaceNet backbone) model on WASM.
- **Cloud Integration:** **Google Picker API** (ingestion via the non-restricted `drive.file` scope, avoiding restricted-scope CASA audits) + **Firebase Firestore** (storage of metadata, file IDs, and face descriptors in batched collections).

---

## Core Development Rules & Guidelines

### 1. Storage Architecture (Cloud-Only)
- GuestID supports **Cloud Events only**.
- Local events (browser-local IndexedDB offline-only) are not supported/offered on the dashboard.
- All metadata, image lists, and face clusters sync to Firebase Firestore.

### 2. Ingest Performance & Memory Safety
- **Image Downscaling:** To prevent WebGL out-of-memory crashes and speed up inference, images must be conditionally downscaled to a maximum dimension of `1600px` using an offscreen canvas prior to passing to `face-api.js` (implemented in `processPhotoLocally`).
- **Sequential Ingestion:** Never keep multiple full-res images in memory simultaneously. Clean up object URLs immediately after processing.
- **Firestore Write Buffering:** Face descriptors must be buffered in memory and written to Firestore in chunks (every 15 photos or 50 faces) instead of awaiting sequential updates, preventing database write performance degradation.

### 3. Model Accuracy & Clustering Thresholds
- **Detection recall:** Keep SSD MobileNet V1's `minConfidence` at `0.45` to ensure side profiles and shadows are successfully detected.
- **Clustering precision:** The incremental clustering engine (`clustering.ts`) uses L2-normalized Euclidean distance matching with calibrated thresholds (`matchThreshold = 0.90` and `avgThreshold = 0.95`). Guest selfie matches in `GuestView.tsx` use a strict threshold of `0.85` to prevent false positives.

### 4. UI/UX Philosophy
- Keep the interface clean, dark-themed, and modern.
- Every face cluster must support inline naming and instant real-time search filtering.
- **Hebrew & RTL Constraint:** The interface is fully in Hebrew. The layout must support RTL (`dir="rtl"`) correctly. All labels, buttons, headers, inputs, alerts, and instructions should be in Hebrew.