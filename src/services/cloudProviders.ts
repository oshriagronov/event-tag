import {
  listFolders as dbxListFolders,
  listPhotosInFolder as dbxListPhotos,
  getPhotoBlob as dbxGetPhotoBlob,
  getPhotoThumbnailBlob as dbxGetThumbnail,
  getOrCreateSharedLink as dbxGetOrCreateLink,
  checkTokenValidity as dbxCheckToken,
  convertToRawDropboxUrl,
  createDropboxFolder,
  uploadPhotoToDropbox,
} from './dropbox';

import {
  listFolders as googleListFolders,
  listPhotosInFolder as googleListPhotos,
  getPhotoBlob as googleGetPhotoBlob,
  getPhotoThumbnailBlob as googleGetThumbnail,
  getOrCreateSharedLink as googleGetOrCreateSharedLink,
  checkTokenValidity as googleCheckToken,
} from './google';

export type CloudProvider = 'dropbox' | 'google' | 'onedrive';

/**
 * Only an explicit invalid/revoked credential may disconnect a provider. Network,
 * quota and authorization failures are actionable, but do not invalidate a session.
 */
export function isTokenInvalidError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /(?::\s*401\b|invalid[_ -]?(?:access[_ -]?)?token|expired_access_token|token (?:has )?expired|invalid_grant|revoked)/i.test(message);
}

export function isAuthorizationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /(?::\s*403\b|permission_denied|insufficient(?:[_ -]permissions?)?|forbidden|unregistered callers)/i.test(message);
}

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
  if (provider === 'google') {
    return googleListFolders(accessToken, parentFolderId);
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
  if (provider === 'google') {
    return googleListPhotos(accessToken, folderId);
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
  if (provider === 'google') {
    return googleGetPhotoBlob(accessToken, fileId);
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
  size?: Parameters<typeof dbxGetThumbnail>[2]
): Promise<Blob> {
  if (provider === 'dropbox') {
    return dbxGetThumbnail(accessToken, fileId, size);
  }
  if (provider === 'google') {
    return googleGetThumbnail(accessToken, fileId, size);
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
  if (provider === 'google') {
    return googleGetOrCreateSharedLink(accessToken, fileId);
  }
  throw new Error(`Provider ${provider} not supported yet.`);
}

async function checkOneDriveToken(accessToken: string): Promise<boolean> {
  const res = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.ok) return true;
  if (res.status === 401) return false;
  throw new Error(`OneDrive token validation failed: ${res.status}`);
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
    return googleCheckToken(accessToken);
  }
  if (provider === 'onedrive') {
    return checkOneDriveToken(accessToken);
  }
  return false;
}

/**
 * Convert raw URL depending on provider
 */
export function convertToRawUrl(
  provider: CloudProvider,
  url: string,
  targetSize: 'thumb' | 'full' = 'thumb'
): string {
  if (!url) return '';
  if (provider === 'dropbox') {
    return convertToRawDropboxUrl(url);
  }
  if (provider === 'onedrive') {
    return url.replace('embed?', 'download?');
  }
  if (provider === 'google') {
    const sizeParam = targetSize === 'thumb' ? '&sz=w400' : '&sz=w1600';
    const match = url.match(/(?:id=|file\/d\/|usercontent\.com\/d\/)([^/&?]+)/);
    const fileId = match?.[1] || url;
    // Strip trailing =s400/=s1600 if passed raw
    const cleanId = fileId.replace(/=s\d+$/, '');
    return `https://drive.google.com/thumbnail?id=${cleanId}${sizeParam}`;
  }
  return url;
}

/**
 * Count photos in folder depending on provider (0 when the listing fails)
 */
export async function countPhotosInFolder(
  provider: CloudProvider,
  accessToken: string,
  folderId: string
): Promise<number> {
  try {
    const photos = await listPhotosInFolder(provider, accessToken, folderId);
    return photos.length;
  } catch (err) {
    console.error(`Failed to count photos in ${provider} folder:`, err);
    return 0;
  }
}

/**
 * Transient failures (network drops, timeouts, throttling, provider 5xx) are
 * worth retrying automatically; everything else needs a user decision.
 */
export function isTransientError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /(?:timed out|timeout|failed to fetch|networkerror|network request failed|load failed|aborterror|:\s*429\b|:\s*5\d\d\b|rate ?limit|too_many)/i.test(message);
}

export { createDropboxFolder, uploadPhotoToDropbox };
