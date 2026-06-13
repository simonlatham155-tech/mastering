/** Reliable blob delivery after async export (user-gesture safe). */

const REVOKE_OBJECT_URL_DELAY_MS = 60_000;

export type BlobDeliveryMethod = 'save-picker' | 'share' | 'anchor';

export interface DeliverBlobOptions {
  mimeType?: string;
  /** When true, open native save dialog (must run inside a click handler). */
  preferSavePicker?: boolean;
}

function downloadViaAnchor(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), REVOKE_OBJECT_URL_DELAY_MS);
}

async function saveViaPicker(blob: Blob, filename: string): Promise<boolean> {
  const picker = (
    window as Window & {
      showSaveFilePicker?: (options: {
        suggestedName: string;
        types: Array<{ description: string; accept: Record<string, string[]> }>;
      }) => Promise<FileSystemFileHandle>;
    }
  ).showSaveFilePicker;

  if (!picker) return false;

  try {
    const handle = await picker({
      suggestedName: filename,
      types: [
        {
          description: 'Audio file',
          accept: { 'audio/wav': ['.wav'], 'application/zip': ['.zip'] },
        },
      ],
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return false;
    }
    console.warn('Native save picker failed, falling back to download link:', error);
    return false;
  }
}

async function shareBlob(blob: Blob, filename: string, mimeType: string): Promise<boolean> {
  if (typeof File === 'undefined' || !navigator.share) return false;

  try {
    const file = new File([blob], filename, { type: mimeType });
    if (navigator.canShare && !navigator.canShare({ files: [file] })) {
      return false;
    }
    await navigator.share({ files: [file], title: filename });
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return false;
    }
    console.warn('Web Share failed, falling back to download link:', error);
    return false;
  }
}

/**
 * Best-effort automatic download after async render (may be blocked without user gesture).
 */
export function tryAutoDownloadBlob(blob: Blob, filename: string): void {
  downloadViaAnchor(blob, filename);
}

/**
 * User-initiated save — opens native picker / share sheet / anchor in click handler.
 */
export async function deliverBlobToUser(
  blob: Blob,
  filename: string,
  options: DeliverBlobOptions = {}
): Promise<BlobDeliveryMethod> {
  const mimeType = options.mimeType ?? (blob.type || 'application/octet-stream');

  if (options.preferSavePicker !== false) {
    if (await saveViaPicker(blob, filename)) return 'save-picker';
  }

  if (await shareBlob(blob, filename, mimeType)) return 'share';

  downloadViaAnchor(blob, filename);
  return 'anchor';
}
