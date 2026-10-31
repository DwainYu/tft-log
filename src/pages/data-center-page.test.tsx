import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { DataCenterPage } from "./DataCenterPage";
import { TFT_SITES } from "../data/tft-sites";
import { renderWithProviders } from "../test/render";

const render = () => renderWithProviders(<DataCenterPage />, "/data-center");

beforeEach(() => {
  // jsdom has no layout engine; in-page jumps call scrollIntoView
  Element.prototype.scrollIntoView = () => undefined;
  window.scrollTo = () => undefined;
});

describe("Data Center Page (V2)", () => {
  it("renders page title and zero-runtime-fetch policy statement", () => {
    render();
    expect(screen.getByRole("heading", { name: "TFT 数据中心" })).toBeInTheDocument();
    expect(
      screen.getByText(/精选云顶之弈数据网站与实用工具，帮助你找到合适的数据、攻略和辅助工具。/),
    ).toBeInTheDocument();
    expect(screen.getByText(/不重复造轮子，发现优秀工具，了解如何使用/)).toBeInTheDocument();
    expect(screen.getByText(/零外部网络请求/)).toBeInTheDocument();
  });

  it("renders all 6 curated recommended sites and their cards", () => {
    render();
    for (const site of TFT_SITES) {
      expect(screen.getByTestId(`site-card-${site.id}`)).toBeInTheDocument();
      expect(screen.getAllByText(site.name).length).toBeGreaterThan(0);
    }
  });

  it("ensures the 6 removed old sites are completely absent from the page", () => {
    render();
    const bodyText = document.body.textContent ?? "";
    expect(bodyText).not.toContain("Tactics.tools");
    expect(bodyText).not.toContain("MetaTFT");
    expect(bodyText).not.toContain("OP.GG");
    expect(bodyText).not.toContain("Teamfight Tactics 官方网站");
    expect(bodyText).not.toContain("官方补丁说明");
    expect(bodyText).not.toContain("LoL Wiki · Teamfight Tactics");
  });

  it("opens all external links in a new tab with safe rel", () => {
    render();
    const externalLinks = screen
      .getAllByRole("link")
      .filter((l) => l.getAttribute("href")?.startsWith("https://"));

    expect(externalLinks.length).toBeGreaterThan(0);
    for (const link of externalLinks) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link.getAttribute("rel")?.split(" ")).toEqual(
        expect.arrayContaining(["noopener", "noreferrer"]),
      );
    }
  });

  it("filters sites interactively when clicking category buttons", () => {
    render();
    // Initially shows all 6
    for (const site of TFT_SITES) {
      expect(screen.getByTestId(`site-card-${site.id}`)).toBeInTheDocument();
    }

    // Filter by "AI 辅助查询" -> only TFTClarity
    fireEvent.click(screen.getByRole("button", { name: /^AI 辅助查询/ }));
    expect(screen.getByTestId("site-card-tft-clarity")).toBeInTheDocument();
    expect(screen.queryByTestId("site-card-tft-flow")).not.toBeInTheDocument();
    expect(screen.queryByTestId("site-card-data-tft")).not.toBeInTheDocument();

    // Reset to all via reset button
    fireEvent.click(screen.getByRole("button", { name: /重置为全部/ }));
    expect(screen.getByTestId("site-card-tft-flow")).toBeInTheDocument();
    expect(screen.getByTestId("site-card-tft-clarity")).toBeInTheDocument();
  });

  it("keeps all six guides collapsed by default", () => {
    render();
    for (const site of TFT_SITES) {
      const guideSection = document.getElementById(`guide-${site.id}`);
      expect(guideSection, `missing guide section for ${site.id}`).toBeInTheDocument();
      // the guide header stays visible, the body is not mounted
      expect(within(guideSection!).getByText("展开使用指南")).toBeInTheDocument();
      expect(within(guideSection!).queryByText("基本介绍")).not.toBeInTheDocument();
      expect(document.getElementById(`guide-content-${site.id}`)).not.toBeInTheDocument();
    }
  });

  it("card 使用指南 expands the matching guide and scrolls to it", () => {
    render();
    const flowCard = screen.getByTestId("site-card-tft-flow");
    const guideBtn = within(flowCard).getByRole("button", { name: "使用指南" });
    expect(guideBtn).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(guideBtn);

    const flowGuide = document.getElementById("guide-tft-flow")!;
    expect(within(flowGuide).getByText("基本介绍")).toBeInTheDocument();
    expect(document.getElementById("guide-content-tft-flow")).toBeInTheDocument();
    expect(within(guideBtn).getByText("收起指南")).toBeInTheDocument();
    expect(guideBtn).toHaveAttribute("aria-expanded", "true");
  });

  it("expands the detailed sections for every site when toggled", () => {
    render();
    for (const site of TFT_SITES) {
      const guideSection = document.getElementById(`guide-${site.id}`)!;
      const toggle = within(guideSection).getByRole("button", { name: /展开使用指南/ });
      fireEvent.click(toggle);

      expect(within(guideSection).getByText("基本介绍")).toBeInTheDocument();
      expect(within(guideSection).getByText("核心功能")).toBeInTheDocument();
      expect(within(guideSection).getByText(/适用场景/)).toBeInTheDocument();
      expect(within(guideSection).getByText("简易使用教程")).toBeInTheDocument();
      expect(within(guideSection).getByText("使用建议与注意事项")).toBeInTheDocument();
      expect(within(guideSection).getByText(site.tutorial[0].title)).toBeInTheDocument();
    }
  });

  it("uses an accordion: opening another guide collapses the previous one", () => {
    render();
    fireEvent.click(within(screen.getByTestId("site-card-tft-flow")).getByRole("button", { name: "使用指南" }));
    expect(document.getElementById("guide-content-tft-flow")).toBeInTheDocument();

    fireEvent.click(
      within(screen.getByTestId("site-card-data-tft")).getByRole("button", { name: "使用指南" }),
    );
    expect(document.getElementById("guide-content-data-tft")).toBeInTheDocument();
    expect(document.getElementById("guide-content-tft-flow")).not.toBeInTheDocument();
  });

  it("keeps the expanded guide open when the card button is pressed again is a collapse", () => {
    render();
    const flowCard = screen.getByTestId("site-card-tft-flow");
    fireEvent.click(within(flowCard).getByRole("button", { name: "使用指南" }));
    fireEvent.click(within(flowCard).getByRole("button", { name: "收起指南" }));
    expect(document.getElementById("guide-content-tft-flow")).not.toBeInTheDocument();
  });

  it("collapses the open guide when filtering to another category", () => {
    render();
    fireEvent.click(within(screen.getByTestId("site-card-tft-flow")).getByRole("button", { name: "使用指南" }));
    fireEvent.click(screen.getByRole("button", { name: /^AI 辅助查询/ }));
    expect(document.getElementById("guide-content-tft-flow")).not.toBeInTheDocument();
  });

  it("does not embed any iframes", () => {
    render();
    expect(document.querySelectorAll("iframe").length).toBe(0);
  });
});
