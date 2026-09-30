/**
 * Google Drive API service
 * Uses Google Drive REST API v3 with user's OAuth access token
 */

const API_BASE = 'https://www.googleapis.com/drive/v3';

const RATE_LIMIT_REASONS = /rateLimitExceeded|userRateLimitExceeded|sharingRateLimitExceeded/;

function backoffDelay(attempt: number, retryAfterHeader: string | null): number {
  const retryAfter = Number(retryAfterHeader);
  if (retryAfterHeader && Number.isFinite(retryAfter)) return Math.min(retryAfter * 1000, 60_000);
  // Exponential backoff with jitter: ~1s, 2s, 4s, 8s ... capped at 30s
  return Math.min(1000 * 2 ** attempt, 30_000) + Math.random() * 500;
}

/**
 * Execute a Drive request with a per-attempt timeout and bounded retries for
 * transient failures (network errors, timeouts, 429, 5xx and Drive's 403
 * rate-limit responses). Every other response is returned to the caller.
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  timeoutMs = 35000,
  maxRetries = 3
): Promise<Response> {
  let lastErr: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);

      let retryable = res.status === 429 || res.status >= 500;
      if (res.status === 403) {
        retryable = RATE_LIMIT_REASONS.test(await res.clone().text().catch(() => ''));
      }
      if (!retryable || attempt === maxRetries) return res;

      await new Promise((r) => setTimeout(r, backoffDelay(attempt, res.headers.get('Retry-After'))));
    } catch (err: unknown) {
      clearTimeout(timer);
      lastErr = err instanceof Error && err.name === 'AbortError'
        ? new Error(`Request timed out after ${timeoutMs}ms`, { cause: err })
        : err;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, backoffDelay(attempt, null)));
      }
    }
  }

  throw lastErr;
}

/**
 * Convert a failed Drive response into an error whose message the shared
 * classifiers understand: 401 means the token is invalid (renew it), 403 is an
 * authorization/quota problem that must not disconnect the provider.
 */
async function driveError(res: Response, context: string): Promise<Error> {
  const detail = await res.text().catch(() => '');
  if (res.status === 401) {
    return new Error(`Google Drive API error: 401 - invalid_token - ${context}: ${detail}`);
  }
  return new Error(`Google Drive API error: ${res.status} - ${context}: ${detail}`);
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

const IMAGE_EXTENSIONS = [
  'jpg',
  'jpeg',
  'png',
  'webp',
  'heic',
  'heif',
  'bmp',
  'tiff',
  'tif',
  'avif',
  'gif',
  'raw',
  'cr2',
  'nef',
  'arw',
  'dng',
];

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

  const folders: GoogleFolder[] = [];
  let pageToken: string | undefined;
  do {
    let url = `${API_BASE}/files?q=${encodeURIComponent(q)}&fields=nextPageToken,files(id,name)&pageSize=1000&orderBy=name`;
    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;

    const res = await fetchWithRetry(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw await driveError(res, 'list folders');

    const data = await res.json() as { files?: Array<{ id: string; name: string }>; nextPageToken?: string };
    for (const file of data.files || []) {
      folders.push({ id: file.id, name: file.name, path: file.name });
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return folders;
}

/**
 * Share a Google Drive folder publicly ("Anyone with link can view")
 */
export async function makeFolderPublic(
  accessToken: string,
  folderId: string
): Promise<boolean> {
  try {
    const url = `${API_BASE}/files/${folderId}/permissions`;
    const res = await fetchWithRetry(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone',
      }),
    });
    return res.ok;
  } catch (err) {
    console.warn('Failed to set public permission on Google Drive folder:', err);
    return false;
  }
}

/**
 * Create a new folder in user's Google Drive and set it to public view
 */
export async function createGoogleFolder(
  accessToken: string,
  folderName: string,
  parentFolderId = 'root'
): Promise<GoogleFolder> {
  const metadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
    parents: parentFolderId && parentFolderId !== 'root' ? [parentFolderId] : ['root'],
  };

  const url = `${API_BASE}/files`;

  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(metadata),
  });

  if (!res.ok) throw await driveError(res, 'create folder');

  const data = await res.json();

  // Automatically make folder publicly viewable ("anyone with link can view")
  await makeFolderPublic(accessToken, data.id);

  return {
    id: data.id,
    name: data.name || folderName,
    path: data.name || folderName,
  };
}

/**
 * Upload a local image file directly to a Google Drive folder
 */
export async function uploadPhotoToGoogleDrive(
  accessToken: string,
  folderId: string,
  file: File
): Promise<GoogleFile> {
  const metadata = {
    name: file.name,
    parents: [folderId],
    mimeType: file.type || 'image/jpeg',
  };

  const formData = new FormData();
  formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  formData.append('file', file);

  const url = `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,modifiedTime`;

  const res = await fetchWithRetry(
    url,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    },
    120000,
    3
  );

  if (!res.ok) throw await driveError(res, `upload ${file.name}`);

  const data = await res.json();
  return {
    id: data.id,
    name: data.name || file.name,
    path: data.name || file.name,
    size: Number(data.size || file.size),
    modifiedTime: data.modifiedTime || new Date().toISOString(),
  };
}

/**
 * List image files in a folder, with pagination support and optional subfolder traversal
 */
export async function listPhotosInFolder(
  accessToken: string,
  folderId: string,
  currentDepth = 0,
  maxDepth = 3
): Promise<GoogleFile[]> {
  const allFiles: GoogleFile[] = [];
  const subfolderIds: string[] = [];
  let pageToken: string | undefined;

  do {
    const parentQuery = `'${folderId}' in parents`;
    const q = `${parentQuery} and trashed = false`;
    let url = `${API_BASE}/files?q=${encodeURIComponent(q)}&fields=nextPageToken,files(id,name,mimeType,size,modifiedTime)&pageSize=1000&orderBy=name`;

    if (pageToken) {
      url += `&pageToken=${encodeURIComponent(pageToken)}`;
    }

    const res = await fetchWithRetry(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) throw await driveError(res, 'list photos');

    const data = await res.json();
    const files: Array<{ id: string; name: string; mimeType?: string; size?: string; modifiedTime?: string }> =
      data.files || [];

    for (const file of files) {
      if (file.mimeType === 'application/vnd.google-apps.folder') {
        subfolderIds.push(file.id);
      } else if (isImageFile(file.name) || (file.mimeType && file.mimeType.startsWith('image/'))) {
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

  // If subfolders exist and we haven't reached max depth, recursively list photos from subfolders
  if (subfolderIds.length > 0 && currentDepth < maxDepth) {
    for (const subId of subfolderIds) {
      try {
        const subFiles = await listPhotosInFolder(accessToken, subId, currentDepth + 1, maxDepth);
        allFiles.push(...subFiles);
      } catch (err) {
        console.warn(`Failed to list subfolder ${subId} in Google Drive:`, err);
      }
    }
  }

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
    timeoutMs
  );

  if (!res.ok) throw await driveError(res, `download ${fileId}`);

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
 * Check if the Google access token is valid. Returns false only when Google
 * explicitly rejects the token; transport failures are thrown.
 */
export async function checkTokenValidity(accessToken: string): Promise<boolean> {
  const res = await fetchWithRetry(
    `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
    {},
    5000,
    1
  );
  if (res.ok) return true;
  if (res.status === 400 || res.status === 401) return false;
  throw new Error(`Google token validation failed: ${res.status}`);
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
