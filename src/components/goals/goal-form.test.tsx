import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GoalForm } from "./GoalComponents";
import { dateKey, wallClockNow } from "../../lib/wallclock";

describe("GoalForm", () => {
  it("defaults the start date to today in local time, not UTC", () => {
    // 23:30 local — a UTC-based default would land on the wrong day whenever
    // the machine runs ahead of UTC.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-05T23:30:00"));
    render(<GoalForm onCancel={vi.fn()} onSave={vi.fn()} />);
    const input = screen.getByLabelText(/开始日期/) as HTMLInputElement;
    expect(input.value).toBe(dateKey(wallClockNow()));
    expect(input.value).toBe("2026-02-05");
    vi.useRealTimers();
  });

  it("keeps the initial goal's start date when editing", () => {
    render(
      <GoalForm
        initial={{
          id: "g1",
          title: "吃满利息",
          startDate: "2026-01-01",
          status: "active",
          createdAt: "2026-01-01T10:00:00.000Z",
          updatedAt: "2026-01-01T10:00:00.000Z",
        }}
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    expect((screen.getByLabelText(/开始日期/) as HTMLInputElement).value).toBe("2026-01-01");
  });
});
