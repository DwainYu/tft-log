import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Save, Trash2, Zap } from "lucide-react";
import { addMatch, updateMatch } from "../../services/match-service";
import { OPENING_PLAN_LIST, mistakeLabel, openingPlanLabel } from "../../domain/labels";
import { isTop4, isWin } from "../../domain/match/match";
import { MAX_PLACEMENT } from "../../domain/types";
import type { Match } from "../../domain/types";
import { errorMessage } from "../../lib/errors";
import { formatDuration } from "../../lib/utils";
import { Button } from "../ui/Button";
import { Field, Input, Select } from "../ui/Field";
import { Panel, PanelHeader } from "../ui/Panel";
import { Badge } from "../ui/Badge";
import { useToast } from "../ui/Toast";
import { AugmentSelector } from "./AugmentSelector";
import { CompositionSelector } from "./CompositionSelector";
import { EncounterSelector } from "./EncounterSelector";
import { ItemSelector } from "./ItemSelector";
import { TraitSelector } from "./TraitSelector";
import { MistakeSelect } from "./MistakeSelect";
import { PlacementPicker } from "./PlacementPicker";
import { championRepository } from "../../data/tft/repositories";
import { useSession } from "../../services/session-context";
import {
  draftFromMatch,
  draftToPayload,
  effectiveDurationMinutes,
  emptyDraft,
  type MatchFormDraft,
} from "./match-form-model";

/** Set 18 champion names, for the 核心棋子 autocomplete (static snapshot). */
const S18_CHAMPION_NAMES: string[] = [...new Set(championRepository.getChampions().map((c) => c.name))];

export function MatchForm({
  mode,
  match,
  onDelete,
}: {
  mode: "create" | "edit";
  match?: Match;
  onDelete?: () => void;
}) {
  const { sessions, activeSessionId } = useSession();
  const [draft, setDraft] = useState<MatchFormDraft>(() =>
    match ? draftFromMatch(match, activeSessionId) : emptyDraft(new Date(), activeSessionId),
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();

  const set = <K extends keyof MatchFormDraft>(key: K, value: MatchFormDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const payload = useMemo(() => draftToPayload(draft), [draft]);
  const durationMinutes = effectiveDurationMinutes(draft);

  async function submit() {
    setBusy(true);
    setErrors([]);
    try {
      if (mode === "create") {
        const created = await addMatch(payload);
        toast.push(`已记录第 ${created.placement} 名`);
        navigate(`/matches/${created.id}`);
      } else if (match) {
        await updateMatch(match.id, payload);
        toast.push("对局已更新");
        navigate(`/matches/${match.id}`);
      }
    } catch (err) {
      setErrors([errorMessage(err)]);
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {errors.length > 0 && (
        <div className="panel border-bad/40 bg-bad/10 px-4 py-3 text-sm text-bad">
          {errors.join("；")}
        </div>
      )}

      <Panel>
        <PanelHeader title="A · 基础信息" subtitle="日期必填，开始/结束时间选填" />
        <div className="flex flex-col gap-4 p-4">
          <Field label="最终名次" required>
            <PlacementPicker
              value={draft.placement}
              onChange={(p) => set("placement", p === draft.placement ? undefined : p)}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="日期" htmlFor="f-date" required>
              <Input
                id="f-date"
                type="date"
                value={draft.date}
                onChange={(e) => set("date", e.target.value)}
              />
            </Field>
            <Field label="开始时间" htmlFor="f-start">
              <Input
                id="f-start"
                type="time"
                value={draft.startTime}
                onChange={(e) => set("startTime", e.target.value)}
              />
            </Field>
            <Field label="结束时间" htmlFor="f-end">
              <Input
                id="f-end"
                type="time"
                value={draft.endTime}
                onChange={(e) => set("endTime", e.target.value)}
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field
              label="游戏时长（分钟）"
              htmlFor="f-duration"
              hint={
                durationMinutes
                  ? `自动推算：${formatDuration(Number(durationMinutes) * 60)}`
                  : "填写开始/结束时间后自动推算，也可手动输入"
              }
            >
              <Input
                id="f-duration"
                type="number"
                min={0}
                max={120}
                inputMode="numeric"
                value={draft.durationMinutes}
                placeholder={durationMinutes || "28"}
                onChange={(e) => set("durationMinutes", e.target.value)}
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="训练 Session"
              htmlFor="f-session"
              hint="新对局默认记入当前训练；在这里也可以把这局换到别的训练"
            >
              <Select
                id="f-session"
                value={draft.sessionId}
                onChange={(e) => set("sessionId", e.target.value)}
              >
                {(sessions.length > 0
                  ? sessions
                  : [{ id: activeSessionId, name: "日常训练" }]
                ).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="B · 对局状态" />
        <div className="flex flex-col gap-4 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="最终等级" htmlFor="f-level">
              <Input
                id="f-level"
                type="number"
                min={1}
                max={12}
                inputMode="numeric"
                value={draft.finalLevel}
                placeholder="7"
                onChange={(e) => set("finalLevel", e.target.value)}
              />
            </Field>
            <Field label="最终血量" htmlFor="f-health">
              <Input
                id="f-health"
                type="number"
                min={0}
                max={100}
                inputMode="numeric"
                value={draft.finalHealth}
                placeholder="35"
                onChange={(e) => set("finalHealth", e.target.value)}
              />
            </Field>
            <Field label="总金币（可选）" htmlFor="f-gold">
              <Input
                id="f-gold"
                type="number"
                min={0}
                inputMode="numeric"
                value={draft.totalGold}
                placeholder="42"
                onChange={(e) => set("totalGold", e.target.value)}
              />
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-ink-600">
            <span>结果状态（按名次自动判断）</span>
            <Badge tone={draft.placement && isWin({ placement: draft.placement }) ? "gold" : "muted"}>
              吃鸡
            </Badge>
            <Badge tone={draft.placement && isTop4({ placement: draft.placement }) ? "good" : "muted"}>
              Top4
            </Badge>
            <Badge tone={draft.placement && draft.placement > MAX_PLACEMENT / 2 ? "bad" : "muted"}>
              Bottom4
            </Badge>
          </div>
        </div>
      </Panel>

      <Panel>
        <PanelHeader
          title="C · 阵容 / 装备 / 强化"
          subtitle="MVP 阶段允许纯文本，例如 主C / 主坦 / 副C"
        />
        <div className="flex flex-col gap-4 p-4">
          <Field label="最终阵容名称" htmlFor="f-comp">
            <CompositionSelector
              id="f-comp"
              value={draft.composition}
              onChange={(v) => set("composition", v)}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="主要羁绊"
              htmlFor="f-traits"
              hint="本局最终阵容实际拥有的羁绊；阵容名是另外一回事"
            >
              <TraitSelector
                id="f-traits"
                value={draft.traitIds}
                onChange={(ids) => set("traitIds", ids)}
                legacy={draft.traitsLegacy}
                onLegacyChange={(values) => set("traitsLegacy", values)}
              />
            </Field>
            <Field label="核心棋子" htmlFor="f-units">
              <Input
                id="f-units"
                list="f-units-options"
                value={draft.coreUnits}
                placeholder="Galio / Katarina / Tahm"
                onChange={(e) => set("coreUnits", e.target.value)}
              />
              <datalist id="f-units-options">
                {S18_CHAMPION_NAMES.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </Field>
            <Field label="核心装备" htmlFor="f-items">
              <ItemSelector
                id="f-items"
                value={draft.coreItemIds}
                onChange={(ids) => set("coreItemIds", ids)}
                legacy={draft.coreItemsLegacy}
                onLegacyChange={(values) => set("coreItemsLegacy", values)}
              />
            </Field>
            <Field label="强化符文" htmlFor="f-augments">
              <AugmentSelector
                id="f-augments"
                value={draft.augmentIds}
                onChange={(ids) => set("augmentIds", ids)}
                legacy={draft.augmentsLegacy}
                onLegacyChange={(values) => set("augmentsLegacy", values)}
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="开局事件（Opening Encounter）"
              htmlFor="f-encounter"
              hint="开局前由本局随机决定的全局条件；和「强化符文」里你自己选的那三个不是一回事"
            >
              <EncounterSelector
                id="f-encounter"
                value={draft.encounterId}
                onChange={(v) => set("encounterId", v)}
              />
            </Field>
            <Field
              label="开局路线"
              labelId="f-plan-label"
              hint="本局的开局策略；复盘页会沿用这里的选择"
            >
              <div role="group" aria-labelledby="f-plan-label" className="flex flex-wrap gap-2">
                {OPENING_PLAN_LIST.map((plan) => {
                  const active = draft.openingPlan === plan;
                  return (
                    <button
                      key={plan}
                      type="button"
                      aria-pressed={active}
                      onClick={() => set("openingPlan", active ? "" : plan)}
                      className={[
                        "rounded-lg border px-3 py-1.5 text-xs transition-colors",
                        active
                          ? "border-gold-500/45 bg-gold-500/10 text-gold-300"
                          : "border-line text-ink-400 hover:bg-base-800 hover:text-ink-200",
                      ].join(" ")}
                    >
                      {openingPlanLabel(plan)}
                    </button>
                  );
                })}
              </div>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="最大问题（Primary Mistake）" htmlFor="f-mistake">
              <MistakeSelect
                id="f-mistake"
                value={(draft.primaryMistake || "") as never}
                onChange={(v) => set("primaryMistake", v)}
              />
              {draft.primaryMistake && (
                <p className="mt-1 text-[11px] text-ink-600">
                  复盘时会在这一项上继续展开：{mistakeLabel(draft.primaryMistake)}
                </p>
              )}
            </Field>
            <Field label="备注" htmlFor="f-notes">
              <Input
                id="f-notes"
                value={draft.notes}
                placeholder="一行话记住这局"
                onChange={(e) => set("notes", e.target.value)}
              />
            </Field>
          </div>
        </div>
      </Panel>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={submit} disabled={busy || !draft.placement}>
          <Save size={15} />
          {mode === "create" ? "保存对局" : "保存修改"}
        </Button>
        <Button onClick={() => navigate(-1)}>
          <ChevronLeft size={15} />
          取消
        </Button>
        {mode === "edit" && onDelete && (
          <Button variant="danger" onClick={onDelete} className="ml-auto">
            <Trash2 size={15} />
            删除对局
          </Button>
        )}
        {!draft.placement && (
          <span className="flex items-center gap-1 text-[11px] text-ink-600">
            <Zap size={12} /> 想更快？侧边栏的「快速记录一局」只要 20 秒
          </span>
        )}
      </div>
    </div>
  );
}
