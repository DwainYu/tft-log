import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, renderHook, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../test/render";
import { resetDatabase } from "../../test/db-helper";
import { ReviewForm } from "./ReviewForm";
import { getReviewDraft, saveReviewDraft } from "../../services/review-service";
import { useReviewDraftAutosave } from "./use-review-draft";
import type { ReviewDraft } from "../../domain/types";

/**
 * The autosave writes from a debounce timer, from `pagehide` / visibility
 * changes, and from the unmount cleanup — none of which anybody awaits. Before
 * this file existed, a write that resolved after its component was gone still
 * called `setSavedAt`, and Vitest turned that into
 * `ReferenceError: window is not defined` once the jsdom environment was torn
 * down: every assertion green, `npm test` exiting 1.
 *
 * Vitest globals are off here (see `src/test/setup.ts`), so `window` is only
 * removed by the environment teardown at the end of a file. Each test below
 * recreates that moment deterministically instead of gambling on the clock:
 * drop the `window` global while a write is in flight, then hand control back to
 * the event loop and restore it.
 */

// Vitest runs the write spy on Node, but this project installs no @types/node.
declare const process: {
  on(event: "unhandledRejection", listener: (reason: unknown) => void): void;
  off(event: "unhandledRejection", listener: (reason: unknown) => void): void;
};

// Wrapping the real service keeps every other export (and every other test in
// the file) talking to IndexedDB for real; only a single test overrides it.
vi.mock("../../services/review-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/review-service")>();
  return { ...actual, saveReviewDraft: vi.fn(actual.saveReviewDraft) };
});

const save = saveReviewDraft as unknown as ReturnType<typeof vi.fn>;

const MISTAKE_LABEL = /这局最大的问题是什么/;

/** One macrotask: enough for a queued IndexedDB callback to run. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Collect rejections that escape while the test body is still running. Probed
 * against this setup: Node's `unhandledRejection` fires in-test, jsdom's
 * `window` `unhandledrejection` event does not.
 */
function trackUnhandled(): { seen: unknown[]; stop: () => void } {
  const seen: unknown[] = [];
  const listener = (reason: unknown) => seen.push(reason);
  process.on("unhandledRejection", listener);
  return { seen, stop: () => process.off("unhandledRejection", listener) };
}

/** Emulate the end of a test file: `window` gone, pending writes still landing. */
async function withWindowRemoved(work: () => void): Promise<void> {
  const saved = globalThis.window;
  // @ts-expect-error only ever removed for a few macrotasks, then restored
  delete globalThis.window;
  try {
    work();
    for (let i = 0; i < 4; i += 1) await tick();
  } finally {
    globalThis.window = saved;
  }
}

const draftOf = (matchId: string, biggestMistake: string): ReviewDraft => ({
  matchId,
  input: { biggestMistake },
  createdAt: "2026-10-14T04:00:00.000Z",
  updatedAt: "2026-10-14T04:00:00.000Z",
});

const renderForm = (matchId: string) =>
  renderWithProviders(<ReviewForm matchId={matchId} onSave={() => {}} />);

const typeMistake = (value: string) =>
  fireEvent.change(screen.getByLabelText(MISTAKE_LABEL), { target: { value } });

beforeEach(resetDatabase);
afterEach(() => {
  // Keeps the delegation to the real service; only drops recorded calls.
  save.mockClear();
});

describe("useReviewDraftAutosave · 卸载后的状态更新", () => {
  it("写盘在卸载之后才落地时，不再碰 React 状态", async () => {
    const { seen, stop } = trackUnhandled();
    const { unmount } = renderForm("m-late");
    typeMistake("决赛圈主 C 被切");

    unmount();
    await withWindowRemoved(() => undefined);
    stop();

    expect(seen.map(String)).toEqual([]);
  });

  it("卸载 flush 仍然真的把最后一次输入写进草稿", async () => {
    const { unmount } = renderForm("m-unmount");
    typeMistake("3-2 该上 8 级");

    // 离开得比 700ms 防抖还快 —— 这条写入只能由卸载清理发出
    unmount();
    await waitFor(async () => {
      const draft = await getReviewDraft("m-unmount");
      expect(draft?.input.biggestMistake).toBe("3-2 该上 8 级");
    });
  });

  it("stop() 之后卸载，不得复活刚刚丢弃的草稿", async () => {
    const { result, unmount } = renderHook(() =>
      useReviewDraftAutosave({ matchId: "m-stop", input: { biggestMistake: "已经交掉的复盘" } }),
    );
    result.current.stop();
    unmount();
    for (let i = 0; i < 4; i += 1) await tick();

    expect(await getReviewDraft("m-stop")).toBeUndefined();
  });
});

describe("useReviewDraftAutosave · 后台写入失败", () => {
  it("不产生无人处理的 rejection，也不冒充「已保存」", async () => {
    const reason = new Error("IndexedDB 配额已满");
    save.mockImplementationOnce(() => Promise.reject(reason));
    const reported = vi.spyOn(console, "error").mockImplementation(() => {});
    const { seen, stop } = trackUnhandled();

    renderForm("m-fail");
    typeMistake("点了保存却像没反应");
    await waitFor(() => expect(reported).toHaveBeenCalled(), { timeout: 3000 });
    stop();

    expect(seen).toEqual([]);
    expect(reported).toHaveBeenCalledWith(expect.stringContaining("[review-draft]"), reason);
    // 写入失败过：表单上不能出现「最近保存」的时间戳
    expect(screen.queryByText(/最近保存/)).not.toBeInTheDocument();
    reported.mockRestore();
  });

  it("显式 await 的 flush 照样把失败抛给调用方", async () => {
    const reason = new Error("写入被拒绝");
    save.mockImplementationOnce(() => Promise.reject(reason));

    const { result } = renderHook(() =>
      useReviewDraftAutosave({ matchId: "m-flush", input: { biggestMistake: "x" } }),
    );
    await expect(result.current.flush()).rejects.toBe(reason);
  });
});

describe("useReviewDraftAutosave · 正常路径不回归", () => {
  it("停手后自动保存，并在表单上给出最近保存时间", async () => {
    renderForm("m-debounce");
    typeMistake("经济没卡好");

    await waitFor(() => expect(screen.getByText(/最近保存/)).toBeInTheDocument(), { timeout: 3000 });
    const draft = await getReviewDraft("m-debounce");
    expect(draft?.input.biggestMistake).toBe("经济没卡好");
  });

  it("flush() 成功时记下时间戳，供「已自动保存」提示使用", async () => {
    const { result } = renderHook(() =>
      useReviewDraftAutosave({ matchId: "m-ok", input: { biggestMistake: "提前上人口" } }),
    );
    expect(result.current.savedAt).toBeNull();

    await act(async () => {
      await result.current.flush();
    });

    expect(result.current.savedAt).not.toBeNull();
    expect((await getReviewDraft("m-ok"))?.input.biggestMistake).toBe("提前上人口");
  });

  it("有草稿时表单按草稿打开（恢复入口不变）", () => {
    renderWithProviders(
      <ReviewForm
        matchId="m-restore"
        onSave={() => {}}
        draft={draftOf("m-restore", "站脸被切")}
      />,
    );

    expect(screen.getByDisplayValue("站脸被切")).toBeInTheDocument();
  });
});
