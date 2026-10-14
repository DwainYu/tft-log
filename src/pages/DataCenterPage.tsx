import { ArrowUpRight, ExternalLink } from "lucide-react";
import {
  resourceSections,
  type ExternalResource,
} from "../data/external-resources";
import { PageHeader, Panel } from "../components/ui/Panel";

/**
 * Data Center V1 — where to look things up outside this app.
 *
 * The boundary is written on the page on purpose: these are third-party
 * entries, their content is not this app's database, and nothing is fetched
 * or embedded here. Static snapshot browsing (champions / traits / items /
 * augments bundled with the app) stays on the 数据 page.
 */
export function DataCenterPage() {
  return (
    <>
      <PageHeader
        title="资料中心"
        subtitle="外部 TFT 资料入口 · 内容由第三方网站维护"
      />

      <Panel className="mb-4">
        <div className="flex flex-col gap-2 p-4 text-sm text-ink-200">
          <p className="flex items-start gap-2">
            <ExternalLink size={15} className="mt-0.5 shrink-0 text-gold-300" />
            <span>
              这里收录的是外部网站的入口，全部在新窗口打开。TFT 日志（TFT Log）
              不抓取、不内嵌、也不为第三方内容背书。
            </span>
          </p>
          <p className="text-xs text-ink-600">
            随应用内置的静态数据（棋子 / 羁绊 / 装备 / 海克斯快照）不在本页，见「数据」页的
            Set 18 静态数据面板。
          </p>
        </div>
      </Panel>

      <div className="flex flex-col gap-6">
        {resourceSections().map((section) => (
          <section key={section.category} aria-label={section.label}>
            <h2 className="mb-2 text-sm font-semibold text-ink-50">{section.label}</h2>
            {section.resources.length === 0 ? (
              <p className="rounded-xl border border-line bg-base-900/60 px-4 py-6 text-center text-xs text-ink-600">
                暂无可用资源
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {section.resources.map((r) => (
                  <ResourceCard key={r.id} resource={r} />
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </>
  );
}

/**
 * The whole card is one external link — one tab stop, one activation. The URL
 * comes from the static catalog, never from user input.
 */
function ResourceCard({ resource }: { resource: ExternalResource }) {
  return (
    <a
      href={resource.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex min-w-0 flex-col gap-2 rounded-xl border border-line bg-base-900/70 p-4 transition-colors hover:border-gold-500/35 hover:bg-base-800"
    >
      <span className="flex items-center gap-1.5 text-sm font-semibold text-ink-50">
        <span className="min-w-0 truncate">{resource.title}</span>
        <ArrowUpRight
          size={14}
          className="shrink-0 text-ink-600 transition-colors group-hover:text-gold-300"
          aria-hidden
        />
      </span>
      <span className="text-xs leading-relaxed text-ink-400">{resource.description}</span>
      <span className="mt-auto inline-flex items-center gap-1 pt-1 text-[11px] text-ink-600 group-hover:text-gold-300">
        打开外部站点
      </span>
    </a>
  );
}
