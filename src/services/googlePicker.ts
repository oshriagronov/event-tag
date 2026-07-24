import { makeFolderPublic } from './google';


export interface GooglePickerResponse {
  action: string;
  docs?: Array<{
    id: string;
    name: string;
  }>;
}

/**
 * Dynamically load Google API (gapi) script if not present
 */
function loadGapiScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('Window not available'));
    if (window.gapi?.load) return resolve();

    const existing = document.querySelector('script[src*="apis.google.com/js/api.js"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', (e) => reject(e));
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = (e) => reject(e);
    document.head.appendChild(script);
  });
}

/**
 * Load gapi picker module
 */
function loadPickerModule(): Promise<void> {
  return loadGapiScript().then(() => {
    return new Promise((resolve) => {
      if (window.google?.picker) return resolve();
      if (window.gapi?.load) {
        window.gapi.load('picker', () => {
          resolve();
        });
      } else {
        resolve();
      }
    });
  });
}

/**
 * Open Google Drive Picker UI popup allowing user to select any existing folder
 */
export async function openGooglePicker({
  accessToken,
  onSelect,
  onCancel,
}: {
  accessToken: string;
  onSelect: (folderId: string, folderName: string) => void;
  onCancel?: () => void;
}): Promise<void> {
  await loadPickerModule();

  const pickerObj = window.google?.picker;
  if (!pickerObj) {
    throw new Error('Google Picker API failed to initialize');
  }

  const view = new pickerObj.DocsView(pickerObj.ViewId.FOLDERS)
    .setSelectFolderEnabled(true)
    .setMimeTypes('application/vnd.google-apps.folder');

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
  const apiKey = import.meta.env.VITE_GOOGLE_API_KEY || import.meta.env.VITE_FIREBASE_API_KEY || '';
  const appId = clientId ? clientId.split('-')[0] : '';

  const builder = new pickerObj.PickerBuilder()
    .addView(view)
    .setOAuthToken(accessToken)
    .setCallback(async (data: GooglePickerResponse) => {
      if (data.action === pickerObj.Action.PICKED && data.docs && data.docs.length > 0) {
        const doc = data.docs[0];
        const folderId = doc.id;
        const folderName = doc.name;

        // Automatically set public permission ("Anyone with link can view") on the picked folder
        await makeFolderPublic(accessToken, folderId);

        onSelect(folderId, folderName);
      } else if (data.action === pickerObj.Action.CANCEL) {
        if (onCancel) onCancel();
      }
    });

  if (appId) {
    builder.setAppId(appId);
  }
  if (apiKey) {
    builder.setDeveloperKey(apiKey);
  }

  const picker = builder.build();
  picker.setVisible(true);
}
