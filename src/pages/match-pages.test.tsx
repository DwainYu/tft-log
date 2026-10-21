import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { MatchesPage } from "./MatchesPage";
import { MatchDetailPage } from "./MatchDetailPage";
import { addMatch, allMatches } from "../services/match-service";
import { saveReview } from "../services/review-service";
import { saveScreenshots, screenshotStorage } from "../services/screenshot-service";
import { resetDatabase } from "../test/db-helper";
import { renderWithProviders } from "../test/render";

/** Real routes so `useParams` behaves like it does in the app. */
function renderApp(route: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/matches" element={<MatchesPage />} />
      <Route path="/matches/:id" element={<MatchDetailPage />} />
    </Routes>,
    route,
  );
}

/** Reads the query string back out, to prove filters live in the URL. */
function LocationProbe() {
  const { search } = useLocation();
  return <div data-testid="query">{search}</div>;
}

const table = () => within(screen.getByRole("table"));

beforeEach(resetDatabase);

async function seed() {
  const a = await addMatch({
    playedAt: "2026-02-05T13:20",
    placement: "1",
    composition: "Arcader",
    finalLevel: "8",
    durationMinutes: "31",
    primaryMistake: "POSITIONING",
  });
  await saveReview(a.id, {
    primaryMistake: "POSITIONING",
    biggestMistake: "决赛圈主 C 被对面刺客切死",
    bestDecision: "3-2 上 6 抢节奏",
    nextGameFocus: "决赛圈把主 C 放左下角",
  });
  await addMatch({
    playedAt: "2026-02-04T20:15",
    placement: "7",
    composition: "Rebel",
    finalLevel: "6",
    coreUnits: "Jhin / Vi",
  });
}

describe("Matches page", () => {
  it("lists matches with placement, comp, level, duration, reviewed and mistake", async () => {
    await seed();
    renderApp("/matches");

    await screen.findByRole("table");
    const row = (await table().findByText("Arcader")).closest("tr")!;
    expect(within(row).getByText("第 1 名")).toBeInTheDocument();
    expect(within(row).getByText("8")).toBeInTheDocument();
    expect(within(row).getByText("31分00秒")).toBeInTheDocument();
    expect(within(row).getByText("已复盘")).toBeInTheDocument();
    expect(within(row).getByText("站位")).toBeInTheDocument();

    expect(table().getByText("Rebel")).toBeInTheDocument();
    expect(table().getByText("未复盘")).toBeInTheDocument();
  });

  it("filters with the reviewed and placement selects", async () => {
    await seed();
    renderApp("/matches");
    await screen.findByRole("table");
    await table().findByText("Arcader");

    fireEvent.change(screen.getByLabelText("复盘"), { target: { value: "unreviewed" } });
    await waitFor(() =>
      expect(table().queryByText("Arcader")).not.toBeInTheDocument(),
    );
    expect(table().getByText("Rebel")).toBeInTheDocument();

    // reset brings the reviewed match back
    fireEvent.click(screen.getByRole("button", { name: "清空筛选" }));
    await waitFor(() => expect(table().getByText("Arcader")).toBeInTheDocument());
  });

  it("searches free text across the record", async () => {
    await seed();
    renderApp("/matches");
    await screen.findByRole("table");
    await table().findByText("Arcader");

    fireEvent.change(screen.getByLabelText("搜索"), { target: { value: "jhIN" } });
    await waitFor(() => expect(table().queryByText("Arcader")).not.toBeInTheDocument());
    expect(table().getByText("Rebel")).toBeInTheDocument();
  });

  it("starts from the unreviewed filter when linked from the dashboard", async () => {
    await seed();
    renderApp("/matches?reviewed=unreviewed");
    await screen.findByRole("table");
    await table().findByText("Rebel");
    expect(table().queryByText("Arcader")).not.toBeInTheDocument();
  });

  it("starts from the mistake filter a mistake chart drills down with", async () => {
    await seed();
    renderApp("/matches?mistake=POSITIONING");
    await screen.findByRole("table");
    expect(screen.getByLabelText("错误类型")).toHaveValue("POSITIONING");
    await table().findByText("Arcader");
    expect(table().queryByText("Rebel")).not.toBeInTheDocument();
  });

  it("starts from the composition filter a composition row drills down with", async () => {
    await seed();
    renderApp("/matches?composition=Rebel");
    await screen.findByRole("table");
    expect(screen.getByLabelText("阵容")).toHaveValue("Rebel");
    await table().findByText("Rebel");
    expect(table().queryByText("Arcader")).not.toBeInTheDocument();
  });

  it("writes filters into the URL so a filtered list can be shared", async () => {
    await seed();
    renderWithProviders(
      <Routes>
        <Route
          path="/matches"
          element={
            <>
              <MatchesPage />
              <LocationProbe />
            </>
          }
        />
      </Routes>,
      "/matches",
    );
    await screen.findByRole("table");
    await table().findByText("Arcader");
    expect(screen.getByTestId("query")).toHaveTextContent("");

    fireEvent.change(screen.getByLabelText("复盘"), { target: { value: "unreviewed" } });
    await waitFor(() => expect(screen.getByTestId("query")).toHaveTextContent("reviewed=unreviewed"));
  });

  it("shows an empty state when nothing is logged", async () => {
    renderApp("/matches");
    expect(await screen.findByText("没有符合条件的对局")).toBeInTheDocument();
  });

  it("hides Level/Duration/Mistake columns when no record carries them", async () => {
    // Real early records often only have placement + composition: a column of
    // em-dashes is noise, not information.
    await addMatch({ playedAt: "2026-02-05T13:20", placement: "1", composition: "Arcader" });
    await addMatch({ playedAt: "2026-02-04T20:15", placement: "7", composition: "Rebel" });
    renderApp("/matches");

    await screen.findByRole("table");
    expect(table().getByRole("columnheader", { name: "Date" })).toBeInTheDocument();
    expect(table().queryByRole("columnheader", { name: "Level" })).not.toBeInTheDocument();
    expect(table().queryByRole("columnheader", { name: "Duration" })).not.toBeInTheDocument();
    expect(table().queryByRole("columnheader", { name: /Primary Mistake/ })).not.toBeInTheDocument();
  });
});

describe("Match detail page", () => {
  it("shows the record, its review conclusion and delete action", async () => {
    await seed();
    const match = await addMatch({ playedAt: "2026-02-03T18:00", placement: "3", composition: "Fortune" });
    renderApp(`/matches/${match.id}`);

    expect(await screen.findByText("第 3 名 · Fortune")).toBeInTheDocument();
    expect(screen.getByText("2026-02-03")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /删除/ })).toBeInTheDocument();
    expect(screen.getAllByText("开始复盘").length).toBeGreaterThan(0);
    expect(screen.getByText("添加决策")).toBeInTheDocument();
  });

  it("marks the review state on the conclusion panel, not only in the facts", async () => {
    const match = await addMatch({ playedAt: "2026-02-03T18:00", placement: "3" });
    renderApp(`/matches/${match.id}`);

    const panel = (await screen.findByText("复盘结论")).closest("section")!;
    expect(within(panel).getByText("未复盘")).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: /开始复盘/ })).toBeInTheDocument();
  });

  it("collapses the empty composition details into one hint", async () => {
    const match = await addMatch({ playedAt: "2026-02-03T18:00", placement: "3", composition: "Fortune" });
    renderApp(`/matches/${match.id}`);

    const panel = (await screen.findByText("阵容 / 装备 / 强化符文")).closest("section")!;
    expect(within(panel).queryAllByText("未填写")).toHaveLength(0);
    expect(within(panel).getByText(/还没有记录羁绊/)).toBeInTheDocument();
  });

  it("reports a missing match instead of crashing", async () => {
    renderApp("/matches/does-not-exist");
    expect(await screen.findByText("找不到这局对局")).toBeInTheDocument();
  });

  it("deletes the match from the detail page", async () => {
    const m = await addMatch({ playedAt: "2026-02-03T18:00", placement: "5" });
    await addMatch({ playedAt: "2026-02-02T18:00", placement: "5" });
    renderApp(`/matches/${m.id}`);

    fireEvent.click(await screen.findByRole("button", { name: /删除/ }));
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

    await waitFor(async () => expect(await allMatches()).toHaveLength(1));
  });

  it("shows screenshots on the detail page and clears them with the match", async () => {
    const m = await addMatch({ playedAt: "2026-02-03T18:00", placement: "5" });
    // Full 8-byte PNG signature: the sniff needs all of it to recognise the file.
    const png = new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      "shot.png",
      { type: "image/png" },
    );
    await saveScreenshots(m.id, [{ name: png.name, type: png.type, size: png.size, blob: png }]);
    renderApp(`/matches/${m.id}`);

    expect(await screen.findByTitle(/shot\.png/)).toBeInTheDocument();

    // The confirmation says how much would go with the match, because images
    // cannot be recovered afterwards.
    fireEvent.click(await screen.findByRole("button", { name: /删除/ }));
    expect(screen.getByText(/1 张截图会一起删除/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

    await waitFor(async () => expect(await screenshotStorage()).toEqual({ count: 0, bytes: 0 }));
  });
});
