import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "../test/render";
import { resetDatabase } from "../test/db-helper";
import { ReviewDraftsPage } from "./ReviewDraftsPage";
import { addMatch } from "../services/match-service";
import { saveReviewDraft, saveReview } from "../services/review-service";
import { reviewDraftRepository } from "../data/repository/review-draft-repository";
import { matchRepository } from "../data/repository/match-repository";

beforeEach(resetDatabase);

async function seedDraft(
  placement: string,
  composition: string,
  input: Parameters<typeof saveReviewDraft>[1],
) {
  const m = await addMatch({ playedAt: "2026-10-14T12:00", placement, composition });
  await saveReviewDraft(m.id, input);
  return m;
}

describe("ReviewDraftsPage", () => {
  it("says so plainly when there is nothing unfinished", async () => {
    renderWithProviders(<ReviewDraftsPage />);
    await waitFor(() => expect(screen.getByText("还没有未完成的复盘")).toBeInTheDocument());
    expect(screen.getByText("0 份未完成")).toBeInTheDocument();
  });

  it("lists an unfinished draft and links back to its review", async () => {
    const m = await seedDraft("4", "Elderwood", { bestDecision: "2-5 存钱", primaryMistake: "ECONOMY" });
    renderWithProviders(<ReviewDraftsPage />);

    await waitFor(() => expect(screen.getByText("1 份未完成")).toBeInTheDocument());
    const item = screen.getByText(/Elderwood/).closest("li")!;
    expect(within(item).getByText(/2 项待补/)).toBeInTheDocument();
    // "继续写" goes to the review page for that exact match
    const links = within(item).getAllByRole("link");
    expect(links.some((l) => l.getAttribute("href") === `/matches/${m.id}/review`)).toBe(true);
  });

  it("never lists a match whose 复盘 is already finished", async () => {
    const m = await addMatch({ playedAt: "2026-10-14T12:00", placement: "2", composition: "Elderwood" });
    await saveReview(m.id, {
      primaryMistake: "ECONOMY",
      biggestMistake: "利息没吃满",
      bestDecision: "2-5 存钱",
      nextGameFocus: "吃满利息",
    });
    // a stale draft row must still not resurface it
    await saveReviewDraft(m.id, { bestDecision: "2-5 存钱" });

    renderWithProviders(<ReviewDraftsPage />);
    await waitFor(() => expect(screen.getByText("0 份未完成")).toBeInTheDocument());
    expect(screen.queryByText(/Elderwood/)).not.toBeInTheDocument();
  });

  it("deletes a draft after confirmation, and leaves the match alone", async () => {
    const m = await seedDraft("7", "Rebel", { bestDecision: "早点上 8" });
    renderWithProviders(<ReviewDraftsPage />);

    await waitFor(() => expect(screen.getByText("1 份未完成")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /删除 .* 的草稿/ }));
    fireEvent.click(await screen.findByRole("button", { name: /^删除草稿$/ }));

    await waitFor(() => expect(screen.getByText("还没有未完成的复盘")).toBeInTheDocument());
    expect(await reviewDraftRepository.get(m.id)).toBeUndefined();
    // the match itself is untouched — deleting a draft is not deleting a game
    expect(await matchRepository.get(m.id)).toBeDefined();
  });

  it("shows every unfinished draft, not just the newest", async () => {
    await seedDraft("2", "Elderwood", { bestDecision: "A" });
    await seedDraft("7", "Rebel", { bestDecision: "B" });
    renderWithProviders(<ReviewDraftsPage />);
    await waitFor(() => expect(screen.getByText("2 份未完成")).toBeInTheDocument());
    expect(screen.getByText(/Elderwood/)).toBeInTheDocument();
    expect(screen.getByText(/Rebel/)).toBeInTheDocument();
  });
});
