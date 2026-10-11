import { useState } from "react";
import { Archive, CheckCircle2, Pencil, RotateCcw, Trash2, type LucideIcon } from "lucide-react";
import { MISTAKE_TYPE_LIST, mistakeLabel, GOAL_STATUS_LABELS } from "../../domain/labels";
import { dateKey, wallClockNow } from "../../lib/wallclock";
import type { GoalStatus, TrainingGoal } from "../../domain/types";
import type { TrainingGoalInput } from "../../domain/training/training-goal";

export function GoalForm({
  initial,
  busy,
  onCancel,
  onSave,
  errors,
}: {
  initial?: TrainingGoal;
  busy?: boolean;
  onCancel: () => void;
  onSave: (input: TrainingGoalInput) => void | Promise<void>;
  errors?: string[];
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [startDate, setStartDate] = useState(initial?.startDate ?? dateKey(wallClockNow()));
  const [endDate, setEndDate] = useState(initial?.endDate ?? "");
  const [related, setRelated] = useState<string[]>(initial?.relatedMistakes ?? []);
  const [status, setStatus] = useState<GoalStatus>(initial?.status ?? "active");

  const toggle = (type: string) =>
    setRelated((list) => (list.includes(type) ? list.filter((x) => x !== type) : [...list, type]));

  return (
    <form
      className="flex flex-col gap-4 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(buildGoalPayload({ title, description, startDate, endDate, related, status }));
      }}
    >
      {errors && errors.length > 0 && (
        <ul className="rounded-lg border border-bad/35 bg-bad/10 px-3 py-2 text-xs text-bad">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-400">
        目标名称 *
        <input
          value={title}
          placeholder="例如：控制 D 牌预算"
          onChange={(e) => setTitle(e.target.value)}
          className="rounded-lg border border-line bg-base-900/80 px-3 py-2 text-sm text-ink-50 outline-none placeholder:text-ink-600 focus:border-gold-500/55"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-400">
        目标说明
        <textarea
          value={description}
          rows={3}
          placeholder="写成可执行的判断标准，例如「4-1 之后不无计划地把金币全部 D 掉」"
          onChange={(e) => setDescription(e.target.value)}
          className="resize-y rounded-lg border border-line bg-base-900/80 px-3 py-2 text-sm leading-relaxed text-ink-50 outline-none placeholder:text-ink-600 focus:border-gold-500/55"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-400">
          开始日期 *
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-lg border border-line bg-base-900/80 px-3 py-2 text-sm text-ink-50 outline-none focus:border-gold-500/55"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-400">
          结束日期（可选）
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-lg border border-line bg-base-900/80 px-3 py-2 text-sm text-ink-50 outline-none focus:border-gold-500/55"
          />
        </label>
      </div>

      <div>
        <div className="mb-1.5 text-xs font-medium text-ink-400">相关错误类型</div>
        <div className="flex flex-wrap gap-1.5">
          {MISTAKE_TYPE_LIST.map((t) => {
            const on = related.includes(t);
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(t)}
                className={[
                  "rounded-md border px-2 py-1 text-xs transition-colors",
                  on
                    ? "border-gold-500/50 bg-gold-500/15 text-gold-300"
                    : "border-line bg-base-900/60 text-ink-400 hover:bg-base-800",
                ].join(" ")}
              >
                {mistakeLabel(t)}
              </button>
            );
          })}
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs font-medium text-ink-400">
        状态
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as GoalStatus)}
          className="rounded-lg border border-line bg-base-900/80 px-2.5 py-1.5 text-sm text-ink-50 outline-none"
        >
          <option value="active">进行中</option>
          <option value="completed">已完成</option>
          <option value="archived">已归档</option>
        </select>
      </label>

      <div className="flex items-center gap-2 border-t border-line pt-3">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-gold-500/45 bg-gold-500/12 px-3.5 text-sm font-medium text-gold-300 hover:bg-gold-500/22 disabled:opacity-45"
        >
          <CheckCircle2 size={14} />
          {initial ? "保存修改" : "创建目标"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-2 text-sm text-ink-400 hover:bg-base-800 hover:text-ink-200"
        >
          取消
        </button>
      </div>
    </form>
  );
}

import type { MistakeType } from "../../domain/types";

function buildGoalPayload(input: {
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  related: string[];
  status: GoalStatus;
}): TrainingGoalInput {
  return {
    title: input.title,
    description: input.description || undefined,
    startDate: input.startDate,
    endDate: input.endDate || undefined,
    relatedMistakes: input.related.length ? (input.related as MistakeType[]) : undefined,
    status: input.status,
  };
}

/** Actions depend on the goal's current status. */
export function GoalStatusActions({
  goal,
  onSetStatus,
  onEdit,
  onDelete,
}: {
  goal: TrainingGoal;
  onSetStatus: (s: GoalStatus) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const buttons: { icon: LucideIcon; label: string; show: boolean; onClick: () => void; danger?: boolean }[] = [
    { icon: Pencil, label: "编辑", show: true, onClick: onEdit },
    { icon: CheckCircle2, label: "标记完成", show: goal.status === "active", onClick: () => onSetStatus("completed") },
    { icon: RotateCcw, label: "重新激活", show: goal.status !== "active", onClick: () => onSetStatus("active") },
    { icon: Archive, label: "归档", show: goal.status === "active", onClick: () => onSetStatus("archived") },
    { icon: Trash2, label: "删除", show: true, onClick: onDelete, danger: true },
  ];

  return (
    <div className="flex flex-wrap items-center gap-1">
      {buttons
        .filter((b) => b.show)
        .map((b) => (
          <button
            key={b.label}
            type="button"
            onClick={b.onClick}
            title={b.label}
            className={[
              "inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] transition-colors",
              b.danger
                ? "text-ink-600 hover:bg-bad/15 hover:text-bad"
                : "text-ink-400 hover:bg-base-800 hover:text-ink-100",
            ].join(" ")}
          >
            <b.icon size={12} />
            {b.label}
          </button>
        ))}
    </div>
  );
}

export function goalStatusBadgeTone(status: GoalStatus): "gold" | "good" | "muted" {
  return status === "active" ? "gold" : status === "completed" ? "good" : "muted";
}

export function GoalCard({
  goal,
  onSetStatus,
  onEdit,
  onDelete,
}: {
  goal: TrainingGoal;
  onSetStatus: (s: GoalStatus) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="panel flex flex-col gap-2 p-4">
      <div className="flex flex-wrap items-start gap-2">
        <span className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-ink-50">{goal.title}</div>
          {goal.description && <p className="mt-0.5 text-xs leading-relaxed text-ink-400">{goal.description}</p>}
        </span>
        <span className="shrink-0 rounded-md border border-line bg-base-800 px-2 py-0.5 text-[11px] text-ink-400">
          {GOAL_STATUS_LABELS[goal.status]}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-600">
        <span>
          {goal.startDate}
          {goal.endDate ? ` – ${goal.endDate}` : " – 未设截止"}
        </span>
        {goal.relatedMistakes && goal.relatedMistakes.length > 0 && (
          <span className="flex flex-wrap items-center gap-1">
            相关：
            {goal.relatedMistakes.map((m) => (
              <span key={m} className="rounded bg-base-800 px-1.5 py-0.5 text-ink-400">
                {mistakeLabel(m as never)}
              </span>
            ))}
          </span>
        )}
      </div>

      <div className="mt-1 flex items-center justify-between border-t border-line pt-2">
        <GoalStatusActions goal={goal} onSetStatus={onSetStatus} onEdit={onEdit} onDelete={onDelete} />
      </div>
    </div>
  );
}
