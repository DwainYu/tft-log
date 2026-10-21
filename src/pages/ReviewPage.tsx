import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronLeft, ListChecks } from "lucide-react";
import { deleteReview, deleteReviewDraft, getReviewDraft, saveReview } from "../services/review-service";
import { getMatchBundle } from "../services/match-service";
import type { ReviewInput } from "../domain/review/review";
import type { OpeningPlan } from "../domain/types";
import { mistakeLabel, openingPlanLabel } from "../domain/labels";
import { encounterNameOrId } from "../components/matches/EncounterSelector";
import {
  durationOf,
  isBottom4,
  isTop4,
  isWin,
  placementTone,
  placementText,
} from "../domain/match/match";
import { buildTimeline } from "../domain/decision/timeline";
import { errorMessage, ValidationError } from "../lib/errors";
import { formatDuration } from "../lib/utils";
import { formatDateWeekday, formatTime } from "../lib/wallclock";
import { DecisionTimeline } from "../components/decisions/DecisionTimeline";
import { ReviewForm } from "../components/reviews/ReviewForm";
import { Badge } from "../components/ui/Badge";
import { Button, LinkButton } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { PageHeader, Panel, PanelHeader } from "../components/ui/Panel";
import { Spinner } from "../components/ui/Spinner";
import { useToast } from "../components/ui/Toast";

const PLACEMENT_TONE_CLASS = {
  gold: "text-gold-300",
  good: "text-good",
  bad: "text-bad",
  // 还没结算的对局：不涂色，也不该看起来像打崩了。
  muted: "text-ink-600",
} as const;

export function ReviewPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const bundle = useLiveQuery(() => getMatchBundle(id), [id]);
  // Resolved *before* the form mounts: `ReviewForm` seeds its state from the
  // draft on first render, so it must already know whether one exists. `null`
  // means "loaded and there is none" — `undefined` would be indistinguishable
  // from "still loading" and would pin the page on the spinner forever.
  const draft = useLiveQuery(() => getReviewDraft(id).then((d) => d ?? null), [id]);

  if (bundle === undefined || draft === undefined) return <Spinner label="读取复盘" />;
  if (bundle === null) {
    return (
      <>
        <PageHeader title="赛后复盘" />
        <Panel className="p-6">
          <p className="text-sm text-ink-400">找不到这局对局。</p>
          <LinkButton to="/matches" className="mt-3">
            返回对局列表
          </LinkButton>
        </Panel>
      </>
    );
  }

  const { match, review, decisions } = bundle;
  const duration = durationOf(match);
  const tone = placementTone(match.placement);
  // Same three states Match Detail uses — UI-02 semantics, no fourth one.
  const status = match.reviewed
    ? { label: "已复盘", tone: "good" as const }
    : review
      ? { label: "复盘中", tone: "info" as const }
      : { label: "未复盘", tone: "muted" as const };

  async function onSubmit(input: ReviewInput, openingPlan: OpeningPlan | null) {
    setBusy(true);
    setErrors([]);
    try {
      await saveReview(match.id, input, openingPlan);
      // The 复盘 is now the real record; its draft must not linger, or this
      // match would show up in the drafts box next to the finished write-up.
      await deleteReviewDraft(match.id);
      toast.push("复盘已保存 · 这局标记为已复盘");
      navigate(`/matches/${match.id}`);
    } catch (err) {
      setErrors(err instanceof ValidationError ? err.errors : [errorMessage(err)]);
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mb-4">
        <Link
          to={`/matches/${match.id}`}
          className="inline-flex items-center gap-1 text-xs text-ink-600 hover:text-ink-200"
        >
          <ChevronLeft size={13} />
          对局详情
        </Link>
      </div>

      <PageHeader
        title="赛后复盘"
        action={
          <>
            <Badge tone={status.tone}>{status.label}</Badge>
            {match.primaryMistake && (
              <Badge tone="bad">{mistakeLabel(match.primaryMistake)}</Badge>
            )}
          </>
        }
      />

      {/* ① 对局上下文 — the page has to answer "which game am I reviewing"
          before asking anything else, on every viewport. */}
      <section aria-label="对局上下文" className="panel mb-4 p-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-3">
            <div
              className={`num text-4xl font-semibold leading-none ${PLACEMENT_TONE_CLASS[tone]}`}
            >
              {match.placement ?? "—"}
              <span className="ml-1 text-sm font-normal text-ink-400">
                {match.placement === undefined ? "未记录名次" : "名"}
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                {isWin(match) && <Badge tone="gold">吃鸡</Badge>}
                {isTop4(match) && <Badge tone="good">Top4</Badge>}
                {isBottom4(match) && <Badge tone="bad">Bottom4</Badge>}
              </div>
              <p className="num text-xs text-ink-400">
                {match.playedAt.slice(0, 10)} {formatDateWeekday(match.playedAt)}{" "}
                {formatTime(match.playedAt)}
                {duration !== undefined && ` · ${formatDuration(duration)}`}
              </p>
            </div>
          </div>
          <div className="min-w-0 sm:ml-auto sm:text-right">
            <div className="text-[11px] text-ink-600">阵容</div>
            <div className="truncate text-sm text-ink-50" title={match.composition ?? "未填阵容"}>
              {match.composition ?? "未填阵容"}
            </div>
            {match.coreUnits?.length ? (
              <div
                className="truncate text-xs text-ink-600"
                title={`核心棋子 ${match.coreUnits.join(" / ")}`}
              >
                核心棋子 {match.coreUnits.join(" / ")}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <div className="grid gap-4 [&>*]:min-w-0 lg:grid-cols-[minmax(0,1fr)_300px]">
        <ReviewForm
          // Remount per match: the form seeds its state once, so without this
          // a direct jump to another game's review would keep the old answers.
          key={match.id}
          matchId={match.id}
          initial={review}
          initialOpeningPlan={match.openingPlan}
          errors={errors}
          busy={busy}
          draft={draft ?? undefined}
          hasDraft={draft !== undefined}
          onSave={onSubmit}
          onDiscard={() => navigate(`/matches/${match.id}`)}
        />

        <aside aria-label="这局的只读资料" className="flex flex-col gap-4">
          <Panel>
            <PanelHeader title="对局资料" subtitle="只读" />
            <dl className="flex flex-col gap-2 p-4">
              <SideFact label="阵容" value={match.composition} />
              <SideFact label="等级" value={match.finalLevel?.toString()} />
              <SideFact label="结束时剩余血量" value={match.finalHealth?.toString()} />
              <SideFact label="核心棋子" value={match.coreUnits?.join(" / ")} />
              <SideFact label="核心装备" value={match.coreItems?.join(" / ")} />
              <SideFact label="强化符文" value={match.augments?.join(" / ")} />
              <SideFact label="开局事件" value={encounterNameOrId(match.encounterId)} />
              <SideFact label="开局路线" value={openingPlanLabel(match.openingPlan)} />
            </dl>
          </Panel>

          <Panel>
            <PanelHeader
              title="决策回放"
              subtitle="这局是怎么一步步走到这个结果的"
              action={
                <Badge tone="muted" className="ml-auto">
                  {decisions.length} 条
                </Badge>
              }
            />
            <DecisionTimeline events={buildTimeline(match, decisions)} />
            <p className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3 text-xs text-ink-600">
              <ListChecks size={14} className="shrink-0 text-ink-600" />
              决策不在复盘表单里 —— 去对局详情添加或后视评价。
              <LinkButton to={`/matches/${match.id}`} size="sm" className="ml-auto">
                去对局详情
              </LinkButton>
            </p>
          </Panel>

          {review && (
            <Panel>
              <PanelHeader title="复盘操作" />
              <div className="flex flex-col gap-2 p-4">
                <p className="text-xs leading-relaxed text-ink-600">
                  删除后这局回到「未复盘」状态，已写的内容不会保留。
                </p>
                <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
                  删除复盘
                </Button>
              </div>
            </Panel>
          )}
        </aside>
      </div>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="删除这局的复盘？"
        subtitle="这局会回到「未复盘」状态"
        footer={
          <>
            <Button
              variant="danger"
              onClick={async () => {
                await deleteReview(match.id);
                toast.push("复盘已删除");
                setConfirmDelete(false);
                navigate(`/matches/${match.id}`);
              }}
            >
              确认删除
            </Button>
            <Button onClick={() => setConfirmDelete(false)}>取消</Button>
          </>
        }
      >
        <p className="text-sm text-ink-200">
          {placementText(match.placement)} · {match.playedAt.slice(0, 10)} ·{" "}
          {match.composition ?? "未填阵容"}
        </p>
      </Modal>
    </>
  );
}

function SideFact({ label, value }: { label: string; value?: string }) {
  const shown = value || "未填";
  return (
    <div className="flex items-baseline gap-2">
      <dt className="w-16 shrink-0 text-[11px] text-ink-600">{label}</dt>
      <dd className="min-w-0 flex-1 truncate text-ink-200" title={shown}>
        {value || <span className="text-ink-600">未填</span>}
      </dd>
    </div>
  );
}
