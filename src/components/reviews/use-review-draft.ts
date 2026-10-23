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
 *    A debounce alone would lose up to `DRAFT_DEBOUNCE_MS` of typing.
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

  const write = useCallback(async () => {
    // `matchId` is the primary key of the drafts table; writing "" would
    // create a row nothing can ever look up.
    if (!matchId || stopped.current || busy.current) return;
    busy.current = true;
    try {
      await saveReviewDraft(matchId, latest.current.input, latest.current.openingPlan);
      setSavedAt(Date.now());
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

  const stop = useCallback(() => {
    stopped.current = true;
    cancel();
  }, [cancel]);

  // (1) debounced write on every change
  useEffect(() => {
    if (!enabled) return;
    cancel();
    timer.current = setTimeout(() => {
      void write();
    }, DRAFT_DEBOUNCE_MS);
    return cancel;
  }, [input, openingPlan, enabled, cancel, write]);

  // (2) flush when the tab goes away, and on unmount (route change included)
  useEffect(() => {
    const onHide = () => void flush();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
      if (enabled) void flush();
    };
    // `enabled` deliberately excluded: it flips false during submit, and the
    // cleanup would then skip the flush for every earlier render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flush]);

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
