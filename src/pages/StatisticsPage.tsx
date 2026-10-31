import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import {
  allOverall,
  allStreak,
  augmentChart,
  compositionChart,
  compositionDrillQuery,
  decisionHindsightChart,
  decisionTypeChart,
  mistakeChart,
  mistakeDrillQuery,
  mistakeTrendChart,
  numericBreakdownChart,
  openingCoverageChart,
  openingPlanChart,
  recentWindow,
  reviewCoverageChart,
  timeSlotChart,
  trend,
} from "../services/stats-service";
import { useSession } from "../services/session-context";
import { decisionLabel, hindsightLabel, mistakeLabel, openingPlanLabel } from "../domain/labels";
import { UNCLASSIFIED } from "../domain/stats/stats";
import type { DecisionHindsight, DecisionType } from "../domain/types";
import { formatRateValue, StatCard } from "../components/stats/StatCard";
import { MIN_SAMPLES } from "../components/stats/chart-theme";
import { MistakeBarChart } from "../components/stats/MistakeBarChart";
import { PlacementTrendChart, type TrendPoint } from "../components/stats/PlacementTrendChart";
import { GroupStatTable } from "../components/stats/GroupStatTable";
import { ChartEmpty } from "../components/stats/ChartEmpty";
import { StatTable, type StatTableColumn } from "../components/stats/StatTable";
import { EmptyState } from "../components/ui/Badge";
import { Select } from "../components/ui/Field";
import { LinkButton } from "../components/ui/Button";
import { Panel, PageHeader, PanelHeader } from "../components/ui/Panel";
import { Spinner } from "../components/ui/Spinner";
import { formatNumber } from "../lib/utils";

type Scope = "current" | "all";

export function StatisticsPage() {
  const navigate = useNavigate();
  const { activeSession, activeSessionId, ready } = useSession();
  const [scope, setScope] = useState<Scope>("current");
  // `undefined` = 全部训练; a session id = that training context only.
  const sessionId = scope === "current" && ready ? activeSessionId : undefined;

  const overall = useLiveQuery(() => allOverall(sessionId), [sessionId]);
  const streak = useLiveQuery(() => allStreak(sessionId), [sessionId]);
  const trendSeries = useLiveQuery(() => trend(20, sessionId), [sessionId]) as
    | TrendPoint[]
    | undefined;
  const last10 = useLiveQuery(() => recentWindow(10, sessionId), [sessionId]);
  const last20 = useLiveQuery(() => recentWindow(20, sessionId), [sessionId]);
  const mistakes = useLiveQuery(() => mistakeChart(sessionId), [sessionId]);
  const compositions = useLiveQuery(() => compositionChart(sessionId), [sessionId]);
  const openings = useLiveQuery(() => openingPlanChart(sessionId), [sessionId]);
  const slots = useLiveQuery(() => timeSlotChart(sessionId), [sessionId]);
  const openingCoverage = useLiveQuery(() => openingCoverageChart(sessionId), [sessionId]);
  const reviewCov = useLiveQuery(() => reviewCoverageChart(sessionId), [sessionId]);
  const decisionTypes = useLiveQuery(() => decisionTypeChart(sessionId), [sessionId]);
  const decisionHindsight = useLiveQuery(() => decisionHindsightChart(sessionId), [sessionId]);
  const augments = useLiveQuery(() => augmentChart(sessionId), [sessionId]);
  const mistakeWindows = useLiveQuery(() => mistakeTrendChart(10, sessionId), [sessionId]);
  const numeric = useLiveQuery(() => numericBreakdownChart(sessionId), [sessionId]);

  // Wait for every query before rendering: a chart fed `[]` while its data is
  // still in flight would flash "no data" and then fill in.
  const loading =
    overall === undefined ||
    trendSeries === undefined ||
    mistakes === undefined ||
    compositions === undefined ||
    openings === undefined ||
    slots === undefined ||
    openingCoverage === undefined ||
    reviewCov === undefined ||
    decisionTypes === undefined ||
    decisionHindsight === undefined ||
    augments === undefined ||
    mistakeWindows === undefined ||
    numeric === undefined;
  if (loading) return <Spinner label="计算统计" />;

  const scopeControl = (
    <label className="flex items-center gap-2 text-xs text-ink-400">
      <span className="shrink-0">数据范围</span>
      <Select
        aria-label="数据范围"
        value={scope}
        onChange={(e) => setScope(e.target.value as Scope)}
        className="w-44 py-1.5 text-xs"
      >
        <option value="current">当前训练（{activeSession?.name ?? "日常训练"}）</option>
        <option value="all">全部训练</option>
      </Select>
    </label>
  );

  if (overall.games === 0) {
    return (
      <>
        <PageHeader
          title="统计"
          subtitle="整体表现 · 趋势 · 错误 · 阵容 · 时间段"
          action={scopeControl}
        />
        <Panel>
          <EmptyState
            title={scope === "current" ? "当前训练下还没有数据可以统计" : "还没有数据可以统计"}
            description={
              scope === "current"
                ? "这个训练下记录几局之后，这里会出现平均名次、Top4 率、错误分布等；也可以切换到「全部训练」。"
                : "记录几局之后，这里会出现平均名次、Top4 率、错误分布等。"
            }
            action={
              <LinkButton to="/matches/new" variant="primary">
                去记录第一局
              </LinkButton>
            }
          />
        </Panel>
      </>
    );
  }

  const trendAvg = trendSeries && trendSeries.length > 0 ? last20?.avgPlacement ?? null : null;

  const mistakeSample = (mistakes ?? []).reduce((sum, m) => sum + m.count, 0);
  // "全部未分类" is a review backlog, not a mistake profile — the same rule the
  // Dashboard applies.
  const mistakesUnclassifiedOnly =
    mistakes.length === 1 && mistakes[0].key === UNCLASSIFIED && mistakeSample > 0;
  // The window comparison needs classified mistakes on both sides to say
  // anything; counting 未分类 10/10 is not a structure.
  const classifiedWindowCount = mistakeWindows
    .filter((r) => r.key !== UNCLASSIFIED)
    .reduce((sum, r) => sum + r.recent + r.previous, 0);

  const compositionColumns: StatTableColumn<NonNullable<typeof compositions>[number]>[] = [
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
    {
      key: "last",
      label: "最近使用",
      align: "right",
      render: (r) => <span className="text-ink-600">{r.lastPlayed.slice(0, 10)}</span>,
    },
  ];

  const openingColumns: StatTableColumn<NonNullable<typeof openings>[number]>[] = [
    { key: "plan", label: "开局路线", render: (r) => <span className="text-ink-50">{openingPlanLabel(r.plan)}</span> },
    { key: "games", label: "场次", align: "right", render: (r) => r.games },
    {
      key: "avg",
      label: "平均名次",
      align: "right",
      render: (r) =>
        r.games >= MIN_SAMPLES.openingRow ? (
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
        r.games >= MIN_SAMPLES.openingRow ? (
          formatRateValue(r.top4Rate)
        ) : (
          <span className="text-ink-600">样本不足</span>
        ),
    },
  ];
  const pct = (v: number | null) => (v === null ? "—" : formatRateValue(v));

  const slotColumns: StatTableColumn<NonNullable<typeof slots>[number]>[] = [
    { key: "slot", label: "时间段", render: (r) => <span className="text-ink-50">{r.label}</span> },
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
      <PageHeader
        title="统计"
        action={scopeControl}
      />

      <div className="flex flex-col gap-4">
        <Panel>
          <PanelHeader
            title={`训练概览${scope === "current" ? ` · ${activeSession?.name ?? "日常训练"}` : " · 全部训练"}`}
            subtitle={`${overall.games} 局`}
          />
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 xl:grid-cols-6">
            <StatCard label="场次" value={String(overall.games)} sub={`${overall.reviewedGames} 局已复盘`} />
            <StatCard label="平均名次" value={formatNumber(overall.avgPlacement, 1)} tone="gold" />
            <StatCard
              label="Top4 率"
              value={formatRateValue(overall.top4Rate)}
              tone="good"
              sub={`${overall.top4} / ${overall.games}`}
            />
            <StatCard
              label="吃鸡率"
              value={formatRateValue(overall.winRate)}
              tone="gold"
              sub={`${overall.wins} 次第一`}
            />
            <StatCard
              label="Bottom4 率"
              value={formatRateValue(overall.bottom4Rate)}
              tone="bad"
              sub={`${overall.bottom4} / ${overall.games}`}
            />
            <StatCard
              label="连续训练"
              value={streak !== undefined ? `${streak} 天` : "—"}
              sub="有对局的连续天数"
            />
          </div>
          <p className="border-t border-line px-4 py-2.5 text-xs text-ink-400">
            复盘覆盖率 <span className="num text-ink-400">{pct(reviewCov.rate)}</span>
            （{reviewCov.marked} / {reviewCov.total} 局）· 按四项必填规则判定完整{" "}
            <span className="num text-ink-400">{reviewCov.complete}</span> 局
            {reviewCov.reviewedCompleteGap > 0 &&
              " · 两个数字不一致，说明存在导入或手改过的历史数据"}
          </p>
        </Panel>

        <Panel>
          <PanelHeader
            title="最近趋势"
            subtitle="虚线为近 20 场平均名次"
          />
          <div className="flex flex-col gap-4 p-4">
            {/* Window numbers as one compact strip: they give the chart its
                reading key without repeating the Dashboard's KPI tiles. */}
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-ink-600">
              <span>
                近 10 场平均名次{" "}
                <span className="num text-sm font-semibold text-ink-50">
                  {formatNumber(last10?.avgPlacement ?? null, 1)}
                </span>{" "}
                · {last10?.games ?? 0} 局
              </span>
              <span>
                近 20 场平均名次{" "}
                <span className="num text-sm font-semibold text-ink-50">
                  {formatNumber(last20?.avgPlacement ?? null, 1)}
                </span>{" "}
                · {last20?.games ?? 0} 局
              </span>
              <span>
                近 20 场 Top4{" "}
                <span className="num text-sm font-semibold text-good">
                  {formatRateValue(last20?.top4Rate ?? null)}
                </span>
              </span>
            </div>
            <PlacementTrendChart
              data={trendSeries}
              avg={trendAvg}
              onSelectMatch={(id) => navigate(`/matches/${id}`)}
            />
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="错误统计"
            subtitle="来自每局复盘的主要问题"
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
            </div>
          )}
        </Panel>

        <div className="grid gap-4 xl:grid-cols-2">
          <Panel className="min-w-0 xl:col-span-2">
            <PanelHeader title="阵容统计" subtitle="按你记录的阵容名统计（羁绊单独记录）" />
            <StatTable
              columns={compositionColumns}
              rows={compositions}
              rowHref={(row) => compositionDrillQuery(row.composition)}
              empty="还没有填过阵容"
            />
          </Panel>
          <Panel className="min-w-0">
            <PanelHeader
              title="开局路线"
              subtitle={`已标记 ${openingCoverage.marked} / ${openingCoverage.total} 局 · 覆盖率 ${pct(openingCoverage.rate)} · 少于 3 局的路线不给结论`}
            />
            <StatTable
              columns={openingColumns}
              rows={openings}
              empty="还没有标记过开局路线。复盘时点一下「开局路线」就会出现在这里。"
            />
          </Panel>
          <Panel className="min-w-0">
            <PanelHeader title="时间段统计" subtitle="2 小时一档 · 全天" />
            <StatTable columns={slotColumns} rows={slots} empty="暂无数据" />
          </Panel>
        </div>

        <Panel className="min-w-0">
          <PanelHeader
            title="决策分析"
            subtitle="来自对局详情页的逐回合决策 · 少于 3 局不给结论"
          />
          <div className="grid gap-4 p-4 lg:grid-cols-2">
            <div className="min-w-0">
              <h3 className="text-xs font-semibold text-ink-200">
                决策类型
                <span className="ml-2 font-normal text-ink-600">按局去重 · 一局可属于多类</span>
              </h3>
              <div className="mt-2">
                <GroupStatTable
                  rows={decisionTypes.map((r) => ({ ...r, label: decisionLabel(r.key as DecisionType) }))}
                  labelHeader="决策类型"
                  min={MIN_SAMPLES.decisionRow}
                  empty="还没有记录过决策。对局详情页可以按回合记录当时的决定。"
                />
              </div>
            </div>
            <div className="min-w-0">
              <h3 className="text-xs font-semibold text-ink-200">
                决策后视
                <span className="ml-2 font-normal text-ink-600">「现在回看是否正确」× 该局名次</span>
              </h3>
              <div className="mt-2">
                <GroupStatTable
                  rows={decisionHindsight.map((r) => ({
                    ...r,
                    label: hindsightLabel(r.key as DecisionHindsight),
                  }))}
                  labelHeader="后视判断"
                  min={MIN_SAMPLES.decisionRow}
                  empty="给决策标记「正确 / 错误 / 一般」后，这里会显示对应局的名次。"
                />
              </div>
            </div>
          </div>
        </Panel>

        <Panel className="min-w-0">
          <PanelHeader
            title="强化符文表现"
            subtitle="一局带同一个符文只计一次 · 快照里没有的 id 原样显示 · 少于 3 局不给结论"
          />
          <GroupStatTable
            rows={augments.map((r) => ({ ...r, label: r.name }))}
            labelHeader="强化符文"
            min={MIN_SAMPLES.augmentRow}
            empty="还没有在对局里记录强化符文。新增对局时可以选三个。"
          />
        </Panel>

        <Panel className="min-w-0">
          <PanelHeader
            title="错误结构 · 近 10 场 vs 前 10 场"
            subtitle="只数次数，不下「在改善」的结论"
          />
          {classifiedWindowCount === 0 ? (
            <div className="flex flex-col items-start gap-2 p-4">
              <p className="text-xs leading-relaxed text-ink-400">
                窗口里的 {Math.min(overall.games, 20)} 局都还没有 Primary
                Mistake。先复盘，两期错误结构才有可比的内容。
              </p>
              <LinkButton to="/matches?reviewed=unreviewed" size="sm">
                去复盘 <ArrowRight size={12} />
              </LinkButton>
            </div>
          ) : overall.games < MIN_SAMPLES.mistakeComparison ? (
            <ChartEmpty
              count={overall.games}
              min={MIN_SAMPLES.mistakeComparison}
              what="两期错误结构的对比"
              how="两个窗口都装满才比得出方向。"
            />
          ) : (
            <StatTable
              columns={[
                { key: "label", label: "错误类型", render: (r) => <span className="text-ink-50">{r.label}</span> },
                { key: "recent", label: "近 10 场", align: "right", render: (r) => r.recent },
                { key: "previous", label: "前 10 场", align: "right", render: (r) => r.previous },
                {
                  key: "delta",
                  label: "差值（近 − 前）",
                  align: "right",
                  render: (r) => {
                    const d = r.recent - r.previous;
                    return (
                      <span className={d > 0 ? "text-bad" : d < 0 ? "text-good" : "text-ink-600"}>
                        {d > 0 ? `+${d}` : String(d)}
                      </span>
                    );
                  },
                },
              ]}
              rows={mistakeWindows.map((r) => ({
                ...r,
                label: r.key === UNCLASSIFIED ? "未分类" : mistakeLabel(r.key),
              }))}
              empty="还没有可对比的数据"
            />
          )}
        </Panel>

        <Panel className="min-w-0">
          <PanelHeader
            title="数值与名次"
            subtitle="可选字段的分桶参考 · 标题里是每项的填写量"
          />
          <div className="grid gap-6 p-4 lg:grid-cols-3">
            <NumericBlock title="最终血量" data={numeric.health} min={MIN_SAMPLES.numericRow} />
            <NumericBlock title="对局时长" data={numeric.duration} min={MIN_SAMPLES.numericRow} />
            <NumericBlock title="剩余金币" data={numeric.gold} min={MIN_SAMPLES.numericRow} />
          </div>
        </Panel>
      </div>
    </>
  );
}

function NumericBlock({
  title,
  data,
  min,
}: {
  title: string;
  data: {
    filled: number;
    total: number;
    rows: { key: string; label: string; matches: number; avgPlacement: number | null; top4Rate: number | null }[];
  };
  min: number;
}) {
  const empty = `还没有填过${title}。它是对局表单里的可选字段。`;
  return (
    <div className="min-w-0">
      <h3 className="text-xs font-semibold text-ink-200">
        {title}{" "}
        <span className="num text-ink-600">
          已填 {data.filled} / {data.total} 局
        </span>
      </h3>
      <div className="mt-2">
        {data.filled === 0 ? (
          <p className="px-1 py-6 text-center text-xs text-ink-600">{empty}</p>
        ) : (
          // Zero-count buckets are noise once something is filled: show only
          // the bands the filled games actually land in.
          <GroupStatTable
            rows={data.rows.filter((r) => r.matches > 0)}
            labelHeader="区间"
            min={min}
            empty={empty}
          />
        )}
      </div>
    </div>
  );
}
