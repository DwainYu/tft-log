import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../test/render";
import { ReviewForm } from "./ReviewForm";
import type { Review } from "../../domain/types";

/**
 * A review is written after a game, i.e. tired. These tests pin the things that
 * make that survivable: one click records the structured fact, an old record
 * still opens exactly as it was, and the page always says what is still empty.
 */
const render = (props: Partial<Parameters<typeof ReviewForm>[0]> = {}) => {
  const onSave = vi.fn();
  renderWithProviders(<ReviewForm matchId="m1" onSave={onSave} {...props} />);
  return { onSave };
};

const save = () => fireEvent.click(screen.getByRole("button", { name: "保存复盘" }));

/** Routes carry a one-line hint, so match on the label at the start of the name. */
const route = (label: string) => screen.getByRole("button", { name: new RegExp(`^${label}`) });

/** A record written before `openingPlan` existed. */
const legacyReview: Review = {
  id: "r1",
  matchId: "m1",
  opening: "开局拿了弓",
  midGame: "3-2 上 6",
  lateGame: "决赛圈主 C 被切",
  primaryMistake: "POSITIONING",
  biggestMistake: "主 C 站脸",
  bestDecision: "保住了连胜",
  nextGameFocus: "主 C 放角落",
  createdAt: "2026-02-05T13:20:00.000Z",
  updatedAt: "2026-02-05T13:20:00.000Z",
};

describe("ReviewForm · legacy records", () => {
  it("opens an old free-text record without losing a single line", () => {
    render({ initial: legacyReview });

    expect(screen.getByDisplayValue("开局拿了弓")).toBeInTheDocument();
    expect(screen.getByDisplayValue("决赛圈主 C 被切")).toBeInTheDocument();
    expect(screen.getByDisplayValue("主 C 放角落")).toBeInTheDocument();
    // no structured route was ever recorded, so no chip is pressed
    for (const label of ["连胜", "连败", "正常运营", "走经济", "硬玩"]) {
      expect(route(label)).toHaveAttribute("aria-pressed", "false");
    }
  });

  it("keeps a written process folded open and an empty one folded shut", () => {
    render();
    const summary = screen.getByText("过程补充 · 开局 / 中期 / 后期").closest("details");
    expect(summary).not.toBeNull();
    expect(summary).not.toHaveAttribute("open");
  });
});

describe("ReviewForm · structured opening plan", () => {
  it("records the route with one click and sends it on save", () => {
    const { onSave } = render();

    fireEvent.click(route("走经济"));
    expect(route("走经济")).toHaveAttribute("aria-pressed", "true");

    save();
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({}), "ECONOMY");
  });

  it("is reachable and operable from the keyboard", () => {
    render();
    const target = route("正常运营");

    // a real <button>: Tab lands on it and Space / Enter activate it
    expect(target.tagName).toBe("BUTTON");
    target.focus();
    expect(document.activeElement).toBe(target);
    fireEvent.click(target);
    expect(target).toHaveAttribute("aria-pressed", "true");
  });

  it("sends null when the player deselects it again", () => {
    const { onSave } = render({ initialOpeningPlan: "FORCE" });
    expect(route("硬玩")).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(route("硬玩"));
    save();
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({}), null);
  });

  it("pre-fills from the match so saving twice cannot lose it", () => {
    const { onSave } = render({ initialOpeningPlan: "WIN_STREAK" });
    save();
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({}), "WIN_STREAK");
  });

  it("offers exactly the five routes a statistic can group by", () => {
    render();
    const group = screen.getByRole("group", { name: "开局路线" });
    expect(within(group).getAllByRole("button")).toHaveLength(5);
  });
});

describe("ReviewForm · completeness", () => {
  it("starts at 0%", () => {
    render();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
    expect(screen.getByText("已填 0/6 项 · 0%")).toBeInTheDocument();
  });

  it("never calls one filled field complete", () => {
    render();
    fireEvent.click(route("连败"));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "20");
    expect(screen.getByText("未填 · 主要问题")).toBeInTheDocument();
  });

  it("reaches 60% on the conclusion alone — the reviewed gate stays readable", () => {
    render({ initial: legacyReview });
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "60");
    expect(screen.getByText("已满足必填")).toBeInTheDocument();
  });

  it("reads the progress out as filled items, not as a bare percentage", () => {
    render();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuetext",
      "已填 0/6 项 · 0%",
    );
  });

  it("tells an untouched review where to start", () => {
    render();
    expect(screen.getByText(/还没有记录复盘内容/)).toBeInTheDocument();

    fireEvent.click(route("硬玩"));
    expect(screen.queryByText(/还没有记录复盘内容/)).not.toBeInTheDocument();
  });
});

describe("ReviewForm · section status", () => {
  it("marks a section filled only when its whole answer is there", () => {
    render();
    const section = screen.getByRole("heading", { name: "主要问题" }).closest("section");
    expect(within(section!).getByText("未填写")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "站位" }));
    // the classification alone is not the answer — the write-up is missing
    expect(within(section!).getByText("未填写")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/这局最大的问题是什么/), {
      target: { value: "主 C 站脸" },
    });
    expect(within(section!).getByText("已填写")).toBeInTheDocument();
  });

  it("points a rejected field at the message that is about it", () => {
    render({ errors: ["请填写本局最大的问题", "请填写下一局要刻意练习什么"] });

    const biggest = screen.getByLabelText(/这局最大的问题是什么/);
    expect(biggest).toHaveAttribute("aria-invalid", "true");
    expect(biggest).toHaveAttribute("aria-describedby", "rv-biggest-error");
    expect(document.getElementById("rv-biggest-error")).toHaveTextContent("请填写本局最大的问题");

    const focus = screen.getByLabelText(/下一局要刻意练习什么/);
    expect(focus).toHaveAttribute("aria-invalid", "true");
    expect(focus).toHaveAttribute("aria-describedby", "rv-focus-error");
  });

  it("keeps pointing at the field when the same rejection repeats", () => {
    const { onSave } = render({ errors: ["请填写本局最大的问题"] });

    // A long form: a second failed save has to move focus back, otherwise the
    // button looks dead even though nothing about the message changed.
    fireEvent.click(screen.getByRole("button", { name: "保存复盘" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "保存复盘" }));
    expect(document.activeElement).toBe(screen.getByLabelText(/这局最大的问题是什么/));
  });
});
