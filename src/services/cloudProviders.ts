import {
  listFolders as dbxListFolders,
  listPhotosInFolder as dbxListPhotos,
  getPhotoBlob as dbxGetPhotoBlob,
  getPhotoThumbnailBlob as dbxGetThumbnail,
  getOrCreateSharedLink as dbxGetOrCreateLink,
  checkTokenValidity as dbxCheckToken,
  convertToRawDropboxUrl
} from './dropbox';

export type CloudProvider = 'dropbox' | 'google' | 'onedrive';

/**
 * List folders in a parent folder depending on provider
 */
export async function listFolders(
  provider: CloudProvider,
  accessToken: string,
  parentFolderId = ''
) {
  if (provider === 'dropbox') {
    return dbxListFolders(accessToken, parentFolderId);
  }
  throw new Error(`Provider ${provider} not supported yet.`);
}

/**
 * List image files in a folder depending on provider
 */
export async function listPhotosInFolder(
  provider: CloudProvider,
  accessToken: string,
  folderId: string
) {
  if (provider === 'dropbox') {
    return dbxListPhotos(accessToken, folderId);
  }
  throw new Error(`Provider ${provider} not supported yet.`);
}

/**
 * Download a photo as a Blob depending on provider
 */
export async function getPhotoBlob(
  provider: CloudProvider,
  accessToken: string,
  fileId: string
): Promise<Blob> {
  if (provider === 'dropbox') {
    return dbxGetPhotoBlob(accessToken, fileId);
  }
  throw new Error(`Provider ${provider} not supported yet.`);
}

/**
 * Download a photo thumbnail as a Blob depending on provider
 */
export async function getPhotoThumbnailBlob(
  provider: CloudProvider,
  accessToken: string,
  fileId: string,
  size?: any
): Promise<Blob> {
  if (provider === 'dropbox') {
    return dbxGetThumbnail(accessToken, fileId, size);
  }
  throw new Error(`Provider ${provider} not supported yet.`);
}

/**
 * Get or create a public shared link depending on provider
 */
export async function getOrCreateSharedLink(
  provider: CloudProvider,
  accessToken: string,
  fileId: string
): Promise<string> {
  if (provider === 'dropbox') {
    return dbxGetOrCreateLink(accessToken, fileId);
  }
  throw new Error(`Provider ${provider} not supported yet.`);
}

/**
 * Check if a Google Drive access token is valid
 */
export async function checkGoogleToken(accessToken: string): Promise<boolean> {
  try {
    const res = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${accessToken}`);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Check if a Microsoft OneDrive access token is valid
 */
export async function checkOneDriveToken(accessToken: string): Promise<boolean> {
  try {
    const res = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Check token validity depending on provider
 */
export async function checkTokenValidity(
  provider: CloudProvider,
  accessToken: string
): Promise<boolean> {
  if (!accessToken) return false;
  if (provider === 'dropbox') {
    return dbxCheckToken(accessToken);
  }
  if (provider === 'google') {
    return checkGoogleToken(accessToken);
  }
  if (provider === 'onedrive') {
    return checkOneDriveToken(accessToken);
  }
  return false;
}

/**
 * Convert raw URL depending on provider
 */
export function convertToRawUrl(provider: CloudProvider, url: string): string {
  if (provider === 'dropbox') {
    return convertToRawDropboxUrl(url);
  }
  return url;
}

/**
 * Count photos in folder depending on provider
 */
export async function countPhotosInFolder(
  provider: CloudProvider,
  accessToken: string,
  folderId: string
): Promise<number> {
  if (provider === 'dropbox') {
    try {
      const photos = await listPhotosInFolder(provider, accessToken, folderId);
      return photos.length;
    } catch (err) {
      console.error('Failed to count photos in Dropbox folder:', err);
      return 0;
    }
  }
  return 0;
}

