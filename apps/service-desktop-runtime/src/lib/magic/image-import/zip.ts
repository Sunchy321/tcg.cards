import { BlobReader, ZipReader } from '@zip.js/zip.js';
import type { FileEntry } from '@zip.js/zip.js';

/** Image file extensions accepted as card images inside import archives. */
const imageExtensions = new Set(['png', 'jpg', 'jpeg', 'webp']);

// zip.js decodes entries without the UTF-8 flag as cp437, which mangles the GBK
// filenames produced by common Windows archivers. The decode hook receives the
// raw bytes, so decode strict UTF-8 first and fall back to GBK; ASCII names
// decode identically under both.
const utf8Strict = new TextDecoder('utf-8', { fatal: true });
const gbkDecoder = new TextDecoder('gbk');

/** Decodes one raw archive entry name, preferring UTF-8 and falling back to GBK. */
function decodeEntryName(value: Uint8Array): string {
  try {
    return utf8Strict.decode(value);
  } catch {
    return gbkDecoder.decode(value);
  }
}

/** Reports whether an archive member is extraction noise (resource forks, hidden metadata). */
function isIgnoredName(name: string): boolean {
  const base = name.split('/').pop() ?? name;
  return name.startsWith('__MACOSX/') || base.startsWith('._') || base === '.DS_Store';
}

/** Reports whether an archive member is a supported card image file. */
function isImageEntry(entry: FileEntry | { directory: boolean, filename: string }): entry is FileEntry {
  if (entry.directory) return false;
  const base = entry.filename.split('/').pop() ?? entry.filename;
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return false;
  return imageExtensions.has(base.slice(dot + 1).toLowerCase());
}

/** One image member of an import zip. */
export interface ZipImageInfo {
  /** Full entry filename including directory segments. */
  filename: string;
  /** Uncompressed byte size of the entry. */
  size: number;
}

/** Opens the zip at `zipPath` and passes its image entries to `fn`, closing the reader afterwards. */
async function withZipImageEntries<T>(zipPath: string, fn: (entries: FileEntry[]) => Promise<T>): Promise<T> {
  // BlobReader over the lazy Bun file handle: only the central directory (and
  // later the requested entry ranges) is read, never the whole archive.
  const reader = new ZipReader(new BlobReader(Bun.file(zipPath)), { decodeText: decodeEntryName });
  try {
    const entries = await reader.getEntries();
    const images = entries.filter(entry => !entry.directory && !isIgnoredName(entry.filename) && isImageEntry(entry));
    return await fn(images as FileEntry[]);
  } finally {
    await reader.close();
  }
}

/** Lists image entries of a local zip without extracting data. */
export async function listZipImages(zipPath: string): Promise<ZipImageInfo[]> {
  return withZipImageEntries(zipPath, async entries => entries.map(entry => ({
    filename: entry.filename,
    size:     entry.uncompressedSize,
  })));
}

/** Extracts the requested image entries of a local zip in one pass, keyed by entry filename. */
export async function readZipImages(zipPath: string, filenames: string[]): Promise<Map<string, Buffer>> {
  const wanted = new Set(filenames);
  const results = new Map<string, Buffer>();
  return withZipImageEntries(zipPath, async entries => {
    for (const entry of entries) {
      if (!wanted.has(entry.filename)) continue;
      try {
        results.set(entry.filename, Buffer.from(await entry.arrayBuffer()));
      } catch {
        // Undecodable or corrupt entry: leave it out, the caller counts the failure.
      }
    }
    return results;
  });
}
