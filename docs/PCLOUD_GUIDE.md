# pCloud Developer & Verification Guide — EventTag

This guide details everything a developer needs to know to set up, configure, and verify **pCloud** as a cloud storage provider for EventTag.

---

## 1. Overview & Architecture

pCloud provides high-performance cloud storage with regional data centers in the **United States (US)** and **Europe (EU)**. EventTag uses pCloud's client-side OAuth 2.0 Implicit Grant flow to read photos directly into browser memory for local ML face recognition.

- **US Base API URL**: `https://api.pcloud.com`
- **EU Base API URL**: `https://eapi.pcloud.com`
- **Authentication URL (US)**: `https://my.pcloud.com/oauth2/authorize`
- **Authentication URL (EU)**: `https://e-my.pcloud.com/oauth2/authorize`
- **OAuth Flow**: Implicit Grant (`response_type=token`)

---

## 2. Developer Setup Step-by-Step

### Step 1: Create a pCloud Developer Account & App
1. Go to the [pCloud Developer Console](https://docs.pcloud.com/) and sign in to your pCloud account.
2. Navigate to **My Apps** -> **Create New App**.
3. Fill in the application details:
   - **App Name**: `EventTag` (or your event application name).
   - **App Type**: Select **Full Access** or **Folder Access**.
4. Set Redirect URIs:
   - Development: `http://localhost:5173/dashboard`
   - Production: `https://your-domain.com/dashboard`
5. Save your application settings.

### Step 2: Note API Credentials & Environment Variables
Copy your **Client ID** (App Key) from the pCloud developer dashboard.

Add the credential to your `.env` file:
```env
VITE_PCLOUD_CLIENT_ID=your_pcloud_client_id_here
```

### Step 3: Multi-Region Datacenter Handling (US vs EU)
pCloud automatically returns a `locationid` parameter upon OAuth redirect completion:
- `locationid = 1` -> US Datacenter (`api.pcloud.com`)
- `locationid = 2` -> EU Datacenter (`eapi.pcloud.com`)

EventTag automatically persists `pcloud_location_id` in `localStorage` and routes all API calls dynamically to the correct regional endpoint.

---

## 3. API Endpoints & Operations Used

| Action | Endpoint | Description |
| :--- | :--- | :--- |
| **OAuth Authorization** | `https://my.pcloud.com/oauth2/authorize` | Initiates client-side OAuth grant returning `access_token` and `locationid` |
| **User Info / Token Check** | `GET /userinfo` | Verifies access token validity and account email |
| **List Folders** | `GET /listfolder?folderid={id}` | Fetches subfolders for directory picker |
| **List Photos** | `GET /listfolder?folderid={id}` | Fetches image files (`.jpg`, `.jpeg`, `.png`, `.webp`, `.heic`) |
| **Photo Blob Download** | `GET /getfilelink?fileid={id}` | Generates host and path URL to stream raw image binary into browser memory |
| **Thumbnail Download** | `GET /getthumblink?fileid={id}&size=400x400` | Streams optimized 400x400 thumbnail for photo grid |
| **Public Shared Link** | `GET /createfilepublink?fileid={id}` | Creates public shareable link for guest photo recovery |

---

## 4. App Verification & Production Approval Process

### Is Verification Required?
**No.** pCloud does **not** enforce a mandatory app verification, domain validation, or video submission process for standard API integrations.

### Key Production Guidelines:
- **Instant Activation**: pCloud apps created in the developer console are active immediately for public user authentication without quota restrictions or dev test user whitelisting.
- **Rate Limits**: Standard endpoints allow approximately 1,000 API requests per minute per IP address/token.
- **High-Volume Support**: If your application reaches enterprise volume, submit a support inquiry via the pCloud Developer Portal to request custom API rate limit expansions.
