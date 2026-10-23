import { useEffect, useState } from "react";
import { ChevronDown, Eraser, Save } from "lucide-react";
import {
  REVIEW_SECTIONS,
  isReviewComplete,
  reviewInputOf,
  reviewProgress,
  type ReviewInput,
} from "../../domain/review/review";
import { OPENING_PLAN_LIST, openingPlanLabel } from "../../domain/labels";
import type { OpeningPlan, Review, ReviewDraft } from "../../domain/types";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Field, Textarea } from "../ui/Field";
import { Panel, PanelHeader } from "../ui/Panel";
import { MistakePicker } from "../matches/MistakeSelect";
import { draftOrReview, useReviewDraftAutosave } from "./use-review-draft";

const BLOCKS: { key: keyof typeof REVIEW_SECTIONS; field: keyof ReviewInput; rows: number }[] = [
  { key: "opening", field: "opening", rows: 4 },
  { key: "midGame", field: "midGame", rows: 5 },
  { key: "lateGame", field: "lateGame", rows: 4 },
];

/** One line per route so the choice needs no manual — the label alone is terse. */
const OPENING_PLAN_HINTS: Record<OpeningPlan, string> = {
  WIN_STREAK: "开局以连胜为目标",
  LOSE_STREAK: "开局主动连败",
  STANDARD: "不刻意连胜或连败",
  ECONOMY: "优先积累经济",
  FORCE: "强行锁定一套阵容",
};

const FIELD_IDS = {
  primaryMistake: "rv-primary",
  biggestMistake: "rv-biggest",
  bestDecision: "rv-best",
  nextGameFocus: "rv-focus",
} as const;

/**
 * Validation message -> the field it is about, so a rejected save can point at
 * what to fix instead of only listing messages at the top of the page.
 * Presentation only: the rules themselves stay in the domain layer.
 */
const ERROR_MATCHERS: { text: string; field: keyof typeof FIELD_IDS }[] = [
  { text: "选择本局最大问题", field: "primaryMistake" },
  { text: "本局最大的问题", field: "biggestMistake" },
  { text: "做得最好的一件事", field: "bestDecision" },
  { text: "下一局要刻意练习什么", field: "nextGameFocus" },
];

const errorFieldOf = (message: string) =>
  ERROR_MATCHERS.find(({ text }) => message.includes(text))?.field;

/** HH:mm:ss of the last autosave — enough to tell "yes, it wrote just now". */
function formatClock(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function ReviewForm({
  initial,
  initialOpeningPlan,
  errors,
  onSave,
  onDiscard,
  busy,
  draft,
  hasDraft,
  matchId,
}: {
  /** The match being reviewed — the draft key. Required for autosave. */
  matchId: string;
  initial?: Review;
  /** Structured fact that lives on the match; prefilled so editing is idempotent. */
  initialOpeningPlan?: OpeningPlan;
  /** Validation messages from the service layer. */
  errors?: string[];

  onSave: (input: ReviewInput, openingPlan: OpeningPlan | null) => void;
  onDiscard?: () => void;
  busy?: boolean;
  /** Unfinished answers to restore; takes precedence over `initial`. */
  draft?: ReviewDraft;
  /** Whether an unfinished draft already exists for this match. */
  hasDraft?: boolean;
}) {
  const [input, setInput] = useState<ReviewInput>(() => draftOrReview(draft, reviewInputOf(initial)));
  const [openingPlan, setOpeningPlan] = useState<OpeningPlan | undefined>(
    draft ? draft.openingPlan : initialOpeningPlan,
  );
  // Autosave is owned here because this is where the answers live. `busy`
  // disables it while a save is in flight so nothing races the real write.
  const autosave = useReviewDraftAutosave({
    matchId,
    input,
    openingPlan,
    enabled: !busy && matchId !== "",
  });
  // Counted per attempt: the first rejected save and a second one with the
  // exact same messages must both point at the field to fix, otherwise a
  // long form looks like the button did nothing.
  const [attempts, setAttempts] = useState(0);

  const set = <K extends keyof ReviewInput>(key: K, value: ReviewInput[K]) =>
    setInput((prev) => ({ ...prev, [key]: value }));

  const complete = isReviewComplete(input);
  const progress = reviewProgress({ ...input, openingPlan });
  // Open the free-text block when it already holds something, so an existing
  // write-up is never hidden behind a collapsed section.
  const hasFreeText = BLOCKS.some(({ field }) => Boolean((input[field] as string | undefined)?.trim()));
  const errorFor = (field: keyof typeof FIELD_IDS) =>
    errors?.find((message) => errorFieldOf(message) === field);
  const firstInvalid = errors?.map(errorFieldOf).find((field) => field !== undefined);

  useEffect(() => {
    if (firstInvalid) document.getElementById(FIELD_IDS[firstInvalid])?.focus();
  }, [firstInvalid, attempts]);

  // A rejected save keeps the player on this page, so the draft has to keep
  // tracking further typing instead of freezing just before it was stopped.
  useEffect(() => {
    if (errors && errors.length > 0) autosave.resume();
  }, [errors, autosave.resume]);

  return (
    <form
      className="flex min-w-0 flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setAttempts((n) => n + 1);
        // Stop autosaving *before* handing over. Completing the 复盘 deletes
        // the draft, so any later write from this form (the unmount flush in
        // particular) would resurrect it. Anything typed since the last
        // debounced write goes straight into the real review instead.
        autosave.stop();
        onSave(input, openingPlan ?? null);
      }}
    >
      {(errors?.length ?? 0) > 0 && (
        <div role="alert" className="panel border-bad/40 p-3">
          <p className="text-xs font-medium text-bad">还没保存 · 有 {errors?.length} 处需要补充</p>
          <ul className="mt-1.5 flex flex-col gap-1 text-[11px] leading-relaxed text-ink-200">
            {errors?.map((e) => (
              <li key={e}>· {e}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 复盘进度 — how far this 复盘 is, and what is still empty. */}
      <Panel className="p-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
          <h2 className="text-sm font-semibold text-ink-50">复盘进度</h2>
          <Badge tone={complete ? "good" : "muted"}>{complete ? "必填已满足" : "必填未完成"}</Badge>
          <span className="num ml-auto text-xs text-ink-400">
            已填 {progress.filled}/{progress.total} 项 · {progress.percent}%
          </span>
        </div>
        <div
          className="mt-2.5 h-1.5 w-full overflow-hidden rounded bg-base-800"
          role="progressbar"
          aria-valuenow={progress.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={`已填 ${progress.filled}/${progress.total} 项 · ${progress.percent}%`}
          aria-label="复盘完整度"
        >
          <span
            className={`block h-1.5 rounded ${complete ? "bg-good" : "bg-gold-400"}`}
            style={{ width: `${progress.percent}%` }}
          />
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {progress.missing.length > 0 ? (
            progress.missing.map((label) => (
              <Badge key={label} tone="muted">
                未填 · {label}
              </Badge>
            ))
          ) : (
            <Badge tone="good">全部填齐</Badge>
          )}
        </div>
        {progress.filled === 0 && (
          <p className="mt-2.5 text-xs leading-relaxed text-ink-400">
            还没有记录复盘内容 —— 从下面的「开局路线」开始就行。
          </p>
        )}
        <p className="mt-2.5 border-t border-line pt-2.5 text-[11px] leading-relaxed text-ink-600">
          {hasDraft || autosave.savedAt !== null ? (
            <>
              草稿已自动保存 —— 关掉页面或刷新都不会丢，也可以从「草稿箱」回来继续。
              {autosave.savedAt !== null && (
                <span className="ml-1 text-ink-500">
                  最近保存 {formatClock(autosave.savedAt)}
                </span>
              )}
            </>
          ) : (
            <>边写边自动保存草稿，随时可以离开——内容会留在「草稿箱」。</>
          )}
        </p>
      </Panel>

      {/* 1 · 开局路线 */}
      <Panel>
        <PanelHeader
          title={<SectionTitle index={1}>开局路线</SectionTitle>}
          subtitle="这局是怎么开的 · 会进入统计"
          action={
            <Badge tone={openingPlan ? "good" : "muted"}>{openingPlan ? "已填写" : "未填写"}</Badge>
          }
        />
        <div className="p-4">
          <Field label="这局是怎么开的">
            <div
              role="group"
              aria-label="开局路线"
              className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5"
            >
              {OPENING_PLAN_LIST.map((plan) => {
                const selected = openingPlan === plan;
                return (
                  <button
                    key={plan}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setOpeningPlan(selected ? undefined : plan)}
                    className={[
                      "flex flex-col rounded-lg border px-3 py-2 text-left transition-colors",
                      "focus-visible:ring-2 focus-visible:ring-gold-500/55 focus-visible:outline-none",
                      selected
                        ? "border-gold-500/55 bg-gold-500/12"
                        : "border-line bg-base-900/60 hover:border-base-600 hover:bg-base-800",
                    ].join(" ")}
                  >
                    <span
                      className={`text-xs font-medium ${selected ? "text-gold-300" : "text-ink-200"}`}
                    >
                      {openingPlanLabel(plan)}
                    </span>
                    <span className="mt-0.5 text-[10px] leading-snug text-ink-400">
                      {OPENING_PLAN_HINTS[plan]}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-600">
              {openingPlan
                ? `已选「${openingPlanLabel(openingPlan)}」· 再点一次可取消`
                : "选最接近的一个 · 它和下面的「主要问题」是两件事：这里记录过程，那边记录归因"}
            </p>
          </Field>
        </div>
      </Panel>

      {/* 2 · 主要问题 */}
      <Panel>
        <PanelHeader
          title={<SectionTitle index={2}>主要问题</SectionTitle>}
          subtitle="这局最值得下次改进的一件事"
          action={
            <Badge tone={input.primaryMistake && input.biggestMistake?.trim() ? "good" : "muted"}>
              {input.primaryMistake && input.biggestMistake?.trim() ? "已填写" : "未填写"}
            </Badge>
          }
        />
        <div className="flex flex-col gap-4 p-4">
          <div>
            <Field label="主要问题" required hint="统计只读这一个分类 —— 选最影响结果的那个">
              <div
                id={FIELD_IDS.primaryMistake}
                tabIndex={-1}
                role="group"
                aria-label="主要问题分类"
                aria-invalid={errorFor("primaryMistake") ? true : undefined}
                aria-describedby={
                  errorFor("primaryMistake") ? `${FIELD_IDS.primaryMistake}-error` : undefined
                }
                className="rounded-md focus-visible:ring-2 focus-visible:ring-bad/50 focus-visible:outline-none"
              >
                <MistakePicker
                  value={(input.primaryMistake ?? "") as never}
                  onChange={(v) => set("primaryMistake", v || undefined)}
                />
              </div>
            </Field>
            <FieldError
              id={`${FIELD_IDS.primaryMistake}-error`}
              message={errorFor("primaryMistake")}
            />
          </div>

          <div>
            <Field
              label="这局最大的问题是什么"
              htmlFor={FIELD_IDS.biggestMistake}
              required
              hint="一句话写清楚发生了什么，而不是「没打好」"
            >
              <Textarea
                id={FIELD_IDS.biggestMistake}
                rows={3}
                value={input.biggestMistake ?? ""}
                placeholder="例如：4-1 锁血时 D 牌过深，把经济全部打空"
                aria-invalid={errorFor("biggestMistake") ? true : undefined}
                aria-describedby={
                  errorFor("biggestMistake") ? `${FIELD_IDS.biggestMistake}-error` : undefined
                }
                onChange={(e) => set("biggestMistake", e.target.value)}
              />
            </Field>
            <FieldError
              id={`${FIELD_IDS.biggestMistake}-error`}
              message={errorFor("biggestMistake")}
            />
          </div>
        </div>
      </Panel>

      {/* 3 · 复盘结论 */}
      <Panel>
        <PanelHeader
          title={<SectionTitle index={3}>复盘结论</SectionTitle>}
          subtitle="四项必填 —— 这是整个训练闭环的出口"
          action={
            <Badge tone={complete ? "good" : "muted"}>{complete ? "已满足必填" : "必填未完成"}</Badge>
          }
        />
        <div className="grid gap-4 p-4 xl:grid-cols-2">
          <div>
            <Field
              label="本局做得最好的一件事"
              htmlFor={FIELD_IDS.bestDecision}
              required
              hint="即使名次不好，也写下一件做对的事"
            >
              <Textarea
                id={FIELD_IDS.bestDecision}
                rows={3}
                value={input.bestDecision ?? ""}
                placeholder="例如：3-2 直接上 6，稳住了连胜"
                aria-invalid={errorFor("bestDecision") ? true : undefined}
                aria-describedby={
                  errorFor("bestDecision") ? `${FIELD_IDS.bestDecision}-error` : undefined
                }
                onChange={(e) => set("bestDecision", e.target.value)}
              />
            </Field>
            <FieldError id={`${FIELD_IDS.bestDecision}-error`} message={errorFor("bestDecision")} />
          </div>

          <div>
            <Field
              label="下一局要刻意练习什么"
              htmlFor={FIELD_IDS.nextGameFocus}
              required
              hint="写成一条可执行的动作，而不是「注意经济」"
            >
              <Textarea
                id={FIELD_IDS.nextGameFocus}
                rows={3}
                value={input.nextGameFocus ?? ""}
                placeholder="例如：下次 4-1 前至少留 30 金币"
                aria-invalid={errorFor("nextGameFocus") ? true : undefined}
                aria-describedby={
                  errorFor("nextGameFocus") ? `${FIELD_IDS.nextGameFocus}-error` : undefined
                }
                onChange={(e) => set("nextGameFocus", e.target.value)}
              />
            </Field>
            <FieldError
              id={`${FIELD_IDS.nextGameFocus}-error`}
              message={errorFor("nextGameFocus")}
            />
          </div>

          <Field
            label="自我评分"
            labelId="rv-score-label"
            hintId="rv-score-hint"
            hint="1 = 完全失控，5 = 决策基本没有遗憾 · 选填"
            className="lg:col-span-2"
          >
            <div
              role="group"
              aria-labelledby="rv-score-label"
              aria-describedby="rv-score-hint"
              className="flex items-center gap-2"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={input.selfScore === n}
                  onClick={() => set("selfScore", input.selfScore === n ? undefined : n)}
                  className={[
                    "num size-9 rounded-lg border text-sm transition-colors",
                    "focus-visible:ring-2 focus-visible:ring-gold-500/55 focus-visible:outline-none",
                    input.selfScore === n
                      ? "border-gold-500/50 bg-gold-500/15 text-gold-300"
                      : "border-line bg-base-900/70 text-ink-400 hover:bg-base-800 hover:text-ink-200",
                  ].join(" ")}
                >
                  {n}
                </button>
              ))}
              {input.selfScore && (
                <button
                  type="button"
                  onClick={() => set("selfScore", undefined)}
                  className="ml-1 inline-flex items-center gap-1 text-[11px] text-ink-600 hover:text-ink-200"
                >
                  <Eraser size={12} /> 清除
                </button>
              )}
            </div>
          </Field>
        </div>
      </Panel>

      {/* 4 · 过程补充（选填） */}
      <details className="panel" open={hasFreeText}>
        <summary
          className={[
            "group flex cursor-pointer list-none items-center gap-3 px-4 py-3",
            "[&::-webkit-details-marker]:hidden",
            "focus-visible:ring-2 focus-visible:ring-gold-500/55 focus-visible:outline-none",
          ].join(" ")}
        >
          <h2 className="text-sm font-semibold text-ink-50">
            <SectionTitle index={4}>过程补充 · 开局 / 中期 / 后期</SectionTitle>
          </h2>
          <Badge tone="muted" className="ml-auto">
            选填
          </Badge>
          <ChevronDown
            size={14}
            className="text-ink-600 transition-transform group-open:rotate-180"
            aria-hidden
          />
        </summary>
        <div className="border-t border-line px-4 py-1">
          <p className="py-3 text-xs leading-relaxed text-ink-600">
            自由文本，不进入任何统计 —— 想留点过程就写，不成段也没关系。
          </p>
          {BLOCKS.map(({ key, field, rows }) => (
            <div key={key} className="border-t border-line py-4">
              <Field
                htmlFor={`rv-${key}`}
                label={REVIEW_SECTIONS[key].title}
                hint={REVIEW_SECTIONS[key].prompts.join(" · ")}
              >
                <Textarea
                  id={`rv-${key}`}
                  rows={rows}
                  value={(input[field] as string | undefined) ?? ""}
                  placeholder={REVIEW_SECTIONS[key].prompts.map((p) => `· ${p}`).join("\n")}
                  onChange={(e) => set(field, e.target.value)}
                />
              </Field>
            </div>
          ))}
        </div>
      </details>

      <div className="panel flex flex-wrap items-center gap-3 px-4 py-3">
        <p className="order-2 w-full text-[11px] leading-relaxed text-ink-600 sm:order-1 sm:w-auto sm:flex-1">
          {complete
            ? "四项结论已填齐 · 保存后这局标记为「已复盘」"
            : "四项结论填齐后才能保存 —— 进度条上面列出了还缺什么"}
        </p>
        {onDiscard && (
          <Button
            type="button"
            variant="ghost"
            className="order-1 sm:order-2"
            onClick={onDiscard}
          >
            取消
          </Button>
        )}
        <Button type="submit" variant="primary" disabled={busy} aria-busy={busy || undefined} className="order-1 ml-auto sm:order-3 sm:ml-0">
          <Save size={15} />
          {busy ? "保存中…" : "保存复盘"}
        </Button>
      </div>
    </form>
  );
}

/** Numbered section title — the number is decoration, the heading text stays clean. */
function SectionTitle({ index, children }: { index: number; children: string }) {
  return (
    <span className="flex items-center gap-2">
      <span
        aria-hidden
        className="num grid size-5 shrink-0 place-items-center rounded-md border border-line bg-base-900/70 text-[10px] text-ink-600"
      >
        {index}
      </span>
      {children}
    </span>
  );
}

/** Message tied to one field, rendered directly under it. */
function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 flex items-start text-[11px] leading-relaxed text-bad">
      {message}
    </p>
  );
}
