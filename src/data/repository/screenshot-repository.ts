import type { MatchScreenshot } from "../../domain/screenshot/screenshot";
import { compareScreenshots } from "../../domain/screenshot/screenshot";
import { db } from "../db";

/**
 * The only layer that touches the `screenshots` table.
 *
 * Ordering lives here rather than in an index: "newest / oldest inside one
 * match" is a list concern and the per-match cardinality is a handful of rows.
 * Adding a `[matchId+createdAt]` compound index to save sorting five rows would
 * be worse for every other access path.
 */
export interface ScreenshotRepository {
  add(row: MatchScreenshot): Promise<MatchScreenshot>;
  get(id: string): Promise<MatchScreenshot | undefined>;
  listByMatch(matchId: string): Promise<MatchScreenshot[]>;
  listUnattached(): Promise<MatchScreenshot[]>;
  setMatchId(id: string, matchId: string): Promise<void>;
  remove(id: string): Promise<void>;
  removeByMatch(matchId: string): Promise<void>;
  clear(): Promise<void>;
  countByMatch(matchId: string): Promise<number>;
  /** Bytes held by the whole library — `Blob.size`, never the encoded length of anything. */
  totalBytes(): Promise<number>;
  count(): Promise<number>;
}

export const screenshotRepository: ScreenshotRepository = {
  async add(row) {
    await db.screenshots.add(row);
    return row;
  },
  async get(id) {
    return db.screenshots.get(id);
  },
  async listByMatch(matchId) {
    const rows = await db.screenshots.where("matchId").equals(matchId).toArray();
    return rows.sort(compareScreenshots);
  },
  async listUnattached() {
    const rows = await db.screenshots.where("matchId").equals("").toArray();
    return rows.sort(compareScreenshots);
  },
  async setMatchId(id, matchId) {
    await db.screenshots.update(id, { matchId });
  },
  async remove(id) {
    await db.screenshots.delete(id);
  },
  async removeByMatch(matchId) {
    await db.screenshots.where("matchId").equals(matchId).delete();
  },
  async clear() {
    await db.screenshots.clear();
  },
  async countByMatch(matchId) {
    return db.screenshots.where("matchId").equals(matchId).count();
  },
  async totalBytes() {
    let total = 0;
    await db.screenshots.each((row) => {
      total += row.byteSize;
    });
    return total;
  },
  async count() {
    return db.screenshots.count();
  },
};
