import { cloneElement, type ReactElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * `ResponsiveContainer` measures the DOM; jsdom has no layout, so it would
 * render 0 × 0 and the chart would never draw a single dot or bar. Swapping it
 * for a fixed-size container makes the real chart interactive and testable.
 */
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement }) =>
      cloneElement(children as ReactElement<{ width?: number; height?: number }>, {
        width: 600,
        height: 300,
      }),
  };
});

import { MistakeBarChart } from "./MistakeBarChart";
import { PlacementTrendChart, type TrendPoint } from "./PlacementTrendChart";

const point = (over: Partial<TrendPoint> & { id: string }): TrendPoint => ({
  index: 1,
  label: "02-01",
  playedAt: "2026-02-01T13:00",
  placement: 4,
  top4: 1,
  ...over,
});

const trend = (n: number): TrendPoint[] =>
  Array.from({ length: n }, (_, i) =>
    point({
      id: `m${i + 1}`,
      index: i + 1,
      playedAt: `2026-02-0${i + 1}T13:00`,
      label: `02-0${i + 1}`,
      placement: (i % 8) + 1,
      top4: i % 8 < 4 ? 1 : 0,
    }),
  );

/** Five games (the chart's floor), each its own line — the tooltip must not mix them up. */
const composedTrend = (): TrendPoint[] => [
  point({
    id: "m1",
    index: 1,
    playedAt: "2026-02-01T13:00",
    label: "02-01",
    placement: 1,
    top4: 1,
    composition: "森林95",
  }),
  point({
    id: "m2",
    index: 2,
    playedAt: "2026-02-02T20:30",
    label: "02-02",
    placement: 7,
    top4: 0,
    composition: "决斗永恩",
  }),
  point({
    id: "m3",
    index: 3,
    playedAt: "2026-02-03T13:00",
    label: "02-03",
    placement: 3,
    top4: 1,
  }),
  point({
    id: "m4",
    index: 4,
    playedAt: "2026-02-04T13:00",
    label: "02-04",
    placement: 5,
    top4: 0,
    composition: "福牛战神",
  }),
  point({
    id: "m5",
    index: 5,
    playedAt: "2026-02-05T13:00",
    label: "02-05",
    placement: 8,
    top4: 0,
    composition: "一个特别特别长的阵容名字用来验证换行",
  }),
];

/**
 * jsdom has no layout, so pointer coordinates cannot select a point. Recharts'
 * accessibility layer drives the very same tooltip from the keyboard, which is
 * how these tests reach one exact game.
 */
const reachPoint = (container: HTMLElement, step: number) => {
  const surface = container.querySelector(".recharts-surface") as HTMLElement;
  fireEvent.focus(surface);
  for (let i = 0; i < step; i++) fireEvent.keyDown(surface, { key: "ArrowRight" });
};

const tooltipText = (container: HTMLElement) =>
  container.querySelector(".recharts-tooltip-wrapper")?.textContent ?? "";

describe("PlacementTrendChart", () => {
  it("draws one drill-down target per game", () => {
    const onSelectMatch = vi.fn();
    const { container } = render(
      <PlacementTrendChart data={trend(6)} avg={4.2} onSelectMatch={onSelectMatch} />,
    );

    const dots = screen.getAllByRole("button");
    expect(dots).toHaveLength(6);

    fireEvent.click(dots[2]);
    expect(onSelectMatch).toHaveBeenCalledWith("m3");

    // keyboard gets the same drill-down
    fireEvent.keyDown(dots[0], { key: "Enter" });
    expect(onSelectMatch).toHaveBeenCalledWith("m1");

    // every point names the game it belongs to
    expect(container.querySelectorAll("title").length).toBeGreaterThan(0);
  });

  it("keeps the hover highlight from eating the mouse click", () => {
    const { container } = render(
      <PlacementTrendChart data={composedTrend()} avg={4} onSelectMatch={() => {}} />,
    );
    // Activate the hover highlight the same way the keyboard does, then make
    // sure the activeDot it renders cannot take pointer events: it sits on a
    // higher recharts layer than the clickable dot, concentric with it, so a
    // real browser's hit test would land here first and the click would never
    // reach `onClick`. (jsdom cannot hit-test — that exact gap is how this bug
    // shipped — so this asserts the guard itself.)
    reachPoint(container, 2);
    const activeDot = container.querySelector(
      ".recharts-active-dot circle",
    ) as SVGElement | null;
    expect(activeDot).toBeTruthy();
    const transparent =
      activeDot!.getAttribute("pointer-events") === "none" ||
      activeDot!.style.pointerEvents === "none";
    expect(transparent).toBe(true);
  });

  it("shows each game's own composition in the tooltip", () => {
    const { container } = render(<PlacementTrendChart data={composedTrend()} avg={4} />);

    reachPoint(container, 0);
    expect(tooltipText(container)).toContain("第 1 局 · 02-01 13:00");
    expect(tooltipText(container)).toContain("名次：第 1 名");
    expect(tooltipText(container)).toContain("阵容：森林95");

    // one step right is a different game — and must show that game's line
    reachPoint(container, 1);
    expect(tooltipText(container)).toContain("第 2 局 · 02-02 20:30");
    expect(tooltipText(container)).toContain("名次：第 7 名");
    expect(tooltipText(container)).toContain("阵容：决斗永恩");
    expect(tooltipText(container)).not.toContain("森林95");
  });

  it("falls back to 未填阵容 when the game logged no composition", () => {
    const { container } = render(<PlacementTrendChart data={composedTrend()} avg={4} />);
    reachPoint(container, 2);
    expect(tooltipText(container)).toContain("第 3 局 · 02-03 13:00");
    expect(tooltipText(container)).toContain("名次：第 3 名");
    expect(tooltipText(container)).toContain("阵容：未填阵容");

    // a long name reaches the tooltip intact — wrapping is the browser's job
    reachPoint(container, 4);
    expect(tooltipText(container)).toContain("阵容：一个特别特别长的阵容名字用来验证换行");
  });

  it("names the composition on the keyboard-reachable dot title", () => {
    const { container } = render(
      <PlacementTrendChart data={composedTrend()} avg={4} onSelectMatch={() => {}} />,
    );
    const titles = [...container.querySelectorAll("circle title")].map((n) => n.textContent);
    expect(titles[0]).toContain("第 1 名");
    expect(titles[0]).toContain("阵容：森林95");
    expect(titles[1]).toContain("阵容：决斗永恩");
  });

  it("labels every rank from 1 to 8 on the axis", () => {
    const { container } = render(<PlacementTrendChart data={trend(8)} avg={4.2} />);
    expect(container.querySelectorAll(".recharts-yAxis .recharts-cartesian-axis-tick")).toHaveLength(8);
  });

  it("draws no gridline at the plot top — only ranks 2 to 8 get one", () => {
    const { container } = render(<PlacementTrendChart data={trend(8)} avg={4.2} />);
    const tickY = (rank: string) =>
      Number(
        [...container.querySelectorAll(".recharts-yAxis-tick-labels text")].find(
          (t) => t.textContent === rank,
        )?.getAttribute("y"),
      );
    const gridYs = [
      ...container.querySelectorAll(".recharts-cartesian-grid-horizontal line"),
    ].map((l) => Number(l.getAttribute("y1")));

    // the rank-1 line sits on the plot's top edge and reads as a stray border
    expect(gridYs).toHaveLength(7);
    expect(gridYs).not.toContain(tickY("1"));
    // every remaining rank line is still drawn at its own tick
    for (const rank of ["2", "3", "4", "5", "6", "7", "8"]) {
      expect(gridYs).toContain(tickY(rank));
    }
  });

  it("is not clickable without a drill-down target", () => {
    render(<PlacementTrendChart data={trend(6)} avg={4.2} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("says how many more games it needs instead of drawing noise", () => {
    render(<PlacementTrendChart data={trend(2)} avg={4.2} />);
    expect(screen.getByText(/已记录 2 局，记到 5 局后/)).toBeInTheDocument();
  });

  it("never claims 'no data' while it is still loading", () => {
    render(<PlacementTrendChart data={[]} avg={null} loading />);
    expect(screen.getByText("计算中…")).toBeInTheDocument();
    expect(screen.queryByText(/暂无数据/)).not.toBeInTheDocument();
  });

  it("explains what will appear once a game is logged", () => {
    render(<PlacementTrendChart data={[]} avg={null} />);
    expect(screen.getByText(/记录第一局后/)).toBeInTheDocument();
  });
});

describe("MistakeBarChart", () => {
  const data = (counts: [string, number][]) =>
    counts.map(([key, count]) => ({ key, label: key, count }));

  it("opens the matches behind a bar", () => {
    const onSelect = vi.fn();
    const { container } = render(<MistakeBarChart data={data([["ECONOMY", 3], ["ROLLING", 2]])} onSelect={onSelect} />);

    const bars = container.querySelectorAll(".recharts-bar-rectangle path");
    expect(bars.length).toBe(2);
    fireEvent.click(bars[0]);
    expect(onSelect).toHaveBeenCalledWith("ECONOMY");
  });

  it("waits for five marked games before drawing a distribution", () => {
    render(<MistakeBarChart data={data([["ECONOMY", 2], ["ROLLING", 2]])} />);
    expect(screen.getByText(/已记录 4 局，记到 5 局后/)).toBeInTheDocument();
  });

  it("says what produces the data when there is none", () => {
    render(<MistakeBarChart data={[]} />);
    expect(screen.getByText(/记录第一局后/)).toBeInTheDocument();
    expect(screen.getByText(/Primary Mistake/)).toBeInTheDocument();
  });
});
