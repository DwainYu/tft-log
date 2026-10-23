import { matchRepository } from "../data/repository/match-repository";
import { screenshotRepository } from "../data/repository/screenshot-repository";
import {
  SCREENSHOT_USAGE_WARN_BYTES,
  SNIFF_RANGE,
  SUPPORTED_IMAGE_MIME_TYPES,
  formatBytes,
  normalizeFileName,
  safeFileName,
  sniffImageType,
  toScreenshotMeta,
  validateScreenshotCandidate,
  type MatchScreenshot,
  type ScreenshotCandidate,
  type ScreenshotMeta,
  type SupportedImageMimeType,
} from "../domain/screenshot/screenshot";
import { NotFoundError, ValidationError } from "../lib/errors";
import { createId, nowIso } from "../lib/utils";

/**
 * Everything the UI is allowed to do with 结算截图.
 *
 * Consistency strategy — deliberately the boring one: metadata and bytes live
 * in *one* Dexie row, so a row exists or it does not. There is no intermediate
 * state where the gallery lists an image whose bytes failed to land, and no
 * cleanup phase that could be interrupted. The only repair routine that exists
 * is "delete the row", which is also what a failed write already did.
 *
 * Nothing here recognises anything about the picture. Phase 2 can add that
 * behind the same rows without touching this file's shape.
 */

export interface SaveScreenshotsResult {
  saved: ScreenshotMeta[];
  /** One entry per rejected file, so a batch never fails as a whole. */
  failed: { name: string; reason: string }[];
  /** Set once the whole library crosses the soft size threshold. */
  warning?: string;
}

export interface ScreenshotStorage {
  count: number;
  bytes: number;
}

/* ------------------------------------------------------------------ */
/* Read                                                                */
/* ------------------------------------------------------------------ */

export async function listScreenshots(matchId: string): Promise<ScreenshotMeta[]> {
  return (await screenshotRepository.listByMatch(matchId)).map(toScreenshotMeta);
}

/** Saved but not attached to any match yet. */
export async function listUnattachedScreenshots(): Promise<ScreenshotMeta[]> {
  return (await screenshotRepository.listUnattached()).map(toScreenshotMeta);
}

/**
 * The bytes, on demand. Lists never carry them — a preview asks for one image
 * at a time and hands the result to an object URL that outlives nothing.
 */
export async function getScreenshotBlob(id: string): Promise<Blob> {
  const row = await screenshotRepository.get(id);
  if (!row) throw new NotFoundError("截图", id);
  return row.blob;
}

export async function screenshotStorage(): Promise<ScreenshotStorage> {
  const [count, bytes] = await Promise.all([
    screenshotRepository.count(),
    screenshotRepository.totalBytes(),
  ]);
  return { count, bytes };
}

/* ------------------------------------------------------------------ */
/* Write                                                               */
/* ------------------------------------------------------------------ */

/**
 * Save one or more images, optionally straight onto a match.
 *
 * Per-file failures are collected rather than thrown: dropping one bad file out
 * of five should still save the other four, and the caller gets a per-file
 * reason to show. `matchId` is validated against the real match table, so no
 * screenshot can be attached to a record that does not exist.
 */
export async function saveScreenshots(
  matchId: string | undefined,
  files: readonly ScreenshotCandidate[],
): Promise<SaveScreenshotsResult> {
  const normalizedMatchId = await assertMatchId(matchId);

  const saved: ScreenshotMeta[] = [];
  const failed: { name: string; reason: string }[] = [];

  for (const file of files) {
    try {
      saved.push(await saveOne(normalizedMatchId, file));
    } catch (err) {
      failed.push({ name: safeFileName(file), reason: failureReason(err) });
    }
  }

  const storage = await screenshotStorage();
  const warning =
    storage.bytes > SCREENSHOT_USAGE_WARN_BYTES
      ? `截图已占用 ${formatBytes(storage.bytes)}，接近浏览器存储上限。删除不用的截图可以释放空间。`
      : undefined;

  return { saved, failed, warning };
}

async function saveOne(matchId: string, file: ScreenshotCandidate): Promise<ScreenshotMeta> {
  const structural = validateScreenshotCandidate(file);
  if (structural.length > 0) throw new ValidationError(structural);

  const { mimeType, width, height } = await inspectContent(file);
  const row: MatchScreenshot = {
    id: createId(),
    matchId,
    fileName: normalizeFileName(file.name, mimeType),
    mimeType,
    byteSize: file.size,
    width,
    height,
    createdAt: nowIso(),
    blob: file.blob,
  };

  await screenshotRepository.add(row);
  return toScreenshotMeta(row);
}

/**
 * What the file *is*, judged from its bytes.
 *
 * Two independent checks, because either alone leaves a hole: the header says
 * which container it is, and a real decode says whether those bytes are an
 * image at all (a truncated PNG has a perfect header). Where the browser cannot
 * decode (test runners, a few engines) the header verdict stands on its own
 * rather than blocking the save.
 */
async function inspectContent(
  file: ScreenshotCandidate,
): Promise<{ mimeType: SupportedImageMimeType; width?: number; height?: number }> {
  const header = await readHeaderBytes(file.blob, SNIFF_RANGE.length);
  const mimeType = sniffImageType(header);
  if (!mimeType) {
    throw new ValidationError([
      `文件内容不是支持的图片（${SUPPORTED_IMAGE_MIME_TYPES.map((m) => m.replace("image/", "")).join(" / ")}）`,
    ]);
  }
  return { mimeType, ...(await decodeSize(file.blob)) };
}

async function readHeaderBytes(blob: Blob, length: number): Promise<Uint8Array> {
  const slice = blob.slice(SNIFF_RANGE.start, SNIFF_RANGE.start + length);
  return new Uint8Array(await slice.arrayBuffer());
}

async function decodeSize(blob: Blob): Promise<{ width?: number; height?: number }> {
  // Absent in jsdom and older engines — there the header verdict is final.
  if (typeof createImageBitmap !== "function") return {};
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(blob);
    return { width: bitmap.width, height: bitmap.height };
  } catch {
    throw new ValidationError(["图片内容已损坏，浏览器无法解码"]);
  } finally {
    bitmap?.close();
  }
}

/* ------------------------------------------------------------------ */
/* Association                                                         */
/* ------------------------------------------------------------------ */

/**
 * Move a screenshot onto a match (`matchId === undefined` returns it to the
 * unattached pool). Re-attaching is how "save now, file later" works: the row
 * survives being detached, nothing is copied and no bytes move.
 */
export async function setScreenshotMatch(id: string, matchId?: string): Promise<void> {
  const row = await screenshotRepository.get(id);
  if (!row) throw new NotFoundError("截图", id);
  await screenshotRepository.setMatchId(id, await assertMatchId(matchId));
}

/* ------------------------------------------------------------------ */
/* Delete                                                              */
/* ------------------------------------------------------------------ */

export async function deleteScreenshot(id: string): Promise<void> {
  await screenshotRepository.remove(id);
}

/**
 * Called from `deleteMatch` so a deleted match never leaves images behind that
 * nothing can list. `deleteScreenshot` and this both remove whole rows, so a
 * screenshot is either reachable or gone — never orphaned bytes.
 */
export async function removeMatchScreenshots(matchId: string): Promise<void> {
  await screenshotRepository.removeByMatch(matchId);
}

/** Data page escape hatch. `wipeAll` routes through here too. */
export async function deleteAllScreenshots(): Promise<void> {
  await screenshotRepository.clear();
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/**
 * `undefined` -> unattached. A named match must exist: attaching to a deleted
 * or typo'd id would strand the row behind a match nobody can open.
 */
async function assertMatchId(matchId: string | undefined): Promise<string> {
  const trimmed = matchId?.trim();
  if (!trimmed) return "";
  if (!(await matchRepository.get(trimmed))) throw new NotFoundError("对局", trimmed);
  return trimmed;
}

/**
 * `ValidationError` carries the human-readable reasons in `errors`; its
 * `message` is a generic stub. A per-file failure list is useless without the
 * real reasons, so unwrap rather than surface "输入不合法".
 *
 * A full disk is the one failure worth naming in our own words: images are by
 * far the largest thing the app stores, so it is the realistic one, and the
 * browser's own "QuotaExceededError" tells the player nothing about what to do.
 */
function failureReason(err: unknown): string {
  if (err instanceof ValidationError) return err.errors.join("；");
  if (isQuotaError(err)) {
    return "浏览器存储空间不足，截图未保存。请在「数据」页删除不用的截图后重试。";
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

function isQuotaError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  // Firefox spells it differently; both mean "no room left in this origin".
  return err.name === "QuotaExceededError" || err.name === "NS_ERROR_DOM_QUOTA_REACHED";
}
