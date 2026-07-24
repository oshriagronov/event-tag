import type { DropboxFolder, DropboxFile } from './dropbox';

/**
 * Helper to get pCloud base API URL based on user location ID (1 = US, 2 = EU)
 */
function getPCloudApiBaseUrl(): string {
  if (typeof window === 'undefined') return 'https://api.pcloud.com';
  const locationId = localStorage.getItem('pcloud_location_id');
  return locationId === '2' ? 'https://eapi.pcloud.com' : 'https://api.pcloud.com';
}

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.heic'];

function isImageFile(filename: string, contentType?: string): boolean {
  if (contentType?.startsWith('image/')) return true;
  const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
  return IMAGE_EXTENSIONS.includes(ext);
}

/**
 * Check if a pCloud access token is valid
 */
export async function checkTokenValidity(accessToken: string): Promise<boolean> {
  if (!accessToken) return false;
  try {
    const baseUrl = getPCloudApiBaseUrl();
    const res = await fetch(`${baseUrl}/userinfo?access_token=${encodeURIComponent(accessToken)}`);
    if (!res.ok) return false;
    const data = await res.json();
    return data.result === 0;
  } catch (err) {
    console.error('Failed to check pCloud token validity:', err);
    return false;
  }
}

/**
 * List subfolders inside a parent folder in pCloud
 */
export async function listFolders(
  accessToken: string,
  parentFolderId = '0'
): Promise<DropboxFolder[]> {
  const baseUrl = getPCloudApiBaseUrl();
  const folderId = parentFolderId || '0';
  const url = `${baseUrl}/listfolder?folderid=${encodeURIComponent(folderId)}&access_token=${encodeURIComponent(accessToken)}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`pCloud API error: ${response.statusText}`);
  }

  const data = await response.json();
  if (data.result !== 0) {
    if (data.result === 1000 || data.result === 2000) {
      throw new Error('expired_access_token');
    }
    throw new Error(data.error || `pCloud error code ${data.result}`);
  }

  const contents = data.metadata?.contents || [];
  return contents
    .filter((item: { isfolder: boolean }) => item.isfolder)
    .map((folder: { folderid: number | string; name: string; path?: string }) => ({
      id: String(folder.folderid),
      name: folder.name,
      path: folder.path || `/${folder.name}`,
    }));
}

/**
 * List image files inside a folder in pCloud
 */
export async function listPhotosInFolder(
  accessToken: string,
  folderId: string
): Promise<DropboxFile[]> {
  const baseUrl = getPCloudApiBaseUrl();
  const fId = folderId || '0';
  const url = `${baseUrl}/listfolder?folderid=${encodeURIComponent(fId)}&access_token=${encodeURIComponent(accessToken)}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`pCloud API error: ${response.statusText}`);
  }

  const data = await response.json();
  if (data.result !== 0) {
    if (data.result === 1000 || data.result === 2000) {
      throw new Error('expired_access_token');
    }
    throw new Error(data.error || `pCloud error code ${data.result}`);
  }

  const contents = data.metadata?.contents || [];
  return contents
    .filter((item: { isfolder: boolean; name: string; contenttype?: string }) => {
      return !item.isfolder && isImageFile(item.name, item.contenttype);
    })
    .map((file: { fileid: number | string; name: string; path?: string }) => ({
      id: String(file.fileid),
      name: file.name,
      path: file.path || `/${file.name}`,
    }));
}

/**
 * Download photo binary as Blob from pCloud
 */
export async function getPhotoBlob(accessToken: string, fileId: string): Promise<Blob> {
  const baseUrl = getPCloudApiBaseUrl();
  const url = `${baseUrl}/getfilelink?fileid=${encodeURIComponent(fileId)}&access_token=${encodeURIComponent(accessToken)}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`pCloud API error getting file link: ${response.statusText}`);
  }

  const data = await response.json();
  if (data.result !== 0 || !data.hosts || data.hosts.length === 0 || !data.path) {
    if (data.result === 1000 || data.result === 2000) {
      throw new Error('expired_access_token');
    }
    throw new Error(data.error || `Failed to get pCloud file link for ${fileId}`);
  }

  const downloadUrl = `https://${data.hosts[0]}${data.path}`;
  const fileRes = await fetch(downloadUrl);
  if (!fileRes.ok) {
    throw new Error(`Failed to fetch photo content from pCloud host`);
  }

  return await fileRes.blob();
}

/**
 * Get photo thumbnail blob from pCloud
 */
export async function getPhotoThumbnailBlob(
  accessToken: string,
  fileId: string,
  size = '400x400'
): Promise<Blob> {
  try {
    const baseUrl = getPCloudApiBaseUrl();
    const url = `${baseUrl}/getthumblink?fileid=${encodeURIComponent(fileId)}&size=${encodeURIComponent(size)}&access_token=${encodeURIComponent(accessToken)}`;

    const response = await fetch(url);
    if (!response.ok) {
      return getPhotoBlob(accessToken, fileId);
    }

    const data = await response.json();
    if (data.result === 0 && data.hosts && data.hosts.length > 0 && data.path) {
      const thumbUrl = `https://${data.hosts[0]}${data.path}`;
      const thumbRes = await fetch(thumbUrl);
      if (thumbRes.ok) {
        return await thumbRes.blob();
      }
    }
    return getPhotoBlob(accessToken, fileId);
  } catch {
    return getPhotoBlob(accessToken, fileId);
  }
}

/**
 * Create or get a public shared link for a file in pCloud
 */
export async function getOrCreateSharedLink(accessToken: string, fileId: string): Promise<string> {
  try {
    const baseUrl = getPCloudApiBaseUrl();
    const url = `${baseUrl}/createfilepublink?fileid=${encodeURIComponent(fileId)}&access_token=${encodeURIComponent(accessToken)}`;

    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      if (data.result === 0 && data.code) {
        const locationId = typeof window !== 'undefined' ? localStorage.getItem('pcloud_location_id') : null;
        const host = locationId === '2' ? 'e-my.pcloud.com' : 'my.pcloud.com';
        return `https://${host}/publink/show?code=${data.code}`;
      }
    }
  } catch (err) {
    console.warn('Failed to create pCloud public link:', err);
  }

  // Fallback to direct file link if publink creation fails
  const baseUrl = getPCloudApiBaseUrl();
  const linkRes = await fetch(`${baseUrl}/getfilelink?fileid=${encodeURIComponent(fileId)}&access_token=${encodeURIComponent(accessToken)}`);
  if (linkRes.ok) {
    const data = await linkRes.json();
    if (data.result === 0 && data.hosts?.[0] && data.path) {
      return `https://${data.hosts[0]}${data.path}`;
    }
  }

  return '';
}

/**
 * Count image files in a folder in pCloud
 */
export async function countPhotosInFolder(accessToken: string, folderId: string): Promise<number> {
  try {
    const photos = await listPhotosInFolder(accessToken, folderId);
    return photos.length;
  } catch (err) {
    console.error('Failed to count photos in pCloud folder:', err);
    return 0;
  }
}
