import type { DropboxFolder, DropboxFile } from './dropbox';

const BOX_API_BASE = 'https://api.box.com/2.0';
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.heic'];

function isImageFile(filename: string): boolean {
  const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
  return IMAGE_EXTENSIONS.includes(ext);
}

/**
 * Check if a Box access token is valid
 */
export async function checkTokenValidity(accessToken: string): Promise<boolean> {
  if (!accessToken) return false;
  try {
    const res = await fetch(`${BOX_API_BASE}/users/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return res.ok;
  } catch (err) {
    console.error('Failed to check Box token validity:', err);
    return false;
  }
}

/**
 * List subfolders inside a parent folder in Box ('0' is root)
 */
export async function listFolders(
  accessToken: string,
  parentFolderId = '0'
): Promise<DropboxFolder[]> {
  const folderId = parentFolderId || '0';
  const url = `${BOX_API_BASE}/folders/${encodeURIComponent(folderId)}/items?fields=id,type,name,path_collection&limit=1000`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('expired_access_token');
    }
    throw new Error(`Box API error: ${response.statusText}`);
  }

  const data = await response.json();
  const entries = data.entries || [];

  return entries
    .filter((item: { type: string }) => item.type === 'folder')
    .map((folder: { id: string; name: string }) => ({
      id: folder.id,
      name: folder.name,
      path: `/${folder.name}`,
    }));
}

/**
 * List image files inside a folder in Box
 */
export async function listPhotosInFolder(
  accessToken: string,
  folderId: string
): Promise<DropboxFile[]> {
  const fId = folderId || '0';
  const url = `${BOX_API_BASE}/folders/${encodeURIComponent(fId)}/items?fields=id,type,name,shared_link&limit=1000`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('expired_access_token');
    }
    throw new Error(`Box API error: ${response.statusText}`);
  }

  const data = await response.json();
  const entries = data.entries || [];

  return entries
    .filter((item: { type: string; name: string }) => {
      return item.type === 'file' && isImageFile(item.name);
    })
    .map((file: { id: string; name: string; shared_link?: { url?: string; download_url?: string } }) => {
      let publicUrl: string | undefined;
      if (file.shared_link?.download_url) {
        publicUrl = file.shared_link.download_url;
      } else if (file.shared_link?.url) {
        const link = file.shared_link.url;
        publicUrl = link.includes('/s/') ? link.replace('/s/', '/shared/static/') : link;
      }

      return {
        id: file.id,
        name: file.name,
        path: `/${file.name}`,
        publicUrl,
      };
    });
}

/**
 * Download photo binary as Blob from Box
 */
export async function getPhotoBlob(accessToken: string, fileId: string): Promise<Blob> {
  const url = `${BOX_API_BASE}/files/${encodeURIComponent(fileId)}/content`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('expired_access_token');
    }
    if (response.status === 403) {
      const errJson = await response.json().catch(() => ({}));
      const msg = errJson.message || errJson.error_description || 'Access denied (403 Forbidden)';
      throw new Error(`Box 403 Forbidden: ${msg}. Make sure "Write all files and folders stored in Box" is checked in Box Console.`);
    }
    throw new Error(`Box API error fetching file content: ${response.statusText} (${response.status})`);
  }

  return await response.blob();
}

/**
 * Get photo thumbnail blob from Box.
 * Directly downloads photo blob via getPhotoBlob to avoid Box API thumbnail 400 Bad Request errors.
 */
export async function getPhotoThumbnailBlob(accessToken: string, fileId: string): Promise<Blob> {
  return getPhotoBlob(accessToken, fileId);
}

/**
 * Create or get a public shared link for a file in Box
 */
export async function getOrCreateSharedLink(accessToken: string, fileId: string): Promise<string> {
  try {
    // 1. Check if shared_link already exists via GET
    const getRes = await fetch(`${BOX_API_BASE}/files/${encodeURIComponent(fileId)}?fields=shared_link`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (getRes.ok) {
      const getData = await getRes.json();
      if (getData.shared_link?.url) {
        return getData.shared_link.url;
      }
    }

    // 2. If no shared link exists, create open shared link via PUT /files/{fileId}
    const response = await fetch(`${BOX_API_BASE}/files/${encodeURIComponent(fileId)}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        shared_link: {
          access: 'open',
        },
      }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data.shared_link?.url) {
        return data.shared_link.url;
      }
    } else {
      const errData = await response.json().catch(() => ({}));
      console.warn(`[Box] PUT shared_link failed (${response.status}) for ${fileId}:`, errData);
    }
  } catch (err) {
    console.warn('[Box] Failed to create/get public link:', err);
  }

  return '';
}

/**
 * Count image files in a folder in Box
 */
export async function countPhotosInFolder(accessToken: string, folderId: string): Promise<number> {
  try {
    const photos = await listPhotosInFolder(accessToken, folderId);
    return photos.length;
  } catch (err) {
    console.error('Failed to count photos in Box folder:', err);
    return 0;
  }
}
