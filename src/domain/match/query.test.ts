import { describe, expect, it } from "vitest";
import { paramsToQuery, queryMatches, queryToParams } from "./query";
import { EMPTY_MATCH_QUERY } from "./query";
import type { MatchForQuery } from "./match";

const m = (over: Partial<MatchForQuery> & { id: string }): MatchForQuery => ({
  playedAt: "2026-02-05T13:00",
  placement: 4,
  reviewed: false,
  ...over,
});

const matches: MatchForQuery[] = [
  m({ id: "a", playedAt: "2026-02-05T13:00", placement: 1, composition: "Arcader", reviewed: true, primaryMistake: "ROLLING", durationSeconds: 1800, notes: "锁血成功" }),
  m({ id: "b", playedAt: "2026-02-04T20:30", placement: 5, composition: "Arcader", durationSeconds: 1500, augments: ["升级"], sessionId: "daily" }),
  m({ id: "c", playedAt: "2026-02-03T18:10", placement: 3, composition: "Rebel", coreUnits: ["Kaisa"], primaryMistake: "POSITIONING", sessionId: "yunding-s18" }),
];

const ids = (list: MatchForQuery[]) => list.map((x) => x.id);

describe("queryMatches", () => {
  it("sorts by playedAt descending by default", () => {
    expect(ids(queryMatches(matches, {}))).toEqual(["a", "b", "c"]);
  });

  it("sorts ascending when asked", () => {
    expect(ids(queryMatches(matches, { sortDir: "asc" }))).toEqual(["c", "b", "a"]);
  });

  it("filters top4 vs bottom4 vs win", () => {
    expect(ids(queryMatches(matches, { placement: "top4" }))).toEqual(["a", "c"]);
    expect(ids(queryMatches(matches, { placement: "bottom4" }))).toEqual(["b"]);
    expect(ids(queryMatches(matches, { placement: "win" }))).toEqual(["a"]);
  });

  it("filters reviewed state", () => {
    expect(ids(queryMatches(matches, { reviewed: "reviewed" }))).toEqual(["a"]);
    expect(ids(queryMatches(matches, { reviewed: "unreviewed" }))).toEqual(["b", "c"]);
  });

  it("filters composition and mistake type", () => {
    expect(ids(queryMatches(matches, { composition: "Arcader" }))).toEqual(["a", "b"]);
    expect(ids(queryMatches(matches, { mistake: "ROLLING" }))).toEqual(["a"]);
    expect(ids(queryMatches(matches, { mistake: "none" }))).toEqual(["b"]);
  });

  it("filters by inclusive date range", () => {
    expect(ids(queryMatches(matches, { from: "2026-02-04", to: "2026-02-04" }))).toEqual(["b"]);
    expect(ids(queryMatches(matches, { from: "2026-02-04" }))).toEqual(["a", "b"]);
    expect(ids(queryMatches(matches, { to: "2026-02-03" }))).toEqual(["c"]);
  });

  it("searches composition, units, augments, notes and placement", () => {
    expect(ids(queryMatches(matches, { search: "kaisa" }))).toEqual(["c"]);
    expect(ids(queryMatches(matches, { search: "锁血" }))).toEqual(["a"]);
    expect(ids(queryMatches(matches, { search: "升级" }))).toEqual(["b"]);
    expect(ids(queryMatches(matches, { search: "nomatch" }))).toEqual([]);
  });

  it("filters by training session", () => {
    // session "a" has none (legacy-ish record), others carry explicit sessions
    expect(ids(queryMatches(matches, { sessionId: "yunding-s18" }))).toEqual(["c"]);
    expect(ids(queryMatches(matches, { sessionId: "daily" }))).toEqual(["b"]);
    expect(ids(queryMatches(matches, { sessionId: "cup-prep" }))).toEqual([]);
  });

  it("sorts placement-less records last in both directions", () => {
    const withGaps: MatchForQuery[] = [
      m({ id: "done-2", playedAt: "2026-02-05T13:00", placement: 2 }),
      m({ id: "open", playedAt: "2026-02-06T13:00", placement: undefined }),
      m({ id: "done-1", playedAt: "2026-02-04T13:00", placement: 1 }),
      m({ id: "open-old", playedAt: "2026-02-02T13:00", placement: undefined }),
    ];

    // ascending: 1, 2, then the unfinished ones (newest first among themselves)
    expect(ids(queryMatches(withGaps, { sortField: "placement", sortDir: "asc" }))).toEqual([
      "done-1",
      "done-2",
      "open",
      "open-old",
    ]);

    // descending: 2, 1, then the unfinished ones — reversing must not float
    // them to the top, which a plain `a - b` would do via NaN.
    expect(ids(queryMatches(withGaps, { sortField: "placement", sortDir: "desc" }))).toEqual([
      "done-2",
      "done-1",
      "open",
      "open-old",
    ]);
  });

  it("excludes placement-less records from the top4 / bottom4 / win filters", () => {
    const withGap: MatchForQuery[] = [
      m({ id: "settled", playedAt: "2026-02-05T13:00", placement: 3 }),
      m({ id: "open", playedAt: "2026-02-06T13:00", placement: undefined }),
    ];
    expect(ids(queryMatches(withGap, { placement: "top4" }))).toEqual(["settled"]);
    expect(ids(queryMatches(withGap, { placement: "bottom4" }))).toEqual([]);
    expect(ids(queryMatches(withGap, { placement: "win" }))).toEqual([]);
  });

  it("applies several filters together", () => {
    expect(
      ids(queryMatches(matches, { composition: "Arcader", placement: "top4", sortDir: "asc" })),
    ).toEqual(["a"]);
  });
});

const params = (qs: string) => new URLSearchParams(qs);

describe("query <-> URL", () => {
  it("round-trips a drill-down filter", () => {
    const query = { ...EMPTY_MATCH_QUERY, mistake: "ECONOMY" };
    const qs = queryToParams(query).toString();
    expect(qs).toBe("mistake=ECONOMY");
    expect(paramsToQuery(params(qs))).toEqual({ mistake: "ECONOMY" });
  });

  it("carries composition, reviewed and search", () => {
    const qs = queryToParams({
      ...EMPTY_MATCH_QUERY,
      composition: "福牛 战神",
      reviewed: "unreviewed",
      search: "决赛圈",
    }).toString();
    expect(paramsToQuery(params(qs))).toMatchObject({
      composition: "福牛 战神",
      reviewed: "unreviewed",
      search: "决赛圈",
    });
  });

  it("leaves defaults and empty values out of the URL", () => {
    expect(queryToParams(EMPTY_MATCH_QUERY).toString()).toBe("");
    expect(queryToParams({ ...EMPTY_MATCH_QUERY, sortField: "placement" }).toString()).toBe(
      "sortField=placement",
    );
  });

  it("reads nothing from an empty URL", () => {
    expect(paramsToQuery(params(""))).toEqual({});
  });

  it("never writes sessionId — scope stays a page control", () => {
    expect(queryToParams({ ...EMPTY_MATCH_QUERY, sessionId: "daily" }).toString()).toBe("");
  });
});
