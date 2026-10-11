import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import {
  CalendarClock,
  ChevronLeft,
  Pencil,
  Sparkles,
  Target,
  Trash2,
} from "lucide-react";
import { deleteMatch, getMatchBundle } from "../services/match-service";
import { listScreenshots, listUnattachedScreenshots, setScreenshotMatch } from "../services/screenshot-service";
import { getSessions } from "../services/session-service";
import { DAILY_SESSION_ID } from "../domain/types";
import type { Match } from "../domain/types";
import { addDecision, removeDecision, updateDecision } from "../services/decision-service";
import { currentGoals } from "../services/training-service";
import { mistakeLabel } from "../domain/labels";
import { encounterNameOrId } from "../components/matches/EncounterSelector";
import { errorMessage } from "../lib/errors";
import {
  durationOf,
  isBottom4,
  isTop4,
  isWin,
  placementText,
  placementTone,
} from "../domain/match/match";
import { formatDateWeekday, formatTime } from "../lib/wallclock";
import { formatDuration } from "../lib/utils";
import { DecisionPanel } from "../components/decisions/DecisionPanel";
import { DecisionTimeline } from "../components/decisions/DecisionTimeline";
import { ScreenshotGallery } from "../components/screenshots/ScreenshotGallery";
import { buildTimeline } from "../domain/decision/timeline";
import { Badge, EmptyState } from "../components/ui/Badge";
import { Button, LinkButton } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { Panel, PageHeader, PanelHeader } from "../components/ui/Panel";
import { Spinner } from "../components/ui/Spinner";
import { useToast } from "../components/ui/Toast";

export function MatchDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);

  const bundle = useLiveQuery(() => getMatchBundle(id), [id]);
  const goals = useLiveQuery(() => currentGoals(), []);
  const sessions = useLiveQuery(getSessions, []);
  const screenshotCount = useLiveQuery(() => listScreenshots(id).then((l) => l.length), [id]);
  const unattached = useLiveQuery(listUnattachedScreenshots, []);

  if (bundle === undefined) return <Spinner label="读取对局" />;
  if (bundle === null) {
    return (
      <>
        <PageHeader title="对局详情" />
        <Panel>
          <EmptyState
            title="找不到这局对局"
            description="它可能已经被删除，或链接失效。"
            action={<LinkButton to="/matches">返回对局列表</LinkButton>}
          />
        </Panel>
      </>
    );
  }

  const { match, review, decisions } = bundle;
  const tone = placementTone(match.placement);
  const relatedGoals = (goals ?? []).filter(
    (g) => match.primaryMistake && (g.relatedMistakes ?? []).includes(match.primaryMistake),
  );

  return (
    <>
      <div className="mb-4">
        <Link
          to="/matches"
          className="inline-flex items-center gap-1 text-xs text-ink-600 hover:text-ink-200"
        >
          <ChevronLeft size={13} />
          对局列表
        </Link>
      </div>

      <PageHeader
        title={`${placementText(match.placement)} · ${match.composition ?? "未填阵容"}`}
        subtitle={`${match.playedAt.slice(0, 10)} ${formatDateWeekday(match.playedAt)} · ${formatTime(match.playedAt) || "时间未填"}`}
        action={
          <>
            <LinkButton to={`/matches/${match.id}/review`} variant="primary">
              <Sparkles size={15} />
              {match.reviewed ? "查看复盘" : "开始复盘"}
            </LinkButton>
            <LinkButton to={`/matches/${match.id}/edit`}>
              <Pencil size={14} />
              编辑
            </LinkButton>
            <Button variant="danger" onClick={() => setConfirm(true)}>
              <Trash2 size={14} />
              删除
            </Button>
          </>
        }
      />

      <div className="grid gap-4 [&>*]:min-w-0 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Panel>
            <PanelHeader
              title="对局结果"
              action={
                <>
                  {isWin(match) && <Badge tone="gold">吃鸡</Badge>}
                  {isTop4(match) && <Badge tone="good">Top4</Badge>}
                  {isBottom4(match) && <Badge tone="bad">Bottom4</Badge>}
                </>
              }
            />
            {/* The placement is the first thing to read on this page — bigger
                than any other number here. Facts below appear only when the
                record actually carries them; a wall of em-dashes helps nobody. */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
              {/* 没有名次的记录不能显示成红色的 undefined：它只是还没结算。 */}
              <div
                className={`num font-semibold leading-none ${
                  match.placement === undefined
                    ? "text-2xl text-ink-400"
                    : `text-5xl ${tone === "gold" ? "text-gold-300" : tone === "good" ? "text-good" : "text-bad"}`
                }`}
              >
                {match.placement ?? "未结算"}
                {match.placement !== undefined && (
                  <span className="ml-1 text-base font-normal text-ink-400">名</span>
                )}
              </div>
              <dl className="grid min-w-0 flex-1 grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                <Fact label="日期" value={match.playedAt.slice(0, 10)} />
                {formatTime(match.startedAt ?? "") && (
                  <Fact label="开始" value={formatTime(match.startedAt ?? "")} />
                )}
                {durationOf(match) !== undefined && (
                  <Fact label="时长" value={formatDuration(durationOf(match))} />
                )}
                {match.finalLevel !== undefined && <Fact label="最终等级" value={match.finalLevel} />}
                {match.finalHealth !== undefined && (
                  <Fact label="结束时剩余血量" value={match.finalHealth} />
                )}
                {match.totalGold !== undefined && <Fact label="剩余金币" value={match.totalGold} />}
                {match.encounterId && (
                  <Fact label="开局事件" value={encounterNameOrId(match.encounterId)} />
                )}
              </dl>
            </div>
            {/* 还没结算：这条记录会一直在这儿，打完回来补名次和结束血量。 */}
            {match.placement === undefined && (
              <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
                <span className="text-xs text-ink-400">
                  这一局还没记录名次，暂不参与平均名次 / 前四率 / 吃鸡率。
                </span>
                <LinkButton to={`/matches/${match.id}/edit`} size="sm">
                  <Pencil size={12} />
                  补填赛果
                </LinkButton>
              </div>
            )}
            {match.notes && (
              <p className="border-t border-line px-4 py-3 text-sm text-ink-200">{match.notes}</p>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="决策时间线" subtitle="按回合排序" />
            <DecisionTimeline events={buildTimeline(match, decisions)} />
          </Panel>

          <Panel>
            <PanelHeader title="阵容 / 装备 / 强化符文" />
            <div className="flex flex-col gap-3 p-4">
              <TextRow label="最终阵容" value={match.composition} />
              <ChipRow label="主要羁绊" values={match.traits} />
              <ChipRow label="核心棋子" values={match.coreUnits} />
              <ChipRow label="核心装备" values={match.coreItems} />
              <ChipRow label="强化符文" values={match.augments} />
              {detailChipsEmpty(match) && (
                <p className="text-xs leading-relaxed text-ink-600">
                  还没有记录羁绊 / 棋子 / 装备细节。编辑这局对局可以补上。
                </p>
              )}
            </div>
          </Panel>

          <Panel>
            <PanelHeader
              title="结算截图"
              subtitle="保存在本机 IndexedDB，不进 JSON 备份"
              action={<Badge tone="muted">{screenshotCount ?? 0} 张</Badge>}
            />
            <ScreenshotGallery
              matchId={match.id}
              upload
              acceptPaste
              emptyTitle="还没有保存结算截图"
              emptyHint="把对局结算界面的图片存进来，以后可以查看和删除。支持 PNG / JPEG / WebP / GIF / BMP，单张不超过 10 MB。"
              onDetach={async (id) => {
                try {
                  await setScreenshotMatch(id);
                  toast.push("已转为未关联截图");
                } catch (err) {
                  toast.push(errorMessage(err), "warn");
                }
              }}
            />
            {(unattached?.length ?? 0) > 0 && (
              <div className="border-t border-line">
                <div className="px-4 pt-3 text-[11px] uppercase tracking-wide text-ink-600">
                  待关联的截图 · {unattached?.length}
                </div>
                <ScreenshotGallery
                  emptyTitle="没有待关联的截图"
                  emptyHint="取消关联后的截图会回到这里。"
                  onAttach={async (id) => {
                    try {
                      await setScreenshotMatch(id, match.id);
                      toast.push("已关联到本局");
                    } catch (err) {
                      toast.push(errorMessage(err), "warn");
                    }
                  }}
                />
              </div>
            )}
          </Panel>

          <DecisionPanel
            decisions={decisions}
            onAdd={async (input) => {
              try {
                await addDecision(match.id, input);
                toast.push("决策已记录");
              } catch (err) {
                toast.push(errorMessage(err), "warn");
              }
            }}
            onUpdate={async (decisionId, input) => {
              try {
                await updateDecision(decisionId, input);
                toast.push("决策已更新");
              } catch (err) {
                toast.push(errorMessage(err), "warn");
              }
            }}
            onRemove={async (decisionId) => {
              try {
                await removeDecision(decisionId);
                toast.push("决策已删除");
              } catch (err) {
                toast.push(errorMessage(err), "warn");
              }
            }}
          />
        </div>

        <div className="flex flex-col gap-4">
          <Panel>
            <PanelHeader
              title="复盘结论"
              action={
                <Badge tone={match.reviewed ? "good" : review ? "info" : "muted"}>
                  {match.reviewed ? "已复盘" : review ? "复盘中" : "未复盘"}
                </Badge>
              }
            />
            {review ? (
              <div className="flex flex-col gap-3 p-4 text-sm">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-ink-600">
                    主要问题
                  </div>
                  <div className="mt-1">
                    <Badge tone="bad">{mistakeLabel(review.primaryMistake ?? match.primaryMistake)}</Badge>
                  </div>
                </div>
                <TextRow label="最大问题" value={review.biggestMistake} />
                <TextRow label="做得最好" value={review.bestDecision} />
                <TextRow label="下局练习" value={review.nextGameFocus} />
                <LinkButton to={`/matches/${match.id}/review`} size="sm" className="mt-1">
                  打开完整复盘
                </LinkButton>
              </div>
            ) : (
              <EmptyState
                title="这局还没有复盘"
                description="开局 / 中期 / 后期 / 结论，四段话就够。"
                action={
                  <LinkButton to={`/matches/${match.id}/review`} variant="primary">
                    开始复盘
                  </LinkButton>
                }
              />
            )}
          </Panel>

          <Panel>
            <PanelHeader title="相关训练目标" action={<Target size={14} className="text-ink-600" />} />
            {relatedGoals.length > 0 ? (
              <ul className="flex flex-col gap-2 p-4">
                {relatedGoals.map((g) => (
                  <li key={g.id} className="rounded-lg border border-line bg-base-900/60 px-3 py-2">
                    <Link to="/goals" className="text-sm text-gold-300 hover:underline">
                      {g.title}
                    </Link>
                    {g.description && (
                      <p className="mt-0.5 text-xs text-ink-400">{g.description}</p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-4 text-xs text-ink-600">
                {match.primaryMistake
                  ? `当前没有针对「${mistakeLabel(match.primaryMistake)}」的训练目标。`
                  : "还没有训练目标，可在「训练目标」页创建。"}
              </p>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="这局的元数据" />
            <dl className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
              <Fact
                label="训练 Session"
                value={
                  sessions?.find((x) => x.id === (match.sessionId ?? DAILY_SESSION_ID))?.name ??
                  "日常训练"
                }
              />
              <Fact label="记录于" value={new Date(match.createdAt).toLocaleString("zh-CN")} />
              <Fact label="修改于" value={new Date(match.updatedAt).toLocaleString("zh-CN")} />
              <Fact label="决策记录" value={decisions.length} />
              <Fact label="对局 ID" value={match.id.slice(0, 8)} mono />
            </dl>
            <p className="flex items-center gap-1.5 border-t border-line px-4 py-2.5 text-[11px] text-ink-600">
              <CalendarClock size={12} />
              数据保存在本机浏览器 IndexedDB
            </p>
          </Panel>
        </div>
      </div>

      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="删除这局对局？"
        subtitle={
          screenshotCount
            ? `决策记录、复盘和 ${screenshotCount} 张截图会一起删除，不可撤销`
            : "决策记录和复盘会一起删除，不可撤销"
        }
        footer={
          <>
            <Button
              variant="danger"
              onClick={async () => {
                try {
                  await deleteMatch(match.id);
                  toast.push("对局已删除");
                  navigate("/matches");
                } catch (err) {
                  toast.push(errorMessage(err), "warn");
                }
              }}
            >
              确认删除
            </Button>
            <Button onClick={() => setConfirm(false)}>取消</Button>
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

function Fact({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | number | undefined;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-ink-600">{label}</dt>
      <dd className={`truncate text-sm text-ink-50 ${mono ? "num text-xs" : ""}`}>{value ?? "—"}</dd>
    </div>
  );
}

/** True when none of the structured composition details were recorded. */
function detailChipsEmpty(match: Match): boolean {
  return (
    !match.traits?.length &&
    !match.coreUnits?.length &&
    !match.coreItems?.length &&
    !match.augments?.length
  );
}

function TextRow({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-ink-600">{label}</div>
      <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink-100">
        {value || <span className="text-ink-600">未填写</span>}
      </p>
    </div>
  );
}

function ChipRow({ label, values }: { label: string; values?: string[] }) {
  // Empty slots render nothing: the panel shows one collective hint instead
  // of a column of 未填写.
  if (!values || values.length === 0) return null;
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-ink-600">{label}</div>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span
            key={v}
            className="rounded-md border border-line bg-base-900/70 px-2 py-0.5 text-xs text-ink-200"
          >
            {v}
          </span>
        ))}
      </div>
    </div>
  );
}
