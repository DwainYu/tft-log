/**
 * 结算截图 domain — types, limits and pure validation. Nothing here touches
 * Dexie, the DOM or React.
 *
 * Phase 1 stores, shows and manages screenshots; it deliberately reads nothing
 * out of them (no OCR, no vision, no recognition tables). The only forward seam
 * is `blob`: a future recogniser can take exactly this row and produce a
 * `MatchInput` without asking for a new storage shape.
 *
 * Storage note: one table row carries metadata *and* the bytes. IndexedDB keeps
 * a `Blob` as a reference rather than copying it into the record, so listing
 * rows is cheap, and a single `put`/`delete` is atomic — there is no window in
 * which the metadata says "exists" while the image is gone.
 */

export const SUPPORTED_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/bmp",
] as const;

export type SupportedImageMimeType = (typeof SUPPORTED_IMAGE_MIME_TYPES)[number];

/** Per-file ceiling. A client screenshot is 1–5 MB; 10 MB is deliberately loose. */
export const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;

/**
 * Soft warning threshold for the whole screenshot library, not a hard stop:
 * past this point saves still succeed but the UI says so, because refusing to
 * save is far worse than being told the local database is getting big.
 */
export const SCREENSHOT_USAGE_WARN_BYTES = 200 * 1024 * 1024;

/** Longest file name kept on the row; anything past this is truncated. */
export const MAX_SCREENSHOT_NAME_LENGTH = 120;

/**
 * A stored screenshot.
 *
 * `matchId` is a plain string rather than `string | undefined` because Dexie
 * cannot index `undefined` — an index simply omits those rows, which would make
 * "every screenshot without a match" unqueryable. The empty string therefore
 * *is* the unattached value; the service layer converts to/from `undefined` at
 * its boundary so callers never see the sentinel.
 */
export interface MatchScreenshot {
  id: string;
  /** Owning match id; `""` = saved but not attached to any match yet. */
  matchId: string;
  fileName: string;
  mimeType: SupportedImageMimeType;
  byteSize: number;
  /** Decoded pixel size when the browser could decode the image; otherwise absent. */
  width?: number;
  height?: number;
  /** ISO-8601 instant. Also the list ordering key (`id` breaks ties). */
  createdAt: string;
  /** The bytes themselves — the only part of this row that is not JSON-safe. */
  blob: Blob;
}

/** `MatchScreenshot` without the bytes: what lists and the UI pass around. */
export type ScreenshotMeta = Omit<MatchScreenshot, "blob">;

export function toScreenshotMeta(row: MatchScreenshot): ScreenshotMeta {
  const { blob, ...meta } = row;
  void blob;
  return meta;
}

/** Ascending by time; `id` only breaks same-millisecond ties. */
export function compareScreenshots(a: ScreenshotMeta, b: ScreenshotMeta): number {
  return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}

/* ------------------------------------------------------------------ */
/* Content sniffing                                                     */
/* ------------------------------------------------------------------ */

/**
 * Signature of a supported format, looked up by magic bytes.
 *
 * The browser-provided `File.type` comes from the file *extension*, which lies
 * often enough to matter (a `.png` that is really a JPEG, an extension-less
 * dump from a clipboard). The bytes are the only trustworthy declaration, so
 * they decide.
 */
const SIGNATURES: { mime: SupportedImageMimeType; ascii?: string; bytes?: number[]; at?: number }[] = [
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/gif", ascii: "GIF8" },
  { mime: "image/bmp", bytes: [0x42, 0x4d] },
  // RIFF....WEBP — the container marker sits at offset 0, the format at 8.
  { mime: "image/webp", ascii: "RIFF" },
];

/** First bytes of the file. Expand `.mime` if grip is added. */
const HEADER_LENGTH = 16;

export function sniffImageType(header: Uint8Array): SupportedImageMimeType | undefined {
  for (const sig of SIGNATURES) {
    if (sig.bytes && !matchesBytes(header, sig.bytes, sig.at ?? 0)) continue;
    if (sig.ascii && !matchesAscii(header, sig.ascii, sig.at ?? 0)) continue;
    if (sig.mime === "image/webp" && !matchesAscii(header, "WEBP", 8)) continue;
    return sig.mime;
  }
  return undefined;
}

function matchesBytes(header: Uint8Array, expected: number[], at: number): boolean {
  if (header.length < at + expected.length) return false;
  return expected.every((b, i) => header[at + i] === b);
}

function matchesAscii(header: Uint8Array, text: string, at: number): boolean {
  return matchesBytes(header, [...text].map((c) => c.charCodeAt(0)), at);
}

/**
 * Offset within the file whose `[0, HEADER_LENGTH)` slice identifies it — in
 * practice always 0, named so the call site does not have to know that.
 */
export const SNIFF_RANGE = { start: 0, length: HEADER_LENGTH } as const;

/* ------------------------------------------------------------------ */
/* Validation                                                           */
/* ------------------------------------------------------------------ */

/** The platform-shaped input: everything `saveScreenshots` needs to judge a file. */
export interface ScreenshotCandidate {
  /** May be empty (paste / canvas blobs arrive without a name). */
  name: string;
  /** May be empty or wrong (extension-derived). The bytes win. */
  type: string;
  size: number;
  blob: Blob;
}

/**
 * Checks that answerable without reading the bytes: presence, emptiness, size
 * ceiling, declared type. Content is checked separately by the service, which
 * can await the header read.
 */
export function validateScreenshotCandidate(file: ScreenshotCandidate): string[] {
  const errors: string[] = [];
  if (!file) return ["没有选择文件"];
  if (file.size <= 0) errors.push(`${quoted(file)}是空文件`);
  if (file.size > MAX_SCREENSHOT_BYTES) {
    errors.push(
      `${quoted(file)}超过 ${formatBytes(MAX_SCREENSHOT_BYTES)} 上限（实际 ${formatBytes(file.size)}）`,
    );
  }
  if (file.type && !isSupportedImageType(file.type)) {
    errors.push(`不支持的图片格式：${file.type}（支持 PNG / JPEG / WebP / GIF / BMP）`);
  }
  return errors;
}

export function isSupportedImageType(type: string): type is SupportedImageMimeType {
  return (SUPPORTED_IMAGE_MIME_TYPES as readonly string[]).includes(type);
}

/** The name to display for a file that may not have one (paste / canvas blobs). */
export function safeFileName(file: Pick<ScreenshotCandidate, "name"> | string | undefined): string {
  const name = typeof file === "string" ? file : (file?.name ?? "");
  return name.trim() || "未命名图片";
}

function quoted(file: ScreenshotCandidate): string {
  return `「${safeFileName(file)}」`;
}

/** Trim to the stored length. A file name from a picker has no path in it. */
export function normalizeFileName(name: string | undefined, mimeType: SupportedImageMimeType): string {
  const base = (name ?? "").trim();
  if (base.length === 0) return unnamedFileName(mimeType);
  return base.length > MAX_SCREENSHOT_NAME_LENGTH
    ? `${base.slice(0, MAX_SCREENSHOT_NAME_LENGTH - 1)}…`
    : base;
}

function unnamedFileName(mimeType: SupportedImageMimeType): string {
  return `未命名截图.${mimeType.replace("image/", "")}`;
}

const KB = 1024;

/** Human size for the UI. Matches what `Data` page tiles read like. */
export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes)) return "—";
  if (bytes < KB) return `${bytes} B`;
  if (bytes < KB * KB) return `${round1(bytes / KB)} KB`;
  return `${round1(bytes / (KB * KB))} MB`;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
