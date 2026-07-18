/**
 * Dropbox API service
 * Uses the REST API v2 with the user's OAuth access token
 */

const API_BASE = 'https://api.dropboxapi.com/2';
const CONTENT_BASE = 'https://content.dropboxapi.com/2';

/**
 * Helper to execute fetch with a timeout using AbortController
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 15000
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(id);
    return res;
  } catch (err: any) {
    clearTimeout(id);
    if (err.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw err;
  }
}

export interface DropboxFolder {
  id: string;
  name: string;
  path: string;
}

export interface DropboxFile {
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
): Promise<DropboxFolder[]> {
  const res = await fetchWithTimeout(`${API_BASE}/files/list_folder`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      path: parentFolderId,
      recursive: false,
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Dropbox API error: ${res.status} - ${error}`);
  }

  const data = await res.json();
  const entries = data.entries || [];
  
  return entries
    .filter((entry: any) => entry['.tag'] === 'folder')
    .map((entry: any) => ({
      id: entry.id,
      name: entry.name,
      path: entry.path_display || entry.path_lower,
    }));
}

/**
 * List image files in a folder, with pagination support
 */
export async function listPhotosInFolder(
  accessToken: string,
  folderId: string
): Promise<DropboxFile[]> {
  const allFiles: DropboxFile[] = [];
  let hasMore = false;
  let cursor: string | undefined;

  // First page fetch
  const res = await fetchWithTimeout(`${API_BASE}/files/list_folder`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      path: folderId,
      recursive: false,
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Dropbox API error: ${res.status} - ${error}`);
  }

  let data = await res.json();
  
  const processEntries = (entries: any[]) => {
    for (const entry of entries) {
      if (entry['.tag'] === 'file' && isImageFile(entry.name)) {
        allFiles.push({
          id: entry.id,
          name: entry.name,
          path: entry.path_display || entry.path_lower,
          size: entry.size || 0,
          modifiedTime: entry.client_modified || new Date().toISOString(),
        });
      }
    }
  };

  processEntries(data.entries || []);
  hasMore = data.has_more;
  cursor = data.cursor;

  // Subsequent pages fetch
  while (hasMore && cursor) {
    const pageRes = await fetchWithTimeout(`${API_BASE}/files/list_folder/continue`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cursor }),
    });

    if (!pageRes.ok) {
      const error = await pageRes.text();
      throw new Error(`Dropbox API error: ${pageRes.status} - ${error}`);
    }

    data = await pageRes.json();
    processEntries(data.entries || []);
    hasMore = data.has_more;
    cursor = data.cursor;
  }

  return allFiles;
}

/**
 * Download a photo as a Blob for face processing
 */
export async function getPhotoBlob(
  accessToken: string,
  fileId: string,
  timeoutMs = 25000
): Promise<Blob> {
  const res = await fetchWithTimeout(`${CONTENT_BASE}/files/download`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Dropbox-API-Arg': JSON.stringify({ path: fileId }),
    },
  }, timeoutMs);

  if (!res.ok) {
    throw new Error(`Failed to download file ${fileId}: ${res.status}`);
  }

  return await res.blob();
}

/**
 * Check if the Dropbox access token is still valid
 */
export async function checkTokenValidity(accessToken: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/users/get_current_account`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: 'null',
    }, 5000);
    return res.ok;
  } catch (err) {
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
    console.error('Failed to count photos in Dropbox folder:', err);
    return 0;
  }
}

/**
 * Download a photo thumbnail as a Blob
 */
export async function getPhotoThumbnailBlob(
  accessToken: string,
  fileId: string,
  size: 'w32h32' | 'w64h64' | 'w128h128' | 'w256h256' | 'w480h320' | 'w640h480' | 'w960h640' | 'w1024h768' = 'w256h256'
): Promise<Blob> {
  const res = await fetchWithTimeout(`${CONTENT_BASE}/files/get_thumbnail`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Dropbox-API-Arg': JSON.stringify({
        path: fileId,
        format: 'jpeg',
        size,
        mode: 'strict',
      }),
    },
  }, 15000);

  if (!res.ok) {
    throw new Error(`Failed to get thumbnail for ${fileId}: ${res.status}`);
  }

  return await res.blob();
}

/**
 * Get or create a public shared link for a file
 */
export async function getOrCreateSharedLink(
  accessToken: string,
  fileId: string
): Promise<string> {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/sharing/create_shared_link_with_settings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path: fileId,
        settings: {
          requested_visibility: 'public',
        },
      }),
    }, 15000);

    if (res.ok) {
      const data = await res.json();
      return data.url;
    }

    // Check if the link already exists (conflict status 409)
    if (res.status === 409) {
      const listRes = await fetchWithTimeout(`${API_BASE}/sharing/list_shared_links`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          path: fileId,
          direct_only: true,
        }),
      }, 15000);

      if (listRes.ok) {
        const listData = await listRes.json();
        if (listData.links && listData.links.length > 0) {
          return listData.links[0].url;
        }
      }
    }

    throw new Error(`Failed to get shared link: ${res.status}`);
  } catch (err) {
    console.error('Error getting shared link:', err);
    throw err;
  }
}

/**
 * Converts a standard Dropbox sharing URL to a direct-download raw CDN link
 * that works perfectly in <img> tags on localhost and production.
 */
export function convertToRawDropboxUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname === 'www.dropbox.com') {
      urlObj.hostname = 'dl.dropboxusercontent.com';
    }
    urlObj.searchParams.set('raw', '1');
    urlObj.searchParams.delete('dl');
    return urlObj.toString();
  } catch (err) {
    return url
      .replace('www.dropbox.com', 'dl.dropboxusercontent.com')
      .replace('?dl=0', '?raw=1')
      .replace('&dl=0', '&raw=1');
  }
}

