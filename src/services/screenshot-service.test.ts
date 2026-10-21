import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteScreenshot,
  deleteAllScreenshots,
  getScreenshotBlob,
  listScreenshots,
  listUnattachedScreenshots,
  removeMatchScreenshots,
  saveScreenshots,
  screenshotStorage,
  setScreenshotMatch,
} from "./screenshot-service";
import { addMatch, deleteMatch, listMatches } from "./match-service";
import { buildSnapshot, importSnapshot, matchesToCsv, parseSnapshot } from "./export-service";
import { MAX_SCREENSHOT_BYTES, type ScreenshotCandidate } from "../domain/screenshot/screenshot";
import { db } from "../data/db";
import { resetDatabase } from "../test/db-helper";

/**
 * The lifecycle that has to hold before any recognition work is even thinkable:
 * bytes survive a reload, a bad file never lands, and no screenshot is ever
 * reachable through a match that no longer exists.
 */

beforeEach(resetDatabase);

const PNG_BYTES = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_BYTES = [0xff, 0xd8, 0xff, 0xe0];

/**
 * A candidate whose declared size is independent of its real bytes: the 10 MB
 * ceiling can then be exercised without allocating 10 MB in a test runner.
 */
function candidate(
  bytes: number[] = PNG_BYTES,
  over: Partial<ScreenshotCandidate> = {},
): ScreenshotCandidate {
  return {
    name: "结算.png",
    type: "image/png",
    size: 2048,
    blob: new Blob([new Uint8Array(bytes)], { type: "image/png" }),
    ...over,
  };
}

async function newMatch(placement = "3") {
  return addMatch({ playedAt: "2026-10-15T20:30", placement });
}

describe("screenshot service — save / read / delete", () => {
  it("saves a screenshot onto a match and reads its metadata back", async () => {
    const m = await newMatch();
    const result = await saveScreenshots(m.id, [candidate()]);
    expect(result.failed).toEqual([]);

    const list = await listScreenshots(m.id);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      matchId: m.id,
      fileName: "结算.png",
      mimeType: "image/png",
      byteSize: 2048,
    });
    // Bytes never travel with a list — this is the point of the metadata view.
    expect("blob" in list[0]).toBe(false);
  });

  it("round-trips the exact bytes", async () => {
    const m = await newMatch();
    const [saved] = (await saveScreenshots(m.id, [candidate()])).saved;
    const blob = await getScreenshotBlob(saved.id);
    expect(blob.type).toBe("image/png");
    expect([...(await new Uint8Array(await blob.arrayBuffer()))]).toEqual(PNG_BYTES.slice(0, 8));
  });

  it("survives a close + reopen, which is what a page reload does", async () => {
    const m = await newMatch();
    const [saved] = (await saveScreenshots(m.id, [candidate()])).saved;

    await db.close();
    await db.open();

    const list = await listScreenshots(m.id);
    expect(list.map((s) => s.id)).toEqual([saved.id]);
    expect((await getScreenshotBlob(saved.id)).size).toBe(PNG_BYTES.length);
  });

  it("orders edits oldest first and lets several coexist on one match", async () => {
    const m = await newMatch();
    await saveScreenshots(m.id, [candidate(PNG_BYTES, { name: "a.png" })]);
    await saveScreenshots(m.id, [candidate(JPEG_BYTES, { name: "b.jpg", type: "image/jpeg" })]);
    const list = await listScreenshots(m.id);
    expect(list.map((s) => s.fileName)).toEqual(["a.png", "b.jpg"]);
    expect(list.map((s) => s.mimeType)).toEqual(["image/png", "image/jpeg"]);
  });

  it("deletes one screenshot and leaves the rest", async () => {
    const m = await newMatch();
    await saveScreenshots(m.id, [candidate(PNG_BYTES, { name: "a.png" })]);
    const [b] = (await saveScreenshots(m.id, [candidate(PNG_BYTES, { name: "b.png" })])).saved;

    await deleteScreenshot(b.id);

    expect((await listScreenshots(m.id)).map((s) => s.fileName)).toEqual(["a.png"]);
    await expect(getScreenshotBlob(b.id)).rejects.toThrow(/不存在/);
  });

  it("records pixel dimensions when the browser can decode the image", async () => {
    const m = await newMatch();
    vi.stubGlobal("createImageBitmap", async () =>
      ({ width: 1920, height: 1080, close: () => undefined }) as unknown as ImageBitmap,
    );
    try {
      const [saved] = (await saveScreenshots(m.id, [candidate()])).saved;
      expect(saved).toMatchObject({ width: 1920, height: 1080 });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("rejects a file whose header is fine but whose content will not decode", async () => {
    const m = await newMatch();
    vi.stubGlobal("createImageBitmap", async () => {
      throw new Error("decode failed");
    });
    try {
      const result = await saveScreenshots(m.id, [candidate()]);
      expect(result.saved).toEqual([]);
      expect(result.failed[0].reason).toContain("无法解码");
      expect(await listScreenshots(m.id)).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("reports storage usage in rows and bytes", async () => {
    const m = await newMatch();
    await saveScreenshots(m.id, [candidate(PNG_BYTES, { size: 100 }), candidate(PNG_BYTES, { size: 300 })]);
    expect(await screenshotStorage()).toEqual({ count: 2, bytes: 400 });
  });
});

describe("screenshot service — rejected files", () => {
  it("rejects content whose bytes are not an image, even when the name says png", async () => {
    const m = await newMatch();
    const result = await saveScreenshots(m.id, [
      candidate([0x25, 0x50, 0x44, 0x46], { name: "其实是pdf.png" }),
    ]);
    expect(result.saved).toEqual([]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].name).toBe("其实是pdf.png");
    expect(result.failed[0].reason).toContain("不是支持的图片");
    expect(await listScreenshots(m.id)).toEqual([]);
  });

  it("rejects an empty file", async () => {
    const m = await newMatch();
    const result = await saveScreenshots(m.id, [candidate(PNG_BYTES, { size: 0 })]);
    expect(result.failed[0].reason).toContain("空文件");
    expect(await listScreenshots(m.id)).toEqual([]);
  });

  it("rejects a file over the per-file ceiling", async () => {
    const m = await newMatch();
    const result = await saveScreenshots(m.id, [
      candidate(PNG_BYTES, { size: MAX_SCREENSHOT_BYTES + 1 }),
    ]);
    expect(result.failed[0].reason).toContain("超过 10 MB 上限");
    expect(await listScreenshots(m.id)).toEqual([]);
  });

  it("rejects an unsupported declared type before touching storage", async () => {
    const m = await newMatch();
    const result = await saveScreenshots(m.id, [candidate(PNG_BYTES, { type: "image/heic" })]);
    expect(result.failed[0].reason).toContain("不支持的图片格式");
    expect(await listScreenshots(m.id)).toEqual([]);
  });

  it("keeps the good half of a batch when one file is bad", async () => {
    const m = await newMatch();
    const result = await saveScreenshots(m.id, [
      candidate(PNG_BYTES, { name: "good.png" }),
      candidate([0x00, 0x01], { name: "bad.png" }),
    ]);
    expect(result.saved.map((s) => s.fileName)).toEqual(["good.png"]);
    expect(result.failed.map((f) => f.name)).toEqual(["bad.png"]);
  });

  it("refuses to save onto a match that does not exist", async () => {
    await expect(saveScreenshots("ghost-match", [candidate()])).rejects.toThrow(/不存在/);
    expect(await screenshotStorage()).toEqual({ count: 0, bytes: 0 });
  });
});

describe("screenshot service — association", () => {
  it("saves unattached when no match is given and lists them separately", async () => {
    const m = await newMatch();
    const [loose] = (await saveScreenshots(undefined, [candidate(PNG_BYTES, { name: "loose.png" })])).saved;

    expect(loose.matchId).toBe("");
    expect((await listUnattachedScreenshots()).map((s) => s.fileName)).toEqual(["loose.png"]);
    expect(await listScreenshots(m.id)).toEqual([]);
  });

  it("attaches an unattached screenshot to a match without copying bytes", async () => {
    const m = await newMatch();
    const [loose] = (await saveScreenshots(undefined, [candidate()])).saved;

    await setScreenshotMatch(loose.id, m.id);

    expect((await listScreenshots(m.id)).map((s) => s.id)).toEqual([loose.id]);
    expect(await listUnattachedScreenshots()).toEqual([]);
    expect((await getScreenshotBlob(loose.id)).size).toBe(PNG_BYTES.length);
  });

  it("detaches a screenshot back into the unattached pool", async () => {
    const m = await newMatch();
    const [shot] = (await saveScreenshots(m.id, [candidate()])).saved;

    await setScreenshotMatch(shot.id);

    expect(await listScreenshots(m.id)).toEqual([]);
    expect((await listUnattachedScreenshots()).map((s) => s.id)).toEqual([shot.id]);
    expect((await getScreenshotBlob(shot.id)).size).toBe(PNG_BYTES.length);
  });

  it("refuses to attach to a match that is gone rather than orphaning the row", async () => {
    const m = await newMatch();
    const [loose] = (await saveScreenshots(undefined, [candidate()])).saved;
    await deleteMatch(m.id);

    await expect(setScreenshotMatch(loose.id, m.id)).rejects.toThrow(/不存在/);
    expect((await listUnattachedScreenshots()).map((s) => s.id)).toEqual([loose.id]);
  });
});

describe("screenshot service — lifecycle of a deleted match", () => {
  it("cascades: deleting a match removes its screenshots and nothing else", async () => {
    const doomed = await newMatch("2");
    const survivor = await newMatch("5");
    await saveScreenshots(doomed.id, [candidate(PNG_BYTES, { name: "doomed.png" })]);
    await saveScreenshots(survivor.id, [candidate(PNG_BYTES, { name: "kept.png" })]);
    await saveScreenshots(undefined, [candidate(PNG_BYTES, { name: "loose.png" })]);

    await deleteMatch(doomed.id);

    expect(await listScreenshots(doomed.id)).toEqual([]);
    expect((await listScreenshots(survivor.id)).map((s) => s.fileName)).toEqual(["kept.png"]);
    expect((await listUnattachedScreenshots()).map((s) => s.fileName)).toEqual(["loose.png"]);
    expect(await screenshotStorage()).toEqual({ count: 2, bytes: 4096 });
  });

  it("clears every screenshot alongside the wipe-all path", async () => {
    const m = await newMatch();
    await saveScreenshots(m.id, [candidate()]);
    await removeMatchScreenshots(m.id);
    expect(await screenshotStorage()).toEqual({ count: 0, bytes: 0 });

    await saveScreenshots(undefined, [candidate()]);
    await deleteAllScreenshots();
    expect(await screenshotStorage()).toEqual({ count: 0, bytes: 0 });
  });
});

describe("screenshot service — failure leaves storage untouched", () => {
  it("reports a quota failure and persists nothing", async () => {
    const m = await newMatch();
    const boom = new Error("quota");
    boom.name = "QuotaExceededError";
    const spy = vi.spyOn(db.screenshots, "add").mockRejectedValueOnce(boom);

    try {
      const result = await saveScreenshots(m.id, [candidate()]);
      expect(result.saved).toEqual([]);
      expect(result.failed[0].reason).toContain("浏览器存储空间不足");
    } finally {
      spy.mockRestore();
    }

    expect(await screenshotStorage()).toEqual({ count: 0, bytes: 0 });
    // Nothing half-written: the row was never added, so there is nothing to repair.
    expect(await db.screenshots.count()).toBe(0);
  });
});

describe("screenshot service — existing data flows stay intact", () => {
  it("does not change the JSON snapshot, CSV columns or the import round trip", async () => {
    const m = await newMatch("4");
    await saveScreenshots(m.id, [candidate()]);

    const snapshot = await buildSnapshot("all");
    expect(Object.keys(snapshot).sort()).toEqual([
      "app",
      "decisions",
      "exportedAt",
      "matches",
      "reviews",
      "schemaVersion",
      "trainingGoals",
      "trainingSessions",
    ]);
    expect(snapshot.app).toBe("tft-training-log");

    // Re-importing the very file we just exported must not move anything.
    const report = await importSnapshot(parseSnapshot(JSON.stringify(snapshot)));
    expect(report.matches).toBe(1);
    expect(await listMatches()).toHaveLength(1);

    const csv = matchesToCsv(snapshot.matches).split("\n");
    expect(csv[0]).toBe(
      "id,played_at,placement,composition,final_level,final_health,duration_seconds,primary_mistake,reviewed,opening_plan,encounter_id,notes,session_id",
    );
    expect(csv).toHaveLength(2);
  });

  it("leaves the match itself byte-identical after screenshots are added", async () => {
    const m = await newMatch("1");
    const before = await db.matches.get(m.id);
    await saveScreenshots(m.id, [candidate()]);
    expect(await db.matches.get(m.id)).toEqual(before);
  });
});
