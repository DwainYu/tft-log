import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { Clock, Save, Sparkles } from "lucide-react";
import { quickAdd, recentMatches, latestUnfinishedMatch } from "../../services/match-service";
import { getActiveSession } from "../../services/session-service";
import { augmentOptions } from "../../services/augment-service";
import { itemOptions } from "../../services/item-service";
import { errorMessage, ValidationError } from "../../lib/errors";
import { wallClockNow } from "../../lib/wallclock";
import type { MistakeType } from "../../domain/types";
import { Field, Input } from "../ui/Field";
import { AugmentSelector } from "./AugmentSelector";
import { CompositionSelector } from "./CompositionSelector";
import { ItemSelector } from "./ItemSelector";
import { EncounterSelector } from "./EncounterSelector";
import { MistakePicker } from "./MistakeSelect";
import { PlacementPicker } from "./PlacementPicker";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { useToast } from "../ui/Toast";

/**
 * 记录场景：一局可以从开局记起，之后在同一个记录上补。
 *
 * 不是状态机 —— 落库的只是「有没有名次」这一件事（见 `Match.placement`）。
 * 这三个场景只决定弹窗里先显示哪些格子、以及哪些格子必须填。
 */
type QuickAddStage = "opening" | "ongoing" | "result";

const STAGES: { key: QuickAddStage; label: string; hint: string }[] = [
  { key: "opening", label: "开局记录", hint: "刚进游戏：只记开局事件和打算怎么打" },
  { key: "ongoing", label: "对局中", hint: "打的过程中：补符文、阵容和随手记" },
  { key: "result", label: "赛后结算", hint: "打完了：名次和结束时的剩余血量" },
];

const stageHintOf = (key: QuickAddStage): string =>
  STAGES.find((s) => s.key === key)?.hint ?? "";

/** 没有名次的记录不能说「已记录第 undefined 名」。 */
const savedText = (placement?: number): string =>
  placement === undefined ? "已保存开局记录" : `已记录第 ${placement} 名`;

interface QuickAddDraft {
  placement: number | undefined;
  composition: string;
  /** Canonical augment ids in pick order; names are derived on save. */
  augmentIds: string[];
  /** Canonical item ids; names are derived on save. */
  coreItemIds: string[];
  primaryMistake: MistakeType | "";
  nextGameFocus: string;
  playedAt: string;
  /** Set 18 开局事件：本局随机到的全局条件，不填就不填。 */
  encounterId: string;
}

const emptyDraft = (): QuickAddDraft => ({
  placement: undefined,
  composition: "",
  augmentIds: [],
  coreItemIds: [],
  primaryMistake: "",
  nextGameFocus: "",
  playedAt: wallClockNow(),
  encounterId: "",
});

export function QuickAddDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<QuickAddDraft>(emptyDraft);
  // 默认「赛后结算」：快速记录的主路径仍然是打完一局补一条完整记录。
  const [stage, setStage] = useState<QuickAddStage>("result");
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();

  const activeSession = useLiveQuery(getActiveSession, []);
  const last = useLiveQuery(() => recentMatches(1), [], [])[0];
  // 已经开过一条、还没结算的对局（开局 / 进行中）。快速记录只负责建新记录，
  // 继续补那一局走编辑页 —— 所以这里给的是一条指回去的路，而不是第二套表单。
  const unfinished = useLiveQuery(() => latestUnfinishedMatch(), [], undefined);

  const set = useCallback(<K extends keyof QuickAddDraft>(key: K, value: QuickAddDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
  }, []);

  // The dialog stays mounted while hidden (QuickAddProvider keeps it next to
  // the app shell), so the useState initializer pins `playedAt` to whenever
  // the page first loaded. Every fresh open is a new quick-create flow: seed
  // it with the time the player actually clicked. Rendering while open never
  // re-runs this, so manual edits survive; "保存并再记一局" re-seeds via its
  // own emptyDraft() reset.
  useEffect(() => {
    if (open) set("playedAt", wallClockNow());
  }, [open, set]);

  // Keys 1–8 set the placement: the fastest possible start for the next record.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const n = Number(e.key);
      if (n >= 1 && n <= 8) set("placement", n);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, set]);

  async function submit(mode: "close" | "again" | "review") {
    // 只有「赛后结算」这一档必须带名次：开局和对局中本来就没有结果，
    // 逼着填一个等于逼着编一个，而 0 会被统计当成真实赛果。
    if (stage === "result" && !draft.placement) {
      setErrors(["赛后结算请先选择名次（快捷键 1 – 8）"]);
      return;
    }
    setBusy(true);
    setErrors([]);
    try {
      const time = draft.playedAt || wallClockNow();
      const match = await quickAdd(
        {
          // 没结算时这一刻是「开局时间」，不是结束时间：`playedAt` 先用来占位
          // （列表和排序都靠它），结算后再由编辑页补上结束时间。
          playedAt: time,
          startedAt: draft.placement === undefined ? time : undefined,
          placement: draft.placement === undefined ? "" : String(draft.placement),
          composition: draft.composition,
          augments: augmentOptions(draft.augmentIds)
            .map((a) => a.name)
            .join(" / "),
          augmentIds: draft.augmentIds,
          coreItems: itemOptions(draft.coreItemIds)
            .map((i) => i.name)
            .join(" / "),
          coreItemIds: draft.coreItemIds,
          primaryMistake: draft.primaryMistake,
          // 开局事件什么时候想起来都能补；不填就不填。
          encounterId: draft.encounterId,
        },
        draft.nextGameFocus,
      );

      if (mode === "review") {
        onClose();
        navigate(`/matches/${match.id}/review`);
        return;
      }
      if (mode === "again") {
        // Keep the fields the player is likely to reuse, clear the rest.
        // 开局事件**不**在保留之列：它是本局随机到的，继承上一局会让后面
        // 每一局都记错，而且没有任何校验能拦住。
        setDraft({
          ...emptyDraft(),
          composition: draft.composition,
          augmentIds: draft.augmentIds,
          coreItemIds: draft.coreItemIds,
          primaryMistake: draft.primaryMistake,
          nextGameFocus: draft.nextGameFocus,
        });
        toast.push(`${savedText(match.placement)} · 继续下一局`);
        return;
      }
      toast.push(`${savedText(match.placement)} · ${draft.composition || "未填阵容"}`);
      setDraft(emptyDraft());
      onClose();
    } catch (err) {
      setErrors(err instanceof ValidationError ? err.errors : [errorMessage(err)]);
    } finally {
      setBusy(false);
    }
  }

  const reuseLast = () => {
    if (!last) return;
    // 开局事件不复制：它是本局随机到的，不是上一局的打法。
    setDraft((d) => ({
      ...d,
      composition: last.composition ?? d.composition,
      augmentIds: last.augmentIds ?? d.augmentIds,
      coreItemIds: last.coreItemIds ?? d.coreItemIds,
    }));
  };

  const stageHint = stageHintOf(stage);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="快速记录一局"
      subtitle={`名次 → 阵容 → 问题 → 保存，一分钟内完成 · 记入「${activeSession?.name ?? "日常训练"}」`}
      size="lg"
      footer={
        <>
          <Button variant="primary" onClick={() => submit("close")} disabled={busy}>
            <Save size={15} />
            保存
          </Button>
          <Button onClick={() => submit("again")} disabled={busy}>
            保存并再记一局
          </Button>
          <Button onClick={() => submit("review")} disabled={busy}>
            <Sparkles size={15} />
            保存并详细复盘
          </Button>
          <span className="ml-auto text-[11px] text-ink-600">
            {stage === "result" ? "按 1–8 直接选名次" : "名次还没产生，不用填"}
          </span>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {errors.length > 0 && (
          <ul className="rounded-lg border border-bad/35 bg-bad/10 px-3 py-2 text-xs text-bad">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}

        {/* 先选场景，再填格子：开局时刻不该被名次和结束血量这些赛后问题堵住。 */}
        <Field label="记录场景" labelId="qa-stage-label">
          <div role="group" aria-labelledby="qa-stage-label" className="flex flex-wrap gap-2">
            {STAGES.map((s) => {
              const active = stage === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setStage(s.key)}
                  className={[
                    "rounded-lg border px-3 py-1.5 text-xs transition-colors",
                    active
                      ? "border-gold-500/45 bg-gold-500/10 text-gold-300"
                      : "border-line text-ink-400 hover:bg-base-800 hover:text-ink-200",
                  ].join(" ")}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-ink-600">{stageHint}</p>
        </Field>

        {stage !== "opening" && (
          <Field label="最终名次" required={stage === "result"} hint="快捷键 1 – 8">
            <PlacementPicker value={draft.placement} onChange={(p) => set("placement", p)} />
          </Field>
        )}

        <Field
          label={stage === "result" ? "阵容" : "打算玩的阵容"}
          htmlFor="qa-composition"
          hint={
            last && (
              <button
                type="button"
                onClick={reuseLast}
                className="rounded border border-gold-500/30 bg-gold-500/10 px-1.5 py-0.5 text-[11px] text-gold-300"
              >
                复制上一局
              </button>
            )
          }
        >
          <CompositionSelector
            id="qa-composition"
            value={draft.composition}
            onChange={(v) => set("composition", v)}
          />
        </Field>

        {/* 开局事件：本局随机到的全局条件，和下面自己选的三个强化符文不是一回事。 */}
        <Field label="开局事件（选填）" htmlFor="qa-encounter">
          <EncounterSelector
            id="qa-encounter"
            value={draft.encounterId}
            onChange={(v) => set("encounterId", v)}
          />
        </Field>

        {/* 符文和装备要等到 2-1 / 打完才有，开局那一档不给这两个格子。 */}
        {stage !== "opening" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="强化符文" htmlFor="qa-augments">
              <AugmentSelector
                id="qa-augments"
                value={draft.augmentIds}
                onChange={(ids) => set("augmentIds", ids)}
              />
            </Field>
            <Field label="核心装备" htmlFor="qa-items">
              <ItemSelector
                id="qa-items"
                value={draft.coreItemIds}
                onChange={(ids) => set("coreItemIds", ids)}
              />
            </Field>
          </div>
        )}

        {stage === "result" && (
          <Field label="本局最大问题">
            <MistakePicker
              value={draft.primaryMistake}
              onChange={(v) => set("primaryMistake", v)}
            />
          </Field>
        )}

        <Field label="下一局训练重点" htmlFor="qa-focus">
          <Input
            id="qa-focus"
            value={draft.nextGameFocus}
            placeholder="例如：4-1 之前不 D 超过 30 金币"
            onChange={(e) => set("nextGameFocus", e.target.value)}
          />
        </Field>

        <Field
          label={stage === "result" ? "对局结束时间" : "开局时间"}
          htmlFor="qa-time"
        >
          <div className="flex items-center gap-2">
            <Clock size={14} className="shrink-0 text-ink-600" />
            <Input
              id="qa-time"
              type="datetime-local"
              value={draft.playedAt}
              onChange={(e) => set("playedAt", e.target.value)}
              className="max-w-56"
            />
          </div>
        </Field>

        {/* 一局是一条可以持续完善的记录：已经开过一条还没结算的话，指回去继续记，
            而不是在这里再开一条。 */}
        {unfinished && (
          <p className="rounded-lg border border-line bg-base-800 px-3 py-2 text-[11px] leading-relaxed text-ink-400">
            还有一局没结算（{unfinished.playedAt.slice(5, 10)}{" "}
            {unfinished.composition ?? "未填阵容"}）。{" "}
            <button
              type="button"
              onClick={() => {
                onClose();
                navigate(`/matches/${unfinished.id}/edit`);
              }}
              className="text-gold-300 underline underline-offset-4 hover:text-gold-200"
            >
              继续记这一局
            </button>
            ，不要另开一条。
          </p>
        )}
      </div>
    </Modal>
  );
}
