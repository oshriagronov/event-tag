import {
  listFolders as dbxListFolders,
  listPhotosInFolder as dbxListPhotos,
  getPhotoBlob as dbxGetPhotoBlob,
  getPhotoThumbnailBlob as dbxGetThumbnail,
  getOrCreateSharedLink as dbxGetOrCreateLink,
  checkTokenValidity as dbxCheckToken,
  convertToRawDropboxUrl
} from './dropbox';

import {
  listFolders as googleListFolders,
  listPhotosInFolder as googleListPhotos,
  getPhotoBlob as googleGetPhotoBlob,
  getPhotoThumbnailBlob as googleGetThumbnail,
  getOrCreateSharedLink as googleGetOrCreateSharedLink,
  checkTokenValidity as googleCheckToken,
  countPhotosInFolder as googleCountPhotos,
} from './google';

import {
  listFolders as pcloudListFolders,
  listPhotosInFolder as pcloudListPhotos,
  getPhotoBlob as pcloudGetPhotoBlob,
  getPhotoThumbnailBlob as pcloudGetThumbnail,
  getOrCreateSharedLink as pcloudGetOrCreateSharedLink,
  checkTokenValidity as pcloudCheckToken,
  countPhotosInFolder as pcloudCountPhotos,
} from './pcloud';

import {
  listFolders as boxListFolders,
  listPhotosInFolder as boxListPhotos,
  getPhotoBlob as boxGetPhotoBlob,
  getPhotoThumbnailBlob as boxGetThumbnail,
  getOrCreateSharedLink as boxGetOrCreateSharedLink,
  checkTokenValidity as boxCheckToken,
  countPhotosInFolder as boxCountPhotos,
} from './box';

export type CloudProvider = 'dropbox' | 'google' | 'onedrive' | 'pcloud' | 'box';

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
  if (provider === 'pcloud') {
    return pcloudListFolders(accessToken, parentFolderId);
  }
  if (provider === 'box') {
    return boxListFolders(accessToken, parentFolderId);
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
  if (provider === 'pcloud') {
    return pcloudListPhotos(accessToken, folderId);
  }
  if (provider === 'box') {
    return boxListPhotos(accessToken, folderId);
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
  if (provider === 'pcloud') {
    return pcloudGetPhotoBlob(accessToken, fileId);
  }
  if (provider === 'box') {
    return boxGetPhotoBlob(accessToken, fileId);
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
  if (provider === 'pcloud') {
    return pcloudGetThumbnail(accessToken, fileId, '400x400');
  }
  if (provider === 'box') {
    return boxGetThumbnail(accessToken, fileId);
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
  if (provider === 'pcloud') {
    return pcloudGetOrCreateSharedLink(accessToken, fileId);
  }
  if (provider === 'box') {
    return boxGetOrCreateSharedLink(accessToken, fileId);
  }
  throw new Error(`Provider ${provider} not supported yet.`);
}

/**
 * Check if a Google Drive access token is valid
 */
export async function checkGoogleToken(accessToken: string): Promise<boolean> {
  return googleCheckToken(accessToken);
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
  if (provider === 'pcloud') {
    return pcloudCheckToken(accessToken);
  }
  if (provider === 'box') {
    return boxCheckToken(accessToken);
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
  if (provider === 'box') {
    return url || '';
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
  if (provider === 'google') {
    return googleCountPhotos(accessToken, folderId);
  }
  if (provider === 'pcloud') {
    return pcloudCountPhotos(accessToken, folderId);
  }
  if (provider === 'box') {
    return boxCountPhotos(accessToken, folderId);
  }
  return 0;
}



