/**
 * Google Drive API service
 * Uses Google Drive REST API v3 with user's OAuth access token
 */

const API_BASE = 'https://www.googleapis.com/drive/v3';

/**
 * Helper to execute fetch with a timeout using AbortController and automatic retries
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  timeoutMs = 35000,
  maxRetries = 2
): Promise<Response> {
  let lastErr: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(id);

      // Return immediately on success or non-retryable auth/not-found statuses
      if (res.ok || res.status === 401 || res.status === 403 || res.status === 404) {
        return res;
      }
      throw new Error(`Google Drive API error: ${res.status} - ${res.statusText}`);
    } catch (err: unknown) {
      clearTimeout(id);
      lastErr = err;
      if (attempt < maxRetries) {
        // Exponential backoff before retry (1s, 2s)
        await new Promise((r) => setTimeout(r, (attempt + 1) * 1000));
      }
    }
  }

  if (lastErr instanceof Error && lastErr.name === 'AbortError') {
    throw new Error(`Request timed out after ${timeoutMs}ms`, { cause: lastErr });
  }
  throw lastErr;
}

export interface GoogleFolder {
  id: string;
  name: string;
  path: string;
}

export interface GoogleFile {
  id: string;
  name: string;
  path: string;
  size: number;
  modifiedTime: string;
}

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic'];

function isImageFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase();
  return !!ext && IMAGE_EXTENSIONS.includes(ext);
}

/**
 * List folders in a parent folder (defaults to root: "")
 */
export async function listFolders(
  accessToken: string,
  parentFolderId = ''
): Promise<GoogleFolder[]> {
  const parentQuery = (parentFolderId && parentFolderId !== 'root')
    ? `'${parentFolderId}' in parents`
    : `'root' in parents`;

  const q = `${parentQuery} and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const url = `${API_BASE}/files?q=${encodeURIComponent(q)}&fields=nextPageToken,files(id,name)&pageSize=100&orderBy=name`;

  const res = await fetchWithRetry(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Google Drive API error: ${res.status} - ${error}`);
  }

  const data = await res.json();
  const files = data.files || [];

  return files.map((file: { id: string; name: string }) => ({
    id: file.id,
    name: file.name,
    path: file.name,
  }));
}

/**
 * List image files in a folder, with pagination support
 */
export async function listPhotosInFolder(
  accessToken: string,
  folderId: string
): Promise<GoogleFile[]> {
  const allFiles: GoogleFile[] = [];
  let pageToken: string | undefined;

  do {
    const parentQuery = `'${folderId}' in parents`;
    const q = `${parentQuery} and (mimeType starts with 'image/') and trashed = false`;
    let url = `${API_BASE}/files?q=${encodeURIComponent(q)}&fields=nextPageToken,files(id,name,size,modifiedTime)&pageSize=1000&orderBy=name`;

    if (pageToken) {
      url += `&pageToken=${encodeURIComponent(pageToken)}`;
    }

    const res = await fetchWithRetry(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Google Drive API error: ${res.status} - ${error}`);
    }

    const data = await res.json();
    const files = data.files || [];

    for (const file of files) {
      if (isImageFile(file.name)) {
        allFiles.push({
          id: file.id,
          name: file.name,
          path: file.name,
          size: Number(file.size || 0),
          modifiedTime: file.modifiedTime || new Date().toISOString(),
        });
      }
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  return allFiles;
}

/**
 * Download a photo as a Blob for face processing
 */
export async function getPhotoBlob(
  accessToken: string,
  fileId: string,
  timeoutMs = 35000
): Promise<Blob> {
  const url = `${API_BASE}/files/${fileId}?alt=media`;
  const res = await fetchWithRetry(
    url,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    timeoutMs,
    2
  );

  if (!res.ok) {
    throw new Error(`Failed to download Google Drive file ${fileId}: ${res.status}`);
  }

  return await res.blob();
}

/**
 * Download a lightweight photo thumbnail as a Blob
 */
export async function getPhotoThumbnailBlob(
  accessToken: string,
  fileId: string,
  size?: string
): Promise<Blob> {
  const sz = size && (size.includes('480') || size.includes('640') || size.includes('1000')) ? 'w1000' : 'w400';
  const url = `https://drive.google.com/thumbnail?id=${fileId}&sz=${sz}`;
  
  try {
    const res = await fetchWithRetry(
      url,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      8000,
      1
    );

    if (res.ok) {
      return await res.blob();
    }
  } catch {
    // Fallback to full blob if thumbnail endpoint is unavailable
  }

  return getPhotoBlob(accessToken, fileId, 20000);
}

/**
 * Check if the Google access token is valid
 */
export async function checkTokenValidity(accessToken: string): Promise<boolean> {
  try {
    const res = await fetchWithRetry(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${accessToken}`,
      {},
      5000,
      1
    );
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Count image files in a folder (for display purposes)
 */
export async function countPhotosInFolder(
  accessToken: string,
  folderId: string
): Promise<number> {
  try {
    const photos = await listPhotosInFolder(accessToken, folderId);
    return photos.length;
  } catch (err) {
    console.error('Failed to count photos in Google Drive folder:', err);
    return 0;
  }
}

/**
 * Get public CDN view URL for a Google Drive file
 */
export async function getOrCreateSharedLink(
  _accessToken: string,
  fileId: string
): Promise<string> {
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w400`;
}
