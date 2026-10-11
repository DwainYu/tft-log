import { useState } from "react";
import { Plus, Target } from "lucide-react";
import {
  allGoals,
  addGoal,
  removeGoal,
  setGoalStatus,
  updateGoal,
} from "../services/training-service";
import { useLiveQuery } from "dexie-react-hooks";
import { isGoalCurrent, type TrainingGoalInput } from "../domain/training/training-goal";
import type { GoalStatus, TrainingGoal } from "../domain/types";
import { errorMessage } from "../lib/errors";
import { Modal } from "../components/ui/Modal";
import { Button, LinkButton } from "../components/ui/Button";
import { EmptyState } from "../components/ui/Badge";
import { PageHeader, Panel } from "../components/ui/Panel";
import { Spinner } from "../components/ui/Spinner";
import { useToast } from "../components/ui/Toast";
import { GoalCard, GoalForm } from "../components/goals/GoalComponents";

type Filter = "all" | GoalStatus;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "active", label: "进行中" },
  { value: "completed", label: "已完成" },
  { value: "archived", label: "已归档" },
];

export function TrainingGoalsPage() {
  const goals = useLiveQuery(allGoals, []);
  const [filter, setFilter] = useState<Filter>("all");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TrainingGoal | null>(null);
  const [deleting, setDeleting] = useState<TrainingGoal | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const toast = useToast();

  if (goals === undefined) return <Spinner label="读取训练目标" />;

  const shown = goals.filter((g) => filter === "all" || g.status === filter);
  const active = goals.filter((g) => isGoalCurrent(g));

  async function setStatus(goal: TrainingGoal, status: GoalStatus) {
    try {
      await setGoalStatus(goal.id, status);
      toast.push(status === "completed" ? "目标已完成 🎉" : "状态已更新");
    } catch (err) {
      toast.push(errorMessage(err), "warn");
    }
  }

  function saveGoal(input: TrainingGoalInput) {
    (async () => {
      try {
        if (editing) {
          await updateGoal(editing.id, input);
          toast.push("目标已更新");
          setEditing(null);
        } else {
          await addGoal(input);
          toast.push("训练目标已创建");
          setCreating(false);
        }
      } catch (err) {
        setErrors([errorMessage(err)]);
      }
    })();
  }

  return (
    <>
      <PageHeader
        title="训练目标"
        subtitle="把反复出现的错误变成一个明确、可执行的练习目标"
        action={
          <Button variant="primary" onClick={() => { setCreating(true); setErrors([]); }}>
            <Plus size={15} />
            新建目标
          </Button>
        }
      />

      {active.length > 0 && (
        <Panel className="mb-4 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Target size={18} className="text-gold-300" />
            <div>
              <div className="text-[11px] uppercase tracking-wide text-ink-600">当前训练目标</div>
              <div className="text-sm font-semibold text-gold-300">{active[0].title}</div>
            </div>
            {active[0].description && (
              <p className="min-w-0 flex-1 text-xs text-ink-400">{active[0].description}</p>
            )}
          </div>
        </Panel>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={[
              "rounded-lg px-3 py-1.5 text-xs transition-colors",
              filter === f.value
                ? "border border-gold-500/40 bg-gold-500/10 text-gold-300"
                : "border border-transparent text-ink-400 hover:bg-base-800 hover:text-ink-200",
            ].join(" ")}
          >
            {f.label}
            <span className="num ml-1.5 text-ink-600">
              {f.value === "all" ? goals.length : goals.filter((g) => g.status === f.value).length}
            </span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <Panel>
          <EmptyState
            title={filter === "all" ? "还没有训练目标" : "这个状态下没有目标"}
            description={
              filter === "all"
                ? "例如：「控制 D 牌预算」—— 4-1 之后不无计划地把金币全部 D 掉，绑定 ROLLING / ECONOMY。"
                : "换一个筛选看看。"
            }
            action={
              filter === "all" ? (
                <Button variant="primary" onClick={() => setCreating(true)}>
                  创建第一个目标
                </Button>
              ) : undefined
            }
          />
        </Panel>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {shown.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              onSetStatus={(s) => setStatus(goal, s)}
              onEdit={() => {
                setEditing(goal);
                setErrors([]);
              }}
              onDelete={() => setDeleting(goal)}
            />
          ))}
        </div>
      )}

      <Modal
        open={creating || editing !== null}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        title={editing ? "编辑训练目标" : "新建训练目标"}
        size="lg"
        footer={
          <span className="text-[11px] text-ink-600">
            目标要可执行、可检验 —— 「4-1 后不无计划 D 到见底」好过「注意经济」
          </span>
        }
      >
        <GoalForm
          initial={editing ?? undefined}
          errors={errors}
          onCancel={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSave={saveGoal}
        />
      </Modal>

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="删除这个目标？"
        subtitle="删除后无法恢复"
        footer={
          <>
            <Button
              variant="danger"
              onClick={async () => {
                if (!deleting) return;
                try {
                  await removeGoal(deleting.id);
                  setDeleting(null);
                  toast.push("目标已删除");
                } catch (err) {
                  toast.push(errorMessage(err), "warn");
                }
              }}
            >
              删除
            </Button>
            <Button onClick={() => setDeleting(null)}>取消</Button>
          </>
        }
      >
        <p className="text-sm text-ink-200">{deleting?.title}</p>
      </Modal>

      {goals.length === 0 && (
        <div className="mt-4">
          <LinkButton to="/statistics" size="sm">
            看看错误统计，挑一个高频错误做成目标
          </LinkButton>
        </div>
      )}
    </>
  );
}
