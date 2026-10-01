/**
 * Validation for photo links and IDs written by event owners. Shared by the
 * browser and the API functions, so it must not depend on DOM or Node APIs.
 */

// Hosts that serve shared photos. Photo URLs are written by event owners and
// rendered on public guest pages, so anything else (javascript:, data:, or
// arbitrary tracking hosts) is dropped.
const TRUSTED_PHOTO_HOSTS = [
  'dropbox.com',
  'dropboxusercontent.com',
  'drive.google.com',
  'googleusercontent.com',
  '1drv.ms',
  'onedrive.live.com',
  'sharepoint.com',
];

/** Return `url` if it is an https URL on a trusted photo host, otherwise ''. */
export function toTrustedPhotoUrl(url: string | undefined | null): string {
  if (!url) return '';
  try {
    const { protocol, hostname } = new URL(url);
    const trusted = protocol === 'https:'
      && TRUSTED_PHOTO_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
    return trusted ? url : '';
  } catch {
    return '';
  }
}

/** Google Drive file IDs are URL-safe base64-like tokens. */
export function isValidDriveFileId(id: string): boolean {
  return /^[A-Za-z0-9_-]{10,200}$/.test(id);
}
