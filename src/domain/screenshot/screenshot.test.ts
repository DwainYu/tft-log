import { describe, expect, it } from "vitest";
import {
  MAX_SCREENSHOT_BYTES,
  SCREENSHOT_USAGE_WARN_BYTES,
  compareScreenshots,
  formatBytes,
  isSupportedImageType,
  normalizeFileName,
  safeFileName,
  sniffImageType,
  toScreenshotMeta,
  validateScreenshotCandidate,
  type MatchScreenshot,
} from "./screenshot";

/**
 * Pure layer tests: the decisions that protect storage before anything reaches
 * Dexie — size ceiling, declared type, and above all the *bytes*, which are the
 * only trustworthy declaration of what a file really is.
 */

/** Minimal header for a recognised format, padded to the sniff window. */
function header(...bytes: number[]): Uint8Array {
  const out = new Uint8Array(16);
  out.set(bytes, 0);
  return out;
}

const candidate = (over: Partial<{ name: string; type: string; size: number }> = {}) => ({
  name: "结算.png",
  type: "image/png",
  size: 2048,
  blob: new Blob([], { type: "image/png" }),
  ...over,
});

describe("sniffImageType", () => {
  it("recognises every supported format by magic bytes", () => {
    expect(sniffImageType(header(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(sniffImageType(header(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffImageType(header(0x47, 0x49, 0x46, 0x38))).toBe("image/gif");
    expect(sniffImageType(header(0x42, 0x4d, 0x36))).toBe("image/bmp");

    const webp = new Uint8Array(16);
    webp.set([...("RIFF")].map((c) => c.charCodeAt(0)), 0);
    webp.set([...("WEBP")].map((c) => c.charCodeAt(0)), 8);
    expect(sniffImageType(webp)).toBe("image/webp");
  });

  it("returns undefined for non-image content that claims to be an image", () => {
    // A rename does not make a PDF a picture.
    expect(sniffImageType(header(0x25, 0x50, 0x44, 0x46))).toBeUndefined();
    expect(sniffImageType(header())).toBeUndefined();
    expect(sniffImageType(new Uint8Array(0))).toBeUndefined();
  });

  it("does not mistake a RIFF audio file for WebP", () => {
    const wave = new Uint8Array(16);
    wave.set([...("RIFF")].map((c) => c.charCodeAt(0)), 0);
    wave.set([...("WAVE")].map((c) => c.charCodeAt(0)), 8);
    expect(sniffImageType(wave)).toBeUndefined();
  });
});

describe("validateScreenshotCandidate", () => {
  it("accepts a normal screenshot", () => {
    expect(validateScreenshotCandidate(candidate())).toEqual([]);
  });

  it("rejects an empty file", () => {
    expect(validateScreenshotCandidate(candidate({ size: 0 }))).toEqual(["「结算.png」是空文件"]);
  });

  it("rejects a file over the per-file ceiling", () => {
    const errors = validateScreenshotCandidate(candidate({ size: MAX_SCREENSHOT_BYTES + 1 }));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("超过 10 MB 上限");
  });

  it("accepts a file exactly at the ceiling", () => {
    expect(validateScreenshotCandidate(candidate({ size: MAX_SCREENSHOT_BYTES }))).toEqual([]);
  });

  it("rejects a declared type outside the supported set", () => {
    expect(validateScreenshotCandidate(candidate({ type: "image/svg+xml" }))).toEqual([
      "不支持的图片格式：image/svg+xml（支持 PNG / JPEG / WebP / GIF / BMP）",
    ]);
    expect(validateScreenshotCandidate(candidate({ type: "application/pdf" }))[0]).toContain(
      "不支持的图片格式",
    );
  });

  it("lets an undeclared type through so the bytes can decide", () => {
    expect(validateScreenshotCandidate(candidate({ type: "" }))).toEqual([]);
  });
});

describe("isSupportedImageType", () => {
  it("accepts exactly the five supported containers", () => {
    for (const type of ["image/png", "image/jpeg", "image/webp", "image/gif", "image/bmp"]) {
      expect(isSupportedImageType(type)).toBe(true);
    }
    expect(isSupportedImageType("image/heic")).toBe(false);
    expect(isSupportedImageType("text/plain")).toBe(false);
  });
});

describe("normalizeFileName", () => {
  it("keeps a normal name", () => {
    expect(normalizeFileName("结算.png", "image/png")).toBe("结算.png");
  });

  it("falls back to a generated name when there is none", () => {
    expect(normalizeFileName("", "image/png")).toBe("未命名截图.png");
    expect(normalizeFileName(undefined, "image/jpeg")).toBe("未命名截图.jpeg");
  });

  it("truncates very long names instead of storing them whole", () => {
    const long = normalizeFileName("a".repeat(200), "image/png");
    expect(long).toHaveLength(120);
    expect(long.endsWith("…")).toBe(true);
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeFileName("  结算.png  ", "image/png")).toBe("结算.png");
  });
});

describe("safeFileName", () => {
  it("never yields an empty label", () => {
    expect(safeFileName({ name: "x.png" })).toBe("x.png");
    expect(safeFileName({ name: "  " })).toBe("未命名图片");
    expect(safeFileName(undefined)).toBe("未命名图片");
  });
});

describe("toScreenshotMeta", () => {
  it("drops the bytes so lists never carry them", () => {
    const row: MatchScreenshot = {
      id: "s1",
      matchId: "m1",
      fileName: "a.png",
      mimeType: "image/png",
      byteSize: 10,
      createdAt: "2026-10-15T10:00:00.000Z",
      blob: new Blob(["x"]),
    };
    const meta = toScreenshotMeta(row);
    expect(meta).toEqual({
      id: "s1",
      matchId: "m1",
      fileName: "a.png",
      mimeType: "image/png",
      byteSize: 10,
      createdAt: "2026-10-15T10:00:00.000Z",
    });
    expect("blob" in meta).toBe(false);
  });
});

describe("compareScreenshots", () => {
  it("orders by time and breaks ties with the id", () => {
    const base = {
      id: "a",
      matchId: "m",
      fileName: "f",
      mimeType: "image/png" as const,
      byteSize: 1,
      createdAt: "",
    };
    const rows = [
      { ...base, id: "b", createdAt: "2026-10-15T10:00:02.000Z" },
      { ...base, id: "a", createdAt: "2026-10-15T10:00:01.000Z" },
      { ...base, id: "c", createdAt: "2026-10-15T10:00:01.000Z" },
    ];
    expect([...rows].sort(compareScreenshots).map((r) => r.id)).toEqual(["a", "c", "b"]);
  });
});

describe("formatBytes", () => {
  it("scales through the units", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(1_500_000)).toBe("1.4 MB");
    expect(formatBytes(undefined)).toBe("—");
  });
});

describe("the soft usage threshold", () => {
  it("is a warning level, not a second size limit", () => {
    expect(SCREENSHOT_USAGE_WARN_BYTES).toBeGreaterThan(MAX_SCREENSHOT_BYTES);
  });
});
