import { useMemo, type ReactElement } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type CartesianGridProps,
  type TooltipContentProps,
} from "recharts";
import { chartTheme, MIN_SAMPLES } from "./chart-theme";
import { ChartEmpty } from "./ChartEmpty";
import { useTheme } from "../../lib/theme";

export interface TrendPoint {
  index: number;
  /** `MM-DD` — the axis label. */
  label: string;
  /** Full wall-clock stamp, so the tooltip can name one exact game. */
  playedAt: string;
  /** 可选：没有名次的记录不画点（见 `placementTrendSeries`）。 */
  placement?: number;
  top4: 0 | 1;
  /** The player's own composition label for this game, when logged. */
  composition?: string;
  /** Drill-down target: a point always belongs to exactly one match. */
  id: string;
}

type GridLineProps = Parameters<
  Extract<NonNullable<CartesianGridProps["horizontal"]>, (props: never) => ReactElement>
>[0];

// The rank-1 gridline lands exactly on the plot area's top edge, where it
// reads as a stray border above the axis rather than a ranking reference.
// Draw every other tick line as Recharts would, and skip only that one.
const horizontalGridLine = (props: GridLineProps) => {
  const { x1, y1, x2, y2, offset, stroke, strokeWidth, strokeOpacity, strokeDasharray } = props;
  if (Math.abs(y1 - offset.top) < 0.5) return <g />;
  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeOpacity={strokeOpacity}
      // Recharts allows readonly arrays; the DOM attribute wants a joined string.
      strokeDasharray={
        typeof strokeDasharray === "string" || strokeDasharray == null
          ? strokeDasharray
          : String(strokeDasharray)
      }
    />
  );
};

/**
 * Rank trend, 1st place on top; the dashed reference line is the window average.
 *
 * Answers: "am I playing better lately?" — a direction, which no single KPI
 * tile can express. Every dot is one game and opens that game. Dates on the
 * x axis are labelled once per day, on that day's first game.
 */
export function PlacementTrendChart({
  data,
  avg,
  onSelectMatch,
  loading = false,
}: {
  data: TrendPoint[];
  /** Average placement of the shown window — drawn as a reference line. */
  avg: number | null;
  /** Drill-down: called with `TrendPoint.id`. */
  onSelectMatch?: (matchId: string) => void;
  loading?: boolean;
}) {
  // Literal SVG colours for the active theme; the useTheme() dependency makes
  // a toggle re-render the chart. Hooks stay above the early return.
  const { dark } = useTheme();
  const t = useMemo(() => chartTheme(dark), [dark]);

  if (loading || data.length < MIN_SAMPLES.trend) {
    return (
      <ChartEmpty
        loading={loading}
        count={data.length}
        min={MIN_SAMPLES.trend}
        what="最近的名次走势"
        how="右下角「快速记录」记一局，或到「新增对局」补一局。"
      />
    );
  }

  // Three rows, one game: which game it was, where it finished, what line it
  // played. A blank composition reads the same as everywhere else in the app.
  const renderTooltip = ({ active, payload }: TooltipContentProps) => {
    if (!active) return null;
    const point = payload?.[0]?.payload as TrendPoint | undefined;
    if (!point) return null;
    const time = point.playedAt.slice(11, 16);
    return (
      <div style={{ ...t.TOOLTIP_STYLE, padding: "6px 10px", lineHeight: 1.7 }}>
        <div>
          第 {point.index} 局 · {point.label}
          {time ? ` ${time}` : ""}
        </div>
        <div>名次：{point.placement === undefined ? "未记录" : `第 ${point.placement} 名`}</div>
        <div className="max-w-[11rem] break-words">阵容：{point.composition || "未填阵容"}</div>
      </div>
    );
  };

  // A negative left margin pushed the Y-axis tick labels outside the SVG's
  // viewBox, clipping the rank digits at the left edge.
  return (
    <div className="h-48 w-full sm:h-56 lg:h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid stroke={t.CHART.grid} vertical={false} horizontal={horizontalGridLine} />
          <XAxis
            dataKey="index"
            // Several games land on the same day. A date is only labelled on
            // its first game, so the axis reads "10-04 10-05 10-06" instead of
            // repeating "10-05" for every point on that day.
            tickFormatter={(v: number) => {
              const point = data[v - 1];
              if (!point) return "";
              const prev = data[v - 2];
              return prev && prev.label === point.label ? "" : point.label;
            }}
            tick={t.AXIS_TICK}
            axisLine={t.AXIS_LINE}
            tickLine={false}
            // Keep the window's first and last tick visible even when the
            // dedupe above blanks a middle label.
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis
            domain={[1, 8]}
            ticks={[1, 2, 3, 4, 5, 6, 7, 8]}
            // Without this recharts drops the `1` tick at this height, and the
            // best rank on the scale ends up unlabelled.
            interval={0}
            reversed
            tick={t.AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={24}
          />
          <Tooltip content={renderTooltip} />
          {avg !== null && (
            <ReferenceLine
              y={avg}
              stroke={t.CHART_SEMANTIC.reference}
              strokeDasharray="4 4"
              strokeOpacity={0.6}
              label={{
                value: `平均 ${avg}`,
                fill: t.CHART_SEMANTIC.reference,
                fontSize: 11,
                position: "insideTopLeft",
              }}
            />
          )}
          <Line
            type="monotone"
            dataKey="placement"
            name="rank"
            stroke={t.CHART_SEMANTIC.series}
            strokeWidth={2}
            dot={(props: { cx?: number; cy?: number; payload?: TrendPoint }) => {
              const { cx, cy, payload } = props;
              // 没有名次的记录不是赛果，画上去也是个落在轴外的点：不画，
              // 也就不会出现「点它跳到哪一局」这种二义。
              if (cx == null || cy == null || !payload || payload.placement === undefined) {
                return null;
              }
              const top4 = payload.top4 === 1;
              const title = `${payload.label} ${payload.playedAt.slice(11, 16)} · 第 ${payload.placement} 名 · 阵容：${payload.composition || "未填阵容"}${top4 ? " · Top4" : ""}`;
              const shared = {
                cx,
                cy,
                r: onSelectMatch ? 4 : 3,
                fill: top4 ? t.CHART_SEMANTIC.highlight : t.CHART_SEMANTIC.series,
                strokeWidth: 0,
              };
              if (!onSelectMatch) return <circle {...shared} />;
              return (
                <circle
                  {...shared}
                  role="button"
                  tabIndex={0}
                  aria-label={`${title}（查看该局）`}
                  style={{ cursor: "pointer" }}
                  onClick={() => onSelectMatch(payload.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectMatch(payload.id);
                    }
                  }}
                >
                  <title>{title}</title>
                </circle>
              );
            }}
            // 悬停高亮点（r=5）和可点击圆点（r=4）是同心的，而 recharts 把
            // activeDot 画在更高一层：它默认吃指针事件，于是鼠标永远点不到
            // 下面的圆点 —— 跳转看着像坏了，其实是这一层挡住了。关掉它自己的
            // 指针事件，高亮照旧显示，命中测试落到真正带 onClick 的圆点上。
            activeDot={{
              r: 5,
              fill: t.CHART_SEMANTIC.highlight,
              stroke: t.CHART.surface,
              strokeWidth: 2,
              pointerEvents: "none",
            }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
