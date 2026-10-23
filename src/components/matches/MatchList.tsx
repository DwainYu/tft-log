import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, ChevronRight, Circle } from "lucide-react";
import { mistakeLabel } from "../../domain/labels";
import { placementText, placementTone } from "../../domain/match/match";
import type { Match } from "../../domain/types";
import { formatDuration } from "../../lib/utils";
import { DESKTOP_QUERY, useMediaQuery } from "../../lib/use-media-query";
import { formatDateWeekday, formatTime } from "../../lib/wallclock";
import { Badge } from "../ui/Badge";

const TONE: Record<string, "gold" | "good" | "bad" | "neutral"> = {
  gold: "gold",
  good: "good",
  bad: "bad",
  // 还没结算的对局：中性色，别让它看起来像打崩了。
  muted: "neutral",
};

const linkClass = "text-xs text-gold-300 underline-offset-4 hover:underline";

/**
 * One row per match — table on desktop, card list below the md breakpoint.
 *
 * `variant="compact"` trims the columns that only matter on the full 对局
 * page (Level, Duration, Primary Mistake): the Dashboard list answers
 * "what did I play and how did it go", not "what is in each game".
 *
 * On the full variant the Level / Duration / Mistake columns hide themselves
 * when no row in the current page carries a value — a table of em-dashes is
 * noise, and the fields come back the moment they are filled in.
 */
export function MatchList({
  matches,
  variant = "full",
}: {
  matches: Match[];
  variant?: "full" | "compact";
}) {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const compact = variant === "compact";
  if (!desktop) return <MatchCards matches={matches} />;

  const showLevel = !compact && matches.some((m) => m.finalLevel !== undefined);
  const showDuration = !compact && matches.some((m) => m.durationSeconds !== undefined);
  const showMistake = !compact && matches.some((m) => m.primaryMistake);

  return (
    <table className="w-full text-left text-sm">
      <thead className="border-b border-line text-[11px] uppercase tracking-wide text-ink-600">
        <tr>
          <th className="px-3 py-2 font-medium">Date</th>
          <th className="px-3 py-2 font-medium">Placement</th>
          <th className="px-3 py-2 font-medium">Comp</th>
          {showLevel && <th className="px-3 py-2 font-medium">Level</th>}
          {showDuration && <th className="px-3 py-2 font-medium">Duration</th>}
          <th className="px-3 py-2 font-medium">Reviewed</th>
          {showMistake && <th className="px-3 py-2 font-medium">Primary Mistake</th>}
          <th className="px-3 py-2" aria-label="操作" />
        </tr>
      </thead>
      <tbody>
        {matches.map((m) => (
          <MatchRow
            key={m.id}
            match={m}
            showLevel={showLevel}
            showDuration={showDuration}
            showMistake={showMistake}
          />
        ))}
      </tbody>
    </table>
  );
}

/** Desktop row: the whole row clicks through to the detail, 详情 stays the keyboard path. */
function MatchRow({
  match: m,
  showLevel,
  showDuration,
  showMistake,
}: {
  match: Match;
  showLevel: boolean;
  showDuration: boolean;
  showMistake: boolean;
}) {
  const navigate = useNavigate();
  return (
    <tr
      onClick={() => navigate(`/matches/${m.id}`)}
      className="cursor-pointer border-b border-line/60 last:border-0 hover:bg-base-800/60"
    >
      <td className="px-3 py-2.5">
        <div className="num text-ink-50">{m.playedAt.slice(5, 10)}</div>
        <div className="num text-[11px] text-ink-600">
          {formatDateWeekday(m.playedAt)} {formatTime(m.playedAt) || "—"}
        </div>
      </td>
      <td className="px-3 py-2.5">
        <Badge tone={TONE[placementTone(m.placement)]}>{placementText(m.placement)}</Badge>
      </td>
      <td className="max-w-[22ch] truncate px-3 py-2.5 text-ink-200">
        {m.composition ?? <span className="text-ink-600">未填</span>}
      </td>
      {showLevel && <td className="num px-3 py-2.5 text-ink-200">{m.finalLevel ?? "—"}</td>}
      {showDuration && (
        <td className="num px-3 py-2.5 text-ink-400">
          {m.durationSeconds !== undefined ? formatDuration(m.durationSeconds) : "—"}
        </td>
      )}
      <td className="px-3 py-2.5">
        <ReviewedFlag reviewed={m.reviewed} />
      </td>
      {showMistake && (
        <td className="px-3 py-2.5">
          {m.primaryMistake ? (
            <Badge tone="neutral">{mistakeLabel(m.primaryMistake)}</Badge>
          ) : (
            <span className="text-xs text-ink-600">—</span>
          )}
        </td>
      )}
      <td className="px-3 py-2.5 text-right">
        <Link
          to={`/matches/${m.id}`}
          onClick={(e) => e.stopPropagation()}
          className={linkClass}
        >
          详情
        </Link>
      </td>
    </tr>
  );
}

function ReviewedFlag({ reviewed }: { reviewed: boolean }) {
  return reviewed ? (
    <span className="inline-flex items-center gap-1 text-xs text-good">
      <CheckCircle2 size={13} /> 已复盘
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs text-ink-600">
      <Circle size={13} /> 未复盘
    </span>
  );
}

function MatchCards({ matches }: { matches: Match[] }) {
  return (
    <ul className="divide-y divide-line">
      {matches.map((m) => (
        <li key={m.id}>
          <Link to={`/matches/${m.id}`} className="block px-4 py-3 hover:bg-base-800/60">
            <div className="flex items-center gap-2">
              <Badge tone={TONE[placementTone(m.placement)]}>{placementText(m.placement)}</Badge>
              <span className="num text-xs text-ink-400">
                {m.playedAt.slice(5, 10)} {formatTime(m.playedAt)}
              </span>
              <span className="ml-auto inline-flex items-center gap-0.5 text-[11px] text-ink-600">
                {m.reviewed ? "已复盘" : "未复盘"}
                <ChevronRight size={12} aria-hidden />
              </span>
            </div>
            <div className="mt-1.5 truncate text-sm text-ink-50">
              {m.composition ?? "未填阵容"}
              {m.finalLevel !== undefined ? (
                <span className="num text-xs text-ink-600"> · Lv{m.finalLevel}</span>
              ) : null}
            </div>
            {m.primaryMistake && (
              <div className="mt-1">
                <Badge tone="neutral">{mistakeLabel(m.primaryMistake)}</Badge>
              </div>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
