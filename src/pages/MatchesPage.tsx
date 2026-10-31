import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { allMatches, knownCompositions, listMatches } from "../services/match-service";
import {
  EMPTY_MATCH_QUERY,
  paramsToQuery,
  queryToParams,
  type MatchQuery,
} from "../domain/match/query";
import { MatchFilters } from "../components/matches/MatchFilters";
import { MatchList } from "../components/matches/MatchList";
import { AddMatchButton } from "../components/matches/AddMatchButton";
import { EmptyState } from "../components/ui/Badge";
import { Panel, PageHeader } from "../components/ui/Panel";
import { Select } from "../components/ui/Field";
import { Pagination } from "../components/ui/Pagination";
import { Spinner } from "../components/ui/Spinner";
import { useSession } from "../services/session-context";

const PAGE_SIZE = 20;

type Scope = "session" | "all";

export function MatchesPage() {
  const [params, setParams] = useSearchParams();
  const { activeSession, activeSessionId, ready } = useSession();
  // Filters live in the URL, not in local state: a chart on the Dashboard or
  // the Statistics page can then link straight into a filtered list
  // (/matches?mistake=ECONOMY), and the filter survives a reload or a share.
  const query = useMemo<MatchQuery>(
    () => ({ ...EMPTY_MATCH_QUERY, ...paramsToQuery(params) }),
    [params],
  );
  const [scope, setScope] = useState<Scope>("session");
  const [page, setPage] = useState(1);

  // Default scope is the active training session; “全部训练” widens it out.
  const effectiveQuery = useMemo(
    () => (scope === "session" && ready ? { ...query, sessionId: activeSessionId } : query),
    [query, scope, activeSessionId, ready],
  );

  const matches = useLiveQuery(() => listMatches(effectiveQuery), [JSON.stringify(effectiveQuery)]);
  const totalLogged = useLiveQuery(() => allMatches(), []);
  const compositions = useLiveQuery(() => knownCompositions(), [], []);

  useEffect(() => setPage(1), [effectiveQuery, scope]);

  const shown = useMemo(() => {
    const list = matches ?? [];
    const start = (page - 1) * PAGE_SIZE;
    return list.slice(start, start + PAGE_SIZE);
  }, [matches, page]);

  return (
    <>
      <PageHeader
        title="对局"
        subtitle={`${totalLogged?.length ?? "…"} 场对局记录`}
        action={<AddMatchButton />}
      />

      <div className="flex flex-col gap-4">
        <Panel>
          <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
            <label className="flex items-center gap-2 text-xs text-ink-400">
              数据范围
              <Select
                aria-label="数据范围"
                value={scope}
                onChange={(e) => setScope(e.target.value as Scope)}
                className="w-48 py-1.5 text-xs"
              >
                <option value="session">当前训练（{activeSession?.name ?? "日常训练"}）</option>
                <option value="all">全部训练</option>
              </Select>
            </label>
          </div>
          <MatchFilters
            query={query}
            compositions={compositions}
            onChange={(patch) =>
              setParams(queryToParams({ ...query, ...patch }), { replace: true })
            }
            onReset={() => setParams(new URLSearchParams(), { replace: true })}
          />
        </Panel>

        <Panel>
          {matches === undefined ? (
            <Spinner />
          ) : matches.length === 0 ? (
            <EmptyState
              title="没有符合条件的对局"
              description={
                (totalLogged?.length ?? 0) === 0
                  ? "打完一局用「快速记录一局」记录名次和阵容，两分钟之内就能完成。"
                  : scope === "session"
                    ? "当前训练下没有符合条件的对局。可切换到「全部训练」查看历史记录，或清空筛选。"
                    : "试着放宽筛选条件，或清空筛选。"
              }
            />
          ) : (
            <>
              <MatchList matches={shown} />
              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                total={matches.length}
                onPage={setPage}
              />
            </>
          )}
        </Panel>
      </div>
    </>
  );
}
