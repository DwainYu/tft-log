import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronLeft, ChevronRight, Target, TrendingUp } from "lucide-react";
import { weeklyReport } from "../services/weekly-service";
import { activeSummaryProvider } from "../services/review-summary";
import { formatRateValue, StatCard } from "../components/stats/StatCard";
import { Badge } from "../components/ui/Badge";
import { Button, LinkButton } from "../components/ui/Button";
import { EmptyState } from "../components/ui/Badge";
import { PageHeader, Panel, PanelHeader } from "../components/ui/Panel";
import { Spinner } from "../components/ui/Spinner";
import { formatNumber } from "../lib/utils";
import { weekRangeLabel } from "../services/weekly-service";

export function WeeklyReviewPage() {
  const [offset, setOffset] = useState(0);
  const report = useLiveQuery(() => weeklyReport(offset), [offset]);

  if (report === undefined) return <Spinner label="汇总本周数据" />;

  const s = report.summary;

  return (
    <>
      <PageHeader
        title="周复盘"
        action={
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => setOffset((o) => o - 1)} title="上一周">
              <ChevronLeft size={14} />
            </Button>
            <span className="num min-w-40 text-center text-sm text-ink-200">
              {weekRangeLabel(report, offset)}
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setOffset((o) => o + 1)}
              disabled={offset >= 0}
              title="下一周"
            >
              <ChevronRight size={14} />
            </Button>
          </div>
        }
      />

      {report.games === 0 ? (
        <Panel>
          <EmptyState
            title={`${weekRangeLabel(report, offset)} 没有记录对局`}
            description="打完一局用「快速记录」记一下，这里就会自动汇总。"
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <LinkButton to="/matches/new" variant="primary">
                  记录一局
                </LinkButton>
                <Button size="sm" onClick={() => setOffset(-1)}>
                  看上一周
                </Button>
              </div>
            }
          />
        </Panel>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            <StatCard label="场次" value={String(report.games)} />
            <StatCard label="平均名次" value={formatNumber(report.avgPlacement, 1)} tone="gold" />
            <StatCard label="Top4 率" value={formatRateValue(report.top4Rate)} tone="good" />
            <StatCard label="吃鸡" value={String(report.wins)} tone={report.wins > 0 ? "gold" : "neutral"} />
            <StatCard
              label="Bottom4"
              value={String(report.bottom4)}
              tone={report.bottom4 > 0 ? "bad" : "neutral"}
            />
          </div>

          <Panel>
            <PanelHeader
              title="本周小结"
              subtitle={`由 ${activeSummaryProvider.label}（规则引擎）生成；后续阶段可换成 LLM / Agent`}
              action={<Badge tone="muted">{s.provider}</Badge>}
            />
            <div className="flex flex-col gap-3 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-gold-300">
                <TrendingUp size={15} />
                {s.headline}
              </div>
              <ul className="flex flex-col gap-1.5">
                {s.points.map((p) => (
                  <li key={p} className="flex gap-2 text-sm text-ink-200">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-gold-400" />
                    {p}
                  </li>
                ))}
              </ul>
              {s.nextStep && (
                <p className="mt-1 rounded-lg border border-gold-500/25 bg-gold-500/8 px-3 py-2 text-sm text-gold-300">
                  下一步 · {s.nextStep}
                </p>
              )}
            </div>
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel>
              <PanelHeader title="最常见错误" />
              {report.mostCommonMistakes.length === 0 ? (
                <p className="px-4 py-6 text-xs text-ink-600">本周没有标记过错误。</p>
              ) : (
                <div className="flex flex-wrap gap-2 p-4">
                  {report.mostCommonMistakes.slice(0, 5).map((m) => (
                    <Badge key={m.type} tone={m.type === "UNCLASSIFIED" ? "muted" : "bad"}>
                      {m.label} × {m.count}
                    </Badge>
                  ))}
                </div>
              )}
            </Panel>

            <Panel>
              <PanelHeader title="最常玩的阵容" />
              {report.topComposition ? (
                <div className="flex items-center gap-3 p-4">
                  <span className="text-lg font-semibold text-ink-50">
                    {report.topComposition.composition}
                  </span>
                  <span className="num text-xs text-ink-400">
                    {report.topComposition.games} 局 · 平均第{" "}
                    {formatNumber(report.topComposition.avgPlacement, 1)} 名
                  </span>
                </div>
              ) : (
                <p className="px-4 py-6 text-xs text-ink-600">本周没有填阵容。</p>
              )}
            </Panel>
          </div>

          <Panel>
            <PanelHeader title="当前训练目标" />
            {report.currentGoal ? (
              <div className="flex flex-wrap items-center gap-3 p-4">
                <Target size={18} className="text-gold-300" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-ink-50">{report.currentGoal.title}</div>
                  {report.currentGoal.description && (
                    <p className="mt-0.5 text-xs text-ink-400">{report.currentGoal.description}</p>
                  )}
                </div>
                <LinkButton to="/goals" size="sm">
                  管理目标
                </LinkButton>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3 p-4 text-sm text-ink-400">
                当前没有进行中的训练目标。
                <LinkButton to="/goals" size="sm">
                  去创建一个
                </LinkButton>
              </div>
            )}
          </Panel>
        </div>
      )}
    </>
  );
}
