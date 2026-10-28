import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Route, Routes } from "react-router-dom";
import { GuidePage } from "./GuidePage";
import { renderWithProviders } from "../test/render";
import { resetDatabase } from "../test/db-helper";

function renderGuide() {
  return renderWithProviders(
    <Routes>
      <Route path="/guide" element={<GuidePage />} />
      <Route path="*" element={<div data-testid="other-page" />} />
    </Routes>,
    "/guide",
  );
}

beforeEach(() => {
  resetDatabase();
  // jsdom has no layout engine; the guide's in-page nav calls scrollIntoView.
  Element.prototype.scrollIntoView = () => undefined;
});

describe("GuidePage", () => {
  it("renders every promised guide section", () => {
    renderGuide();
    for (const title of [
      "快速上手",
      "页面导览",
      "记录与复盘",
      "数据与备份",
      "常见问题",
      "设计理念",
      "边界与计划",
    ]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
  });

  it("covers every primary navigation page in the tour", () => {
    renderGuide();
    const tour = screen.getByRole("heading", { name: "页面导览" }).closest("section")!;
    for (const page of ["对局", "统计", "资料中心", "训练目标", "周复盘", "数据"]) {
      // as a sub-heading inside the tour, not just a stray word
      expect(
        within(tour).getAllByRole("heading", { name: new RegExp(page) }).length,
      ).toBeGreaterThan(0);
    }
  });

  it("in-page nav scrolls instead of navigating away", () => {
    renderGuide();
    fireEvent.click(screen.getByRole("button", { name: "常见问题" }));
    expect(screen.queryByTestId("other-page")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "快速上手" })).toBeInTheDocument();
  });

  it("the call-to-action opens the quick-add drawer", () => {
    renderGuide();
    fireEvent.click(screen.getByRole("button", { name: "去记一局" }));
    expect(screen.getByRole("dialog", { name: /记录一局/ })).toBeInTheDocument();
  });

  it("does not promise features that are not shipped", () => {
    renderGuide();
    const body = document.body.textContent ?? "";
    expect(body).not.toMatch(/自动同步|云同步已|跨设备同步支持/);
    // cloud sync must be framed as 不做, not available
    expect(screen.getByText(/计划中 · 对局自动录入/)).toBeInTheDocument();
  });
});
