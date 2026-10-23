import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../App";

describe("App shell", () => {
  it("renders the brand and every primary navigation entry", () => {
    render(<App />);
    // brand appears in both the desktop sidebar and the mobile top bar
    expect(screen.getAllByText("TFT 日志").length).toBeGreaterThanOrEqual(2);
    // the English name rides along in the document title; the tagline carries the new subtitle
    expect(screen.getAllByText("对局记录与训练分析").length).toBeGreaterThanOrEqual(2);
    for (const label of ["Dashboard", "对局", "统计", "训练目标", "周复盘", "草稿箱", "数据"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it("offers exactly one place to record a match", () => {
    render(<App />);
    // The sidebar owns every 记录对局 entry (快速记录一局 + 完整对局记录);
    // a second copy used to sit in the Dashboard header. The Icon-only compact
    // button (mobile) and the full one (desktop) both live in the shell.
    expect(screen.getAllByLabelText("快速记录一局").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("快速记录一局").length).toBeGreaterThanOrEqual(1);
  });

  it("no longer advertises a fixed training window in the sidebar", () => {
    render(<App />);
    // the product is a general TFT training log: no 12:00–22:00 window anywhere
    expect(screen.queryByText(/训练时间段/)).not.toBeInTheDocument();
    expect(screen.queryByText(/训练时段/)).not.toBeInTheDocument();
    expect(screen.queryByText(/12:00/)).not.toBeInTheDocument();
    expect(screen.queryByText(/22:00/)).not.toBeInTheDocument();
    // the footer note that stays is about local storage, not hours
    expect(screen.getAllByText(/数据全部保存在本机浏览器/).length).toBeGreaterThan(0);
  });
});
