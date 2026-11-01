import { useState } from "react";
import type { TftSite } from "../../data/tft-sites";

/**
 * Shared site icon: remote favicon with letter-badge fallback.
 * The card, detail header and guide header all render through this so the
 * favicon URL lives only in the site data, never in per-section markup.
 */
export function SiteIcon({ site, size = 40 }: { site: TftSite; size?: number }) {
  const [failed, setFailed] = useState(false);
  const showFavicon = Boolean(site.faviconUrl) && !failed;
  const sizeClass = size >= 40 ? "size-10" : "size-6";

  if (showFavicon) {
    return (
      <span
        className={`flex ${sizeClass} shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-base-850`}
        aria-hidden="true"
      >
        <img
          src={site.faviconUrl}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="size-full object-contain"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }

  return (
    <span
      className={`flex ${sizeClass} shrink-0 items-center justify-center rounded-lg border font-mono text-xs font-bold tracking-wider transition-colors ${site.brandAccent.bg} ${site.brandAccent.text} ${site.brandAccent.border}`}
      aria-hidden="true"
    >
      {site.shortName}
    </span>
  );
}
