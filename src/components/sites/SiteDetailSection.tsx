import {
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  Compass,
  ExternalLink,
  Globe,
  Lightbulb,
  ListOrdered,
  Sparkles,
} from "lucide-react";
import { Badge } from "../ui/Badge";
import { Panel } from "../ui/Panel";
import type { TftSite } from "../../data/tft-sites";

export interface SiteDetailSectionProps {
  site: TftSite;
  expanded: boolean;
  onToggle: () => void;
}

export function SiteDetailSection({ site, expanded, onToggle }: SiteDetailSectionProps) {
  return (
    <div id={`guide-${site.id}`} className="scroll-mt-28 lg:scroll-mt-20">
      <Panel>
        <div className="flex flex-col gap-3 border-b border-line px-4 py-3 sm:flex-row sm:flex-wrap sm:items-start">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-controls={`guide-content-${site.id}`}
            className="flex w-full min-w-0 items-start gap-2.5 rounded-lg p-1 text-left transition-colors hover:bg-base-800/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-500/60 sm:flex-1"
          >
            <span
              className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded border font-mono text-[11px] font-bold ${site.brandAccent.bg} ${site.brandAccent.text} ${site.brandAccent.border}`}
              aria-hidden="true"
            >
              {site.shortName}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-base font-semibold text-ink-50">{site.name}</span>
                <Badge tone="neutral" className="text-[11px]">
                  {site.categoryLabel}
                </Badge>
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-ink-400">
                {site.tagline}
              </span>
              <span className="mt-1 inline-block text-[11px] font-medium text-gold-300">
                {expanded ? "收起使用指南" : "展开使用指南"}
              </span>
            </span>
            <ChevronDown
              size={16}
              aria-hidden="true"
              className={`mt-1 shrink-0 text-ink-400 transition-transform ${expanded ? "rotate-180" : ""}`}
            />
          </button>

          <a
            href={site.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center justify-center gap-1 self-start rounded-lg border border-gold-500/35 bg-gold-500/10 px-3 text-xs font-medium text-gold-300 transition-colors hover:bg-gold-500/20"
          >
            <span>访问 {site.name}</span>
            <ArrowUpRight size={14} />
          </a>
        </div>

        {expanded && (
          <div id={`guide-content-${site.id}`} className="space-y-5 p-4 text-sm sm:p-5">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-400">
                <Compass size={14} className="text-gold-400" />
                <span>基本介绍</span>
              </div>
              <p className="text-sm leading-relaxed text-ink-200">{site.description}</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-line bg-base-900/60 p-3.5">
                <div className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold text-ink-50">
                  <Sparkles size={14} className="text-teal-400" />
                  <span>核心功能</span>
                </div>
                <ul className="space-y-2">
                  {site.coreFeatures.map((feat, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2 text-xs leading-relaxed text-ink-200"
                    >
                      <span className="mt-1 size-1.5 shrink-0 rounded-full bg-teal-400/80" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl border border-line bg-base-900/60 p-3.5">
                <div className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold text-ink-50">
                  <CheckCircle2 size={14} className="text-gold-400" />
                  <span>适用场景（何时使用）</span>
                </div>
                <ul className="space-y-2">
                  {site.useCases.map((useCase, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2 text-xs leading-relaxed text-ink-200"
                    >
                      <span className="mt-1 size-1.5 shrink-0 rounded-full bg-gold-400/80" />
                      <span>{useCase}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-400">
                <ListOrdered size={14} className="text-gold-400" />
                <span>简易使用教程</span>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {site.tutorial.map((step, idx) => (
                  <div
                    key={idx}
                    className="flex gap-3 rounded-lg border border-line bg-base-850/90 p-3"
                  >
                    <span className="grid size-6 shrink-0 place-items-center rounded-md border border-gold-500/35 bg-gold-500/10 font-mono text-xs font-bold text-gold-300">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <h4 className="text-xs font-medium text-ink-50">{step.title}</h4>
                      <p className="mt-1 text-xs leading-relaxed text-ink-400">{step.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-gold-500/30 bg-gold-500/5 p-3.5">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-gold-300">
                <Lightbulb size={14} />
                <span>使用建议与注意事项</span>
              </div>
              <ul className="space-y-1.5">
                {site.recommendations.map((rec, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2 text-xs leading-relaxed text-ink-200"
                  >
                    <span className="mt-1 text-gold-400">·</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line/70 bg-base-900/80 px-3.5 py-2.5 text-xs text-ink-400">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Globe size={13} className="text-ink-400" />
                  <span>语言支持:</span>
                  <Badge
                    tone={site.language === "中文" ? "info" : "neutral"}
                    className="text-[10px]"
                  >
                    {site.language}
                  </Badge>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span>大陆访问测试:</span>
                  <Badge tone={site.badgeTone} className="text-[10px]">
                    {site.accessStatusText}
                  </Badge>
                  <span className="text-[11px] text-ink-400">({site.accessNote})</span>
                </div>
              </div>

              <div className="ml-auto flex items-center gap-3">
                <span className="text-[11px] text-ink-400">测试记录: {site.lastVerified}</span>
                <a
                  href={site.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-gold-300 hover:underline"
                >
                  <span>直接访问</span>
                  <ExternalLink size={12} />
                </a>
              </div>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
