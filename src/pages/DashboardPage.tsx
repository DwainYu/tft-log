import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, CalendarClock, Play, Sparkles } from "lucide-react";
import {
  allOverall,
  allStreak,
  compositionChart,
  compositionDrillQuery,
  mistakeChart,
  mistakeDrillQuery,
  trend,
  windowComparison,
} from "../services/stats-service";
import { currentGoals } from "../services/training-service";
import { recentMatches } from "../services/match-service";
import { loadDemoData } from "../services/demo-service";
import { useSession } from "../services/session-context";
import { goalStatusLabel } from "../domain/training/training-goal";
import { mistakeLabel } from "../domain/labels";
import { UNCLASSIFIED } from "../domain/stats/stats";
import { formatNumber } from "../lib/utils";
import { MatchList } from "../components/matches/MatchList";
import { formatRateValue, StatCard } from "../components/stats/StatCard";
import { MIN_SAMPLES } from "../components/stats/chart-theme";
import { PlacementTrendChart } from "../components/stats/PlacementTrendChart";
import { MistakeBarChart } from "../components/stats/MistakeBarChart";
import { StatTable, type StatTableColumn } from "../components/stats/StatTable";
import { Badge, EmptyState } from "../components/ui/Badge";
import { Button, LinkButton } from "../components/ui/Button";
import { Panel, PageHeader, PanelHeader } from "../components/ui/Panel";
import { Spinner } from "../components/ui/Spinner";

/** "How am I doing lately?" — the window every Dashboard number is measured on. */
const WINDOW = 10;

export function DashboardPage() {
  const navigate = useNavigate();
  const [demoLoading, setDemoLoading] = useState(false);
  const { sessions, activeSession, activeSessionId, ready } = useSession();
  // Every statistic below is scoped to the active session; "all sessions"
  // stays available on the Matches / Statistics pages.
  const overall = useLiveQuery(() => allOverall(activeSessionId), [activeSessionId, ready]);
  const streak = useLiveQuery(() => allStreak(activeSessionId), [activeSessionId, ready]);
  const comparison = useLiveQuery(
    () => windowComparison(WINDOW, activeSessionId),
    [activeSessionId, ready],
  );
  const trendSeries = useLiveQuery(() => trend(WINDOW, activeSessionId), [activeSessionId, ready]);
  const mistakes = useLiveQuery(() => mistakeChart(activeSessionId), [activeSessionId, ready]);
  const compositions = useLiveQuery(() => compositionChart(activeSessionId), [activeSessionId, ready]);
  const recent = useLiveQuery(
    () => recentMatches(8, { sessionId: activeSessionId }),
    [activeSessionId, ready],
  );
  const goals = useLiveQuery(currentGoals, []);

  // One loading gate for the whole page: a chart that renders `[]` while its
  // query is still in flight would claim "no data" for a second.
  const loading =
    overall === undefined ||
    comparison === undefined ||
    trendSeries === undefined ||
    mistakes === undefined ||
    compositions === undefined ||
    recent === undefined;
  if (loading) return <Spinner label="读取训练状态" />;

  const goal = goals?.[0];
  const unreviewed = overall.games - overall.reviewedGames;
  const sessionSubtitle = activeSession
    ? `${activeSession.name}${activeSession.endDate ? `（${activeSession.startDate} – ${activeSession.endDate}）` : " · 持续进行"}`
    : "日常训练";

  // No record button up here on purpose: the sidebar already offers both ways
  // in (快速记录一局 opens the dialog, 完整对局记录 opens the form) from every
  // page, so a second copy here was pure duplication. The empty state below
  // keeps its own call to action because that one is onboarding, not a shortcut.
  const header = (
    <PageHeader
      title="训练状态"
      subtitle={`${sessionSubtitle} · ${sessions.length > 0 ? "按当前训练统计" : "数据全部保存在本机"}`}
    />
  );

  if (overall.games === 0) {
    return (
      <>
        {header}
        <Panel>
          <EmptyState
            title="这个训练下还没有记录对局"
            description="从左侧的「快速记录一局」20 秒记完一局，或用「完整对局记录」填写更多细节。记录第一局后，这里会开始显示训练趋势。"
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <LinkButton to="/matches/new" variant="primary">
                  <Play size={14} />
                  记录第一局
                </LinkButton>
                <Button
                  disabled={demoLoading}
                  onClick={() => {
                    setDemoLoading(true);
                    void loadDemoData().finally(() => setDemoLoading(false));
                  }}
                >
                  <Sparkles size={14} />
                  {demoLoading ? "载入中" : "载入示例数据"}
                </Button>
              </div>
            }
          />
        </Panel>
      </>
    );
  }

  const recent10 = comparison.recent;
  const delta = comparison.deltaAvg;
  const deltaText =
    delta === null
      ? `满 ${WINDOW * 2} 局后显示变化`
      : delta < 0
        ? `较前 ${WINDOW} 场好转 ${Math.abs(delta)}`
        : delta > 0
          ? `较前 ${WINDOW} 场下滑 ${delta}`
          : `与前 ${WINDOW} 场持平`;

  const mistakeSample = mistakes.reduce((sum, m) => sum + m.count, 0);
  // "全部未分类" is not a mistake profile — it is a review backlog. Drawing a
  // single giant 未分类 bar would waste the second panel on nothing.
  const mistakesUnclassifiedOnly =
    mistakes.length === 1 && mistakes[0].key === UNCLASSIFIED && mistakeSample > 0;

  const compositionRows = [...compositions].sort((a, b) => {
    const enough = (games: number) => games >= MIN_SAMPLES.compositionRow;
    if (enough(a.games) !== enough(b.games)) return enough(a.games) ? -1 : 1;
    return b.games - a.games || a.composition.localeCompare(b.composition);
  });
  const compositionColumns: StatTableColumn<(typeof compositionRows)[number]>[] = [
    { key: "comp", label: "阵容", render: (r) => <span className="text-ink-50">{r.composition}</span> },
    { key: "games", label: "场次", align: "right", render: (r) => r.games },
    {
      key: "avg",
      label: "平均名次",
      align: "right",
      render: (r) =>
        r.games >= MIN_SAMPLES.compositionRow ? (
          formatNumber(r.avgPlacement, 1)
        ) : (
          <span className="text-ink-600">样本不足</span>
        ),
    },
    {
      key: "top4",
      label: "Top4 率",
      align: "right",
      render: (r) =>
        r.games >= MIN_SAMPLES.compositionRow ? (
          formatRateValue(r.top4Rate)
        ) : (
          <span className="text-ink-600">样本不足</span>
        ),
    },
  ];

  return (
    <>
      {header}

      {/* Layer 1 — how am I doing lately. Five numbers, five different facts. */}
      {/* 2 columns even on a phone: the labels are short enough not to wrap,
          and 5 stacked tiles would push the trend chart off-screen. */}
      {/* min-w-0: a nowrap table (阵容表现) would otherwise widen its grid
          track past the viewport and push the whole page sideways. */}
      <div className="mb-4 grid grid-cols-2 gap-3 [&>*]:min-w-0 lg:grid-cols-5">
        <StatCard
          label={`近 ${WINDOW} 场平均名次`}
          value={formatNumber(recent10.avgPlacement, 1)}
          tone="gold"
          emphasis
          sub={deltaText}
          trend={
            delta === null || delta === 0
              ? undefined
              : { direction: delta < 0 ? "down" : "up", tone: delta < 0 ? "good" : "bad" }
          }
        />
        <StatCard
          label={`Top4 率 · 近 ${WINDOW} 场`}
          value={formatRateValue(recent10.top4Rate)}
          tone="good"
          sub={`${recent10.top4} / ${recent10.games} 局`}
        />
        <StatCard
          label="吃鸡"
          value={String(overall.wins)}
          tone={overall.wins > 0 ? "gold" : "neutral"}
          sub={`本训练 ${overall.games} 局`}
        />
        <StatCard label="场次" value={String(overall.games)} sub={`${overall.reviewedGames} 局已复盘`} />
        <StatCard
          label="连续训练"
          value={`${streak ?? "—"} 天`}
          sub={streak ? "有对局的连续天数" : "记录今天的第一局"}
        />
      </div>

      <div className="grid gap-4 [&>*]:min-w-0 lg:grid-cols-3">
        {/* Layer 2 — why. */}
        <Panel className="lg:col-span-2">
          <PanelHeader
            title="最近名次趋势"
            subtitle={`近 ${WINDOW} 场 · 蓝点为 Top4 · 点击圆点打开该局`}
          />
          <div className="p-4">
            <PlacementTrendChart
              data={trendSeries}
              avg={recent10.avgPlacement}
              onSelectMatch={(id) => navigate(`/matches/${id}`)}
            />
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="主要问题"
            subtitle="Primary Mistake · 点击柱子查看这几局"
          />
          {mistakesUnclassifiedOnly ? (
            <div className="flex flex-col items-start gap-2 p-4">
              <p className="text-xs leading-relaxed text-ink-400">
                已记录 {mistakeSample} 局，但还没有复盘。复盘时给每局选一个 Primary
                Mistake，这里才会显示你真正的问题分布。
              </p>
              <LinkButton to="/matches?reviewed=unreviewed" size="sm">
                去复盘 {mistakeSample} 局 <ArrowRight size={12} />
              </LinkButton>
            </div>
          ) : (
            <div className="p-4">
              <MistakeBarChart
                data={mistakes}
                onSelect={(key) => navigate(`/matches?${mistakeDrillQuery(key)}`)}
              />
              {/* Text alternative to the bars: same numbers, reachable without
                  hovering a bar (touch, keyboard, screen reader). */}
              {mistakeSample >= MIN_SAMPLES.mistake && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {mistakes.slice(0, 3).map((m) => (
                    <Link
                      key={m.key}
                      to={`/matches?${mistakeDrillQuery(m.key)}`}
                      className="rounded-md border border-line bg-base-800 px-1.5 py-0.5 text-[11px] text-ink-200 underline-offset-4 hover:underline"
                    >
                      {m.label} × {m.count}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </Panel>

        <Panel className="lg:col-span-2">
          <PanelHeader
            title="阵容表现"
            subtitle="按你记录的阵容名统计（羁绊单独记录，不计入这里）"
          />
          <StatTable
            columns={compositionColumns}
            rows={compositionRows}
            rowHref={(row) => compositionDrillQuery(row.composition)}
            empty={`还没有填过阵容。记录对局时选一个阵容，同一个阵容记满 ${MIN_SAMPLES.compositionRow} 局后这里会给出平均名次。`}
          />
        </Panel>

        <Panel>
          <PanelHeader
            title="当前训练目标"
            action={
              goal ? (
                <Badge tone="gold">{goalStatusLabel(goal.status)}</Badge>
              ) : (
                <Badge tone="muted">无</Badge>
              )
            }
          />
          {goal ? (
            <div className="flex flex-col gap-2 p-4">
              <div className="text-base font-semibold text-ink-50">{goal.title}</div>
              {goal.description && <p className="text-xs leading-relaxed text-ink-400">{goal.description}</p>}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-600">
                <span className="flex items-center gap-1">
                  <CalendarClock size={12} /> {goal.startDate}
                  {goal.endDate ? ` – ${goal.endDate}` : ""}
                </span>
              </div>
              {goal.relatedMistakes && goal.relatedMistakes.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-ink-600">
                  相关错误：
                  {goal.relatedMistakes.map((m) => (
                    <Link
                      key={m}
                      to={`/matches?${mistakeDrillQuery(m)}`}
                      className="text-gold-300 underline-offset-4 hover:underline"
                    >
                      {mistakeLabel(m)}
                    </Link>
                  ))}
                </div>
              )}
              <div className="mt-1 flex gap-2">
                <LinkButton to="/goals" size="sm">管理目标</LinkButton>
              </div>
            </div>
          ) : (
            <div className="p-4">
              <p className="text-xs leading-relaxed text-ink-600">
                还没有进行中的训练目标。把反复出现的错误变成一个明确、可执行的练习目标。
              </p>
              <div className="mt-3">
                <LinkButton to="/goals" variant="primary" size="sm">
                  创建目标
                </LinkButton>
              </div>
            </div>
          )}
        </Panel>
      </div>

      {/* Layer 3 — which games should I open. */}
      <Panel className="mt-4">
        <PanelHeader
          title="最近对局"
          subtitle={`最新 ${Math.min(recent.length, 8)} 局 · ${activeSession?.name ?? "日常训练"}`}
          action={
            <div className="flex items-center gap-2">
              {unreviewed > 0 && (
                <LinkButton to="/matches?reviewed=unreviewed" size="sm">
                  未复盘 {unreviewed} 局 <ArrowRight size={12} />
                </LinkButton>
              )}
              <LinkButton to="/matches" size="sm">
                全部对局 <ArrowRight size={12} />
              </LinkButton>
            </div>
          }
        />
        <MatchList matches={recent} variant="compact" />
      </Panel>
    </>
  );
}
