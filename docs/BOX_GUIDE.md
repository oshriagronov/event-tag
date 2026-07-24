# Box Developer & Verification Guide — GuestID (EventTag)

This guide details everything a developer needs to know to set up, configure, and verify **Box** as a cloud storage provider for GuestID.

---

## 1. Overview & Architecture

Box is an enterprise-grade cloud content platform. GuestID uses Box REST API v2.0 with client-side OAuth 2.0 Implicit Grant to read photos directly into browser memory for local ML face-sorting without sending image files to backend servers.

- **Base API URL**: `https://api.box.com/2.0`
- **Authentication URL**: `https://account.box.com/api/oauth2/authorize`
- **OAuth Token URL**: `https://api.box.com/oauth2/token`
- **OAuth Flow**: Standard OAuth 2.0 Authorization Code (`response_type=code`) with automatic token exchange & refresh token renewal

---

## 2. Developer Setup Step-by-Step

### Step 1: Create a Box Developer Account & App
1. Log in to the [Box Developer Console](https://account.box.com/developers/console).
2. Click **Create New App**.
3. Select **Custom App** -> Method of Authentication: **User Authentication (OAuth 2.0)**.
4. Set App Name: `GuestID` (or your application name).

### Step 2: Configure Application Settings & Scopes
In your app's **Configuration** tab:
1. **OAuth 2.0 Redirect URIs**: Add your redirect URLs:
   - Development: `http://localhost:5173/dashboard`
   - Production: `https://your-domain.com/dashboard`
2. **Application Scopes**:
   - Under **Content Actions**, check **Read all files and folders stored in Box**.
3. **Allowed Origin CORS Domains**:
   - Add `http://localhost:5173` and `https://your-domain.com` under **CORS Domains** to allow client-side token exchange and REST API calls.

### Step 3: Environment Variables
Copy your **Client ID** (and optionally **Client Secret** if configured) from the Box Developer Console configuration page.

Add the credentials to your `.env` file:
```env
VITE_BOX_CLIENT_ID=your_box_client_id_here
VITE_BOX_CLIENT_SECRET=your_box_client_secret_if_applicable
```

---

## 3. API Endpoints & Operations Used

| Action | Endpoint | Description |
| :--- | :--- | :--- |
| **OAuth Authorization** | `https://account.box.com/api/oauth2/authorize` | Initiates OAuth grant returning `code` authorization code |
| **OAuth Token Exchange** | `POST https://api.box.com/oauth2/token` | Exchanges authorization code / refresh token for `access_token` |
| **User Info / Token Check** | `GET https://api.box.com/2.0/users/me` | Validates access token and returns user profile |
| **List Folder Items** | `GET https://api.box.com/2.0/folders/{id}/items` | Lists subfolders and files in a directory |
| **Download Photo Blob** | `GET https://api.box.com/2.0/files/{id}/content` | Follows 302 redirect to stream raw image binary into memory |
| **Download Thumbnail** | `GET https://api.box.com/2.0/files/{id}/thumbnail.png?min_height=400&min_width=400` | Fetches 400x400 PNG thumbnail for photo grid |
| **Public Shared Link** | `POST https://api.box.com/2.0/files/{id}/shared_link` | Generates a public shared link for guest photo retrieval |

---

## 4. App Verification & Production Approval Process

### 1. Internal & Single-Enterprise Deployment
For development or single-enterprise deployment:
- No global verification is required.
- Enterprise Admins can authorize custom apps directly in the **Box Admin Console** under *Apps -> Custom Apps Manager* by entering the app's Client ID.

### 2. Public Multi-Tenant App Gallery Verification
To allow any public Box user to connect their account without Enterprise Admin manual authorization:
1. Submit your application to the **Box App Gallery**.
2. **Review Requirements**:
   - **HTTPS Security**: All OAuth redirect URIs and privacy links must use valid HTTPS.
   - **Terms & Privacy Policies**: Provide links to verified Terms of Service and Privacy Policy pages.
   - **Branding Assets**: Upload a high-resolution app icon (1024x1024 PNG) and promotional screenshots.
   - **Security Questionnaire**: Complete Box's app security review form detailing data access. Highlight that GuestID processes all photo binaries locally in browser memory and does not upload or retain photos on external servers.
