import { ArrowUpRight, BookOpen, ExternalLink } from "lucide-react";
import { Badge } from "../ui/Badge";
import type { TftSite } from "../../data/tft-sites";

export interface SiteCardProps {
  site: TftSite;
  onViewGuide: (siteId: string) => void;
  guideExpanded?: boolean;
}

export function SiteCard({ site, onViewGuide, guideExpanded = false }: SiteCardProps) {
  return (
    <article
      data-testid={`site-card-${site.id}`}
      className="group relative flex h-full flex-col justify-between rounded-xl border border-line bg-base-900/70 p-4 transition-all hover:border-gold-500/35 hover:bg-base-800/80"
    >
      <div className="flex flex-col gap-3">
        {/* Header row: Brand logo/initials + Name + Category + Direct external link */}
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className={`flex size-9 shrink-0 items-center justify-center rounded-lg border font-mono text-xs font-bold tracking-wider transition-colors ${site.brandAccent.bg} ${site.brandAccent.text} ${site.brandAccent.border}`}
              aria-hidden="true"
            >
              {site.shortName}
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold leading-snug text-ink-50 group-hover:text-gold-300">
                {site.name}
              </h3>
              <p className="text-[11px] text-ink-400">{site.categoryLabel}</p>
            </div>
          </div>

          <a
            href={site.url}
            target="_blank"
            rel="noopener noreferrer"
            title={`在浏览器新标签页打开 ${site.name}`}
            className="flex size-10 shrink-0 items-center justify-center rounded-md border border-line bg-base-850 text-ink-400 transition-colors hover:border-gold-500/40 hover:text-gold-300"
            aria-label={`访问 ${site.name}（新窗口打开）`}
          >
            <ArrowUpRight size={16} />
          </a>
        </div>

        {/* Tagline */}
        <p className="text-xs leading-relaxed text-ink-200">{site.tagline}</p>

        {/* Core feature tags */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {site.coreFeatures.slice(0, 2).map((feat, idx) => {
            const shortFeat = feat.split("：")[0];
            return (
              <Badge key={idx} tone="neutral" className="text-[10px]">
                {shortFeat}
              </Badge>
            );
          })}
        </div>
      </div>

      {/* Meta tags and actions */}
      <div className="mt-4 flex flex-col gap-3 border-t border-line/60 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-ink-400">语言:</span>
            <Badge tone={site.language === "中文" ? "info" : "neutral"} className="text-[10px]">
              {site.language}
            </Badge>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-ink-400">大陆访问:</span>
            <Badge tone={site.badgeTone} className="text-[10px]">
              {site.accessStatusText}
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => onViewGuide(site.id)}
            aria-expanded={guideExpanded}
            aria-controls={`guide-panel-${site.id}`}
            className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-line bg-base-800/80 px-2.5 text-xs text-ink-200 transition-colors hover:border-gold-500/35 hover:bg-base-700 hover:text-gold-300"
          >
            <BookOpen size={14} className="shrink-0" />
            <span>{guideExpanded ? "收起指南" : "使用指南"}</span>
          </button>

          <a
            href={site.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-gold-500/35 bg-gold-500/10 px-2.5 text-xs font-medium text-gold-300 transition-colors hover:bg-gold-500/20"
          >
            <ExternalLink size={14} className="shrink-0" />
            <span>访问网站</span>
          </a>
        </div>
      </div>
    </article>
  );
}
