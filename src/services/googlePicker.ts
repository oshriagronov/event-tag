/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Google Picker API Service
 * Handles loading gapi dynamically and showing the file/photo picker dialog.
 */

let scriptLoadingPromise: Promise<void> | null = null;

function loadGoogleApiScript(): Promise<void> {
  if (scriptLoadingPromise) return scriptLoadingPromise;

  scriptLoadingPromise = new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && (window as any).gapi) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = (err) => {
      scriptLoadingPromise = null; // Allow retry
      reject(new Error('Failed to load Google API script: ' + err));
    };
    document.body.appendChild(script);
  });

  return scriptLoadingPromise;
}

function loadPickerLibrary(): Promise<void> {
  return loadGoogleApiScript().then(() => {
    return new Promise((resolve, reject) => {
      const gapi = (window as any).gapi;
      if (!gapi) {
        reject(new Error('gapi not initialized'));
        return;
      }
      gapi.load('picker', {
        callback: () => resolve(),
        onerror: () => reject(new Error('Failed to load Google Picker library')),
      });
    });
  });
}

export interface SelectedDriveFile {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes?: number;
}

interface OpenPickerOptions {
  accessToken: string;
  apiKey: string;
  clientId: string;
  onSelected: (files: SelectedDriveFile[]) => void;
  onCancel?: () => void;
}

/**
 * Open the Google Picker dialog for selecting photos
 */
export async function openGooglePhotoPicker({
  accessToken,
  apiKey,
  clientId,
  onSelected,
  onCancel,
}: OpenPickerOptions): Promise<void> {
  try {
    await loadPickerLibrary();

    const google = (window as any).google;
    if (!google || !google.picker) {
      throw new Error('Google Picker library is not loaded');
    }

    // Extract numeric App ID from Client ID (e.g., 660699255577-xxxx -> 660699255577)
    const appId = clientId.split('-')[0];

    // Create a customizable DocsView allowing folder navigation
    const view = new google.picker.DocsView(google.picker.ViewId.DOCS);
    view.setIncludeFolders(true);
    view.setSelectFolderEnabled(false);
    view.setMimeTypes('image/jpeg,image/png,image/webp,image/heic');

    const picker = new google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(accessToken)
      .setDeveloperKey(apiKey)
      .setAppId(appId)
      .setCallback((data: any) => {
        if (data.action === google.picker.Action.PICKED) {
          const docs = data[google.picker.Response.DOCUMENTS] || [];
          const selectedFiles: SelectedDriveFile[] = docs.map((doc: any) => ({
            id: doc[google.picker.Document.ID],
            name: doc[google.picker.Document.NAME],
            mimeType: doc[google.picker.Document.MIME_TYPE],
            sizeBytes: doc[google.picker.Document.SIZE_BYTES],
          }));
          onSelected(selectedFiles);
        } else if (data.action === google.picker.Action.CANCEL) {
          if (onCancel) onCancel();
        }
      })
      .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
      .build();

    picker.setVisible(true);
  } catch (err) {
    console.error('Failed to open Google Picker:', err);
    alert('שגיאה בפתיחת Google Picker. אנא ודא שחוסם הפופ-אפים שלך מבוטל.');
    if (onCancel) onCancel();
  }
}

export interface SelectedDriveFolder {
  id: string;
  name: string;
}

interface OpenFolderPickerOptions {
  accessToken: string;
  apiKey: string;
  clientId: string;
  onSelected: (folder: SelectedDriveFolder) => void;
  onCancel?: () => void;
}

export async function openGoogleFolderPicker({
  accessToken,
  apiKey,
  clientId,
  onSelected,
  onCancel,
}: OpenFolderPickerOptions): Promise<void> {
  try {
    await loadPickerLibrary();

    const google = (window as any).google;
    if (!google || !google.picker) {
      throw new Error('Google Picker library is not loaded');
    }

    const appId = clientId.split('-')[0];

    const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
      .setIncludeFolders(true)
      .setMimeTypes('application/vnd.google-apps.folder,image/jpeg,image/png,image/webp,image/heic')
      .setSelectFolderEnabled(true);

    const picker = new google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(accessToken)
      .setDeveloperKey(apiKey)
      .setAppId(appId)
      .setCallback((data: any) => {
        if (data.action === google.picker.Action.PICKED) {
          const docs = data[google.picker.Response.DOCUMENTS] || [];
          if (docs.length > 0) {
            const folder = {
              id: docs[0][google.picker.Document.ID],
              name: docs[0][google.picker.Document.NAME],
            };
            onSelected(folder);
          }
        } else if (data.action === google.picker.Action.CANCEL) {
          if (onCancel) onCancel();
        }
      })
      .build();

    picker.setVisible(true);
  } catch (err) {
    console.error('Failed to open Google Picker:', err);
    alert('שגיאה בפתיחת Google Picker. אנא ודא שחוסם הפופ-אפים שלך מבוטל.');
    if (onCancel) onCancel();
  }
}

