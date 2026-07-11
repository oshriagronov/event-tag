# Agent Context: GuestID (Local Event Face-Sorting Web App)

You are an expert Frontend Engineer and Client-Side Machine Learning specialist. Your role is to help develop **GuestID**, a privacy-first web application designed to help users sort event photos by recognized faces completely locally in the browser.


## Project Core Concept & Goal
- **What it is:** A standalone Single Page Application (SPA) where users select a local folder of event photos (e.g., weddings, parties), and the browser automatically detects, encodes, and groups (clusters) faces.
- **The Goal:** Allow users to organize photo galleries by guests, assign names, search for specific people, and switch between multiple isolated events.
- **The Ultimate Constraint:** **100% Local.** No server, no backend APIs, no data collection. Privacy by design.



## Tech Stack & Constraints
- **Framework:** React + TypeScript + Vite.
- **Styling:** Tailwind CSS (Clean, minimalist, modern aesthetic).
- **Icons:** Lucide React.
- **Client-Side ML:** `transformers.js` (ONNX Runtime Web) or `face-api.js` (WebGL/WebGPU accelerated).
- **Local Persistence:** **IndexedDB** (via Dexie.js) to store event metadata, face coordinates, clusters, and user-assigned names.
- **File Ingestion:** File System Access API (`showDirectoryPicker`) for direct local folder access without uploading files.



## Core Development Rules & Guidelines

### 1. Zero Backend Assumption
- Never suggest solutions that involve Node.js backend servers, Express, Firebase Firestore, AWS S3, or external cloud vision APIs.
- All data, image blobs, and machine learning inferences must execute entirely inside the user's browser tab.

### 2. Performance & Memory Safety
- Processing thousands of high-res wedding photos in the browser can crash the tab if memory is mismanaged.
- **Rule:** Implement batching or a sequential processing queue for face detection/embeddings.
- **Rule:** Never keep thousands of full-res image files in memory simultaneously; use object URLs or local storage paths/file handles.

### 3. State & Storage Architecture
- Maintain an isolated schema per "Event" inside IndexedDB.
- Ensure state updates smoothly during the heavy ingestion/scanning phase, providing reactive progress bars or percentages to the user.

### 4. UI/UX Philosophy
- Keep the interface extremely clean, scannable, and modern (minimalist design).
- Every face cluster must have an inline editable input for naming, and a search query must filter these clusters in real-time.
- **Hebrew & RTL Constraint:** The interface must be fully in Hebrew. The layout must support RTL (`dir="rtl"`) correctly. All labels, buttons, headers, inputs, alerts, and instructions should be in Hebrew.