/**
 * Google Drive API service
 * Uses the REST API v3 with the user's OAuth access token
 */

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink?: string;
  webContentLink?: string;
  size?: string;
  modifiedTime?: string;
}

export interface DriveFolder {
  id: string;
  name: string;
  modifiedTime?: string;
}

/**
 * List folders in a parent folder (defaults to root)
 */
export async function listFolders(
  accessToken: string,
  parentFolderId = 'root'
): Promise<DriveFolder[]> {
  const query = `'${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const params = new URLSearchParams({
    q: query,
    fields: 'files(id,name,modifiedTime)',
    orderBy: 'name',
    pageSize: '100',
  });

  const res = await fetch(`${DRIVE_API_BASE}/files?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Google Drive API error: ${res.status} - ${error}`);
  }

  const data = await res.json();
  return data.files || [];
}

/**
 * List image files in a folder
 */
export async function listPhotosInFolder(
  accessToken: string,
  folderId: string
): Promise<DriveFile[]> {
  const allFiles: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const query = `'${folderId}' in parents and (mimeType contains 'image/') and trashed = false`;
    const params = new URLSearchParams({
      q: query,
      fields: 'nextPageToken,files(id,name,mimeType,thumbnailLink,webContentLink,size,modifiedTime)',
      orderBy: 'name',
      pageSize: '1000',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const res = await fetch(`${DRIVE_API_BASE}/files?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Google Drive API error: ${res.status} - ${error}`);
    }

    const data = await res.json();
    allFiles.push(...(data.files || []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return allFiles;
}

/**
 * Download a photo as a Blob for face processing
 */
export async function getPhotoBlob(
  accessToken: string,
  fileId: string
): Promise<Blob> {
  const res = await fetch(`${DRIVE_API_BASE}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to download file ${fileId}: ${res.status}`);
  }

  return await res.blob();
}

/**
 * Get a thumbnail URL for display (uses Drive's built-in thumbnail service)
 * Returns a proxied thumbnail URL that works without CORS issues
 */
export function getThumbnailUrl(_accessToken: string, fileId: string, size = 400): string {
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=s${size}`;
}

/**
 * Get file metadata
 */
export async function getFileMetadata(
  accessToken: string,
  fileId: string
): Promise<DriveFile> {
  const params = new URLSearchParams({
    fields: 'id,name,mimeType,thumbnailLink,webContentLink,size,modifiedTime',
  });

  const res = await fetch(`${DRIVE_API_BASE}/files/${fileId}?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to get file metadata ${fileId}: ${res.status}`);
  }

  return await res.json();
}

/**
 * Count image files in a folder (for display purposes)
 */
export async function countPhotosInFolder(
  accessToken: string,
  folderId: string
): Promise<number> {
  const query = `'${folderId}' in parents and (mimeType contains 'image/') and trashed = false`;
  const params = new URLSearchParams({
    q: query,
    fields: 'files(id)',
    pageSize: '1000',
  });

  const res = await fetch(`${DRIVE_API_BASE}/files?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) return 0;

  const data = await res.json();
  return (data.files || []).length;
}
