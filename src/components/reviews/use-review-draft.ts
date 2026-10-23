import { useCallback, useEffect, useRef, useState } from "react";
import type { OpeningPlan, ReviewDraft } from "../../domain/types";
import type { ReviewInput } from "../../domain/review/review";
import { saveReviewDraft } from "../../services/review-service";

/** How long the form waits after the last keystroke before it writes. */
export const DRAFT_DEBOUNCE_MS = 700;

/**
 * Autosaves whatever is being typed in the 复盘 form.
 *
 * Three things have to hold for this to feel reliable rather than creepy:
 *
 * 1. Writes are debounced — typing fast must not queue hundreds of IndexedDB
 *    transactions (perceived input lag).
 * 2. A pending write is flushed when the player leaves by any route: closing
 *    the tab, backgrounding it, navigating away, or submitting the form.
 *    A debounce alone would lose up to `DRAFT_DEBOUNCE_MS` of typing. Those
 *    flushes are fire-and-forget: the write still lands, and a rejected one is
 *    reported rather than left to escape as an unhandled rejection.
 * 3. The saved payload is read from a ref, so the flush always writes the
 *    newest value even if it fires before a re-render lands.
 */
export function useReviewDraftAutosave({
  matchId,
  input,
  openingPlan,
  enabled = true,
}: {
  matchId: string;
  input: ReviewInput;
  openingPlan?: OpeningPlan;
  /** Off while the form is being submitted, so nothing races the real save. */
  enabled?: boolean;
}): {
  /** Timestamp of the last successful write, for a "已自动保存" hint. */
  savedAt: number | null;
  /** Write immediately — call before submitting. */
  flush: () => Promise<void>;
  /**
   * Stop autosaving for good. Called right before submitting: the page then
   * navigates away, and the unmount flush must not resurrect the draft that
   * completing the 复盘 deletes.
   */
  stop: () => void;
  /**
   * Undo `stop()`. A rejected save means the player is staying on this page,
   * so the draft has to keep tracking whatever they type next.
   */
  resume: () => void;
} {
  const latest = useRef<{ input: ReviewInput; openingPlan?: OpeningPlan }>({ input, openingPlan });
  latest.current = { input, openingPlan };

  const [savedAt, setSavedAt] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = useRef(false);
  // Set once honored: after a discard the form must stop writing, otherwise
  // the next keystroke would resurrect the draft the player just deleted.
  const stopped = useRef(false);
  // `setSavedAt` is only legal while this instance is mounted. The unmount
  // flush resolves *after* the component is gone, and React reads the bare
  // `window` global to pick an update priority (`resolveUpdatePriority`), so a
  // late update throws `ReferenceError: window is not defined` once the jsdom
  // environment has been torn down — and it throws out of a promise nobody
  // awaits, which is what Vitest counts as an unhandled error.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const write = useCallback(async () => {
    // `matchId` is the primary key of the drafts table; writing "" would
    // create a row nothing can ever look up.
    if (!matchId || stopped.current || busy.current) return;
    busy.current = true;
    try {
      await saveReviewDraft(matchId, latest.current.input, latest.current.openingPlan);
      if (alive.current) setSavedAt(Date.now());
    } finally {
      busy.current = false;
    }
  }, [matchId]);

  const cancel = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const flush = useCallback(async () => {
    cancel();
    await write();
  }, [cancel, write]);

  /**
   * A write nobody is waiting for. The draft still has to land, but a rejected
   * write must not escape as an unhandled rejection: it is reported through
   * `console.error` instead, which keeps the failure visible without ever
   * pretending something was saved — `savedAt` is only set by a write that
   * actually resolved.
   */
  const detached = useCallback(() => {
    flush().catch((err) => {
      console.error("[review-draft] 后台自动保存失败", err);
    });
  }, [flush]);

  const stop = useCallback(() => {
    stopped.current = true;
    cancel();
  }, [cancel]);

  // (1) debounced write on every change
  useEffect(() => {
    if (!enabled) return;
    cancel();
    timer.current = setTimeout(() => {
      detached();
    }, DRAFT_DEBOUNCE_MS);
    return cancel;
  }, [input, openingPlan, enabled, cancel, detached]);

  // (2) flush when the tab goes away, and on unmount (route change included)
  useEffect(() => {
    const onHide = () => detached();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") detached();
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
      if (enabled) detached();
    };
    // `enabled` deliberately excluded: it flips false during submit, and the
    // cleanup would then skip the flush for every earlier render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detached]);

  const resume = useCallback(() => {
    stopped.current = false;
  }, []);

  // The debounce effect re-arms on the next value change; resuming here only
  // clears the flag, which keeps `stop` and `resume` symmetric and cheap.
  return { savedAt, flush, stop, resume };
}

/**
 * What the form should open with.
 *
 * A draft always wins over the saved review: it is the newer answer, and it
 * is the only place an unfinished 复盘 survives a reload. When neither exists
 * the form starts empty.
 */
export function draftOrReview(
  draft: ReviewDraft | undefined,
  reviewInput: ReviewInput,
): ReviewInput {
  return draft ? draft.input : reviewInput;
}
