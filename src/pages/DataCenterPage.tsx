import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Compass,
  ExternalLink,
  Filter,
  Info,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { PageHeader, Panel } from "../components/ui/Panel";
import {
  SITE_CATEGORIES,
  TFT_SITES,
  getFilteredSites,
  type SiteCategory,
} from "../data/tft-sites";
import { SiteCard } from "../components/sites/SiteCard";
import { SiteDetailSection } from "../components/sites/SiteDetailSection";

/**
 * TFT Data Center V2 — Curated Directory & User Guide for Third-Party TFT Tools.
 *
 * Principles:
 * - Does not reinvent third-party data features.
 * - Does not scrape, store, or copy third-party data.
 * - Does not embed third parties (no iframe, zero external network requests).
 * - Focused on Chinese introductions, tutorials, use cases, and mainland access notes.
 */
export function DataCenterPage() {
  const [activeCategory, setActiveCategory] = useState<"all" | SiteCategory>("all");
  const [expandedGuideId, setExpandedGuideId] = useState<string | null>(null);
  const pendingScrollId = useRef<string | null>(null);

  const filteredSites = getFilteredSites(activeCategory);

  useEffect(() => {
    const siteId = pendingScrollId.current;
    if (!siteId || expandedGuideId !== siteId) return;
    pendingScrollId.current = null;
    const el = document.getElementById(`guide-${siteId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [expandedGuideId]);

  function handleViewGuide(siteId: string) {
    if (expandedGuideId === siteId) {
      setExpandedGuideId(null);
      return;
    }
    pendingScrollId.current = siteId;
    setExpandedGuideId(siteId);
  }

  function handleToggleGuide(siteId: string) {
    setExpandedGuideId((current) => (current === siteId ? null : siteId));
  }

  function handleScrollToTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="space-y-6">
      {/* 1. 页面 Header */}
      <PageHeader
        title="TFT 数据中心"
        subtitle="精选云顶之弈数据网站与实用工具，帮助你找到合适的数据、攻略和辅助工具。"
      />

      {/* 原则与设计说明卡片 */}
      <Panel className="border-gold-500/25 bg-gold-500/5">
        <div className="flex flex-col gap-2.5 p-4 text-xs text-ink-200">
          <div className="flex items-start gap-2 text-sm font-semibold text-gold-300">
            <Compass size={17} className="mt-0.5 shrink-0" />
            <span>不重复造轮子，发现优秀工具，了解如何使用</span>
          </div>
          <p className="leading-relaxed text-ink-200">
            这里收录的是经过实际筛选的精选第三方站点与工具。我们不采集或存储第三方数据，不使用 iframe
            嵌入，也不在页面加载时发起任何第三方外部请求。所有介绍、教程与访问建议均为本地静态内容，所有外部站点一律在新标签页安全打开。
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-ink-400">
            <span className="flex items-center gap-1 text-gold-400">
              <ShieldCheck size={13} />
              <span>零外部网络请求</span>
            </span>
            <span>·</span>
            <span>无 iframe 嵌入</span>
            <span>·</span>
            <span>精选 6 大推荐工具</span>
            <span>·</span>
            <span>附带详细上手教程</span>
          </div>
        </div>
      </Panel>

      {/* 2. 按需求快速寻找工具（快捷分类入口） */}
      <section aria-label="按需求筛选网站">
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-400">
              <Filter size={13} className="text-gold-400" />
              <span>按需求快速寻找工具</span>
            </div>
            {activeCategory !== "all" && (
              <button
                type="button"
                onClick={() => {
                  setActiveCategory("all");
                  setExpandedGuideId(null);
                }}
                className="text-xs text-gold-300 hover:underline"
              >
                重置为全部 ({TFT_SITES.length})
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {SITE_CATEGORIES.map((cat) => {
              const isActive = activeCategory === cat.id;
              const count = cat.id === "all" ? TFT_SITES.length : getFilteredSites(cat.id).length;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setActiveCategory(cat.id);
                    setExpandedGuideId(null);
                  }}
                  className={`flex h-10 items-center gap-1.5 rounded-lg border px-3 text-xs transition-colors ${
                    isActive
                      ? "border-gold-500/40 bg-gold-500/15 font-semibold text-gold-300"
                      : "border-line bg-base-900/60 text-ink-400 hover:border-line hover:bg-base-800 hover:text-ink-50"
                  }`}
                  aria-pressed={isActive}
                >
                  <span>{cat.label}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.2 font-mono text-[10px] ${
                      isActive ? "bg-gold-500/25 text-gold-300" : "bg-base-800 text-ink-400"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* 3. 六个网站推荐卡片总览 */}
      <section aria-label="推荐网站列表">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-ink-50">推荐网站总览</h2>
            <Badge tone="neutral" className="text-[11px]">
              共 {filteredSites.length} 个站点
            </Badge>
          </div>
          <span className="hidden text-[11px] text-ink-400 sm:inline">
            卡片提供一句话介绍与快捷外链，下方附详细使用教程
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredSites.map((site) => (
            <SiteCard
              key={site.id}
              site={site}
              onViewGuide={handleViewGuide}
              guideExpanded={expandedGuideId === site.id}
            />
          ))}
        </div>
      </section>

      {/* 4. 各网站详细介绍和使用教程 */}
      <section aria-label="网站详细使用指南" className="space-y-4 pt-2">
        <div className="flex items-start justify-between gap-3 border-b border-line pb-2">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink-50">各网站详细介绍与使用指南</h2>
            <p className="mt-0.5 text-xs text-ink-400">
              包含核心功能、适用场景、简明操作步骤与使用建议
            </p>
          </div>
          <span className="shrink-0 whitespace-nowrap pt-0.5 text-xs text-ink-400">
            {filteredSites.length}/{TFT_SITES.length} 站
          </span>
        </div>

        <div className="space-y-3">
          {filteredSites.map((site) => (
            <SiteDetailSection
              key={site.id}
              site={site}
              expanded={expandedGuideId === site.id}
              onToggle={() => handleToggleGuide(site.id)}
            />
          ))}
        </div>
      </section>

      {/* 5. 访问体验和使用注意事项 */}
      <section aria-label="访问体验与注意事项">
        <Panel className="border-line bg-base-900/90">
          <div className="space-y-4 p-4 sm:p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink-50">
              <Info size={16} className="text-gold-400" />
              <span>访问体验与使用注意事项</span>
            </div>

            <div className="grid gap-3 text-xs leading-relaxed text-ink-200 sm:grid-cols-2">
              <div className="space-y-1.5 rounded-lg border border-line bg-base-850/60 p-3">
                <div className="font-semibold text-ink-50">第三方独立运营与版本延迟</div>
                <p className="text-ink-400">
                  收录的第三方网站由各自团队独立运营，其功能更新、页面结构与数据算法可能会随游戏版本变动。使用数据或评级前请注意核对其标注的游戏补丁版本号。
                </p>
              </div>

              <div className="space-y-1.5 rounded-lg border border-line bg-base-850/60 p-3">
                <div className="font-semibold text-ink-50">英文站点与中文辅助</div>
                <p className="text-ink-400">
                  部分优秀工具（如 TFT Flow、TFTraits、Little Buddy Bot、TFT Academy）为全英文界面。建议结合本指南的中文功能对照与现代浏览器内置翻译功能使用。
                </p>
              </div>

              <div className="space-y-1.5 rounded-lg border border-line bg-base-850/60 p-3">
                <div className="font-semibold text-ink-50">中国大陆访问体验（个人测试记录）</div>
                <p className="text-ink-400">
                  本页面所列的访问状态为开发者在 2026-10-31
                  的个人实机测试记录，因不同地区网络服务商与路由波动，不作为永久连通性保证。
                </p>
              </div>

              <div className="space-y-1.5 rounded-lg border border-line bg-base-850/60 p-3">
                <div className="font-semibold text-ink-50">理性参考与交叉验证</div>
                <p className="text-ink-400">
                  模拟工具与 AI 建议提供思路启发，大数据提供概率倾向。实际对局受发牌员随机性、同局对手对位等多重因素影响，请结合自己的实战体验灵活决策。
                </p>
              </div>
            </div>

            {/* 访问状态汇总表 */}
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-line bg-base-800/80 text-[11px] text-ink-400">
                  <tr>
                    <th className="px-3 py-2 font-medium">网站名称</th>
                    <th className="px-3 py-2 font-medium">核心定位</th>
                    <th className="px-3 py-2 font-medium">语言</th>
                    <th className="px-3 py-2 font-medium">中国大陆访问体验</th>
                    <th className="px-3 py-2 font-medium text-right">核验日期</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60 bg-base-900/60 text-ink-200">
                  {TFT_SITES.map((site) => (
                    <tr key={site.id} className="hover:bg-base-800/40">
                      <td className="px-3 py-2.5 font-medium text-ink-50">
                        <a
                          href={site.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 hover:text-gold-300 hover:underline"
                        >
                          <span>{site.name}</span>
                          <ExternalLink size={11} className="text-ink-600" />
                        </a>
                      </td>
                      <td className="px-3 py-2.5 text-ink-400">{site.categoryLabel}</td>
                      <td className="px-3 py-2.5">
                        <Badge tone={site.language === "中文" ? "info" : "neutral"} className="text-[10px]">
                          {site.language}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge tone={site.badgeTone} className="text-[10px]">
                          {site.accessStatusText}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-[11px] text-ink-400">
                        {site.lastVerified}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Panel>
      </section>

      {/* 底部快速回到顶部 */}
      <div className="flex justify-end pb-4 pt-1">
        <Button variant="secondary" size="sm" onClick={handleScrollToTop}>
          <ArrowUp size={14} />
          <span>回到顶部</span>
        </Button>
      </div>
    </div>
  );
}

