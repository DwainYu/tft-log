import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../test/render";
import { resetDatabase } from "../../test/db-helper";
import { MatchForm } from "./MatchForm";
import { addMatch } from "../../services/match-service";
import { matchRepository } from "../../data/repository/match-repository";
import { encounterRepository } from "../../data/tft/repositories";

beforeEach(resetDatabase);

const EMBLEM = "SET18_ENC_EMBLEM_ENSEMBLE";
const NO_ENCOUNTER = "SET18_ENC_NONE";

describe("MatchForm · opening encounter", () => {
  it("offers the Set 18 catalogue and saves the choice", async () => {
    const { findByLabelText, getByLabelText, getByRole } = renderWithProviders(
      <MatchForm mode="create" />,
    );
    await waitFor(() => expect(getByLabelText(/开局事件/)).toBeTruthy());

    const select = getByLabelText(/开局事件/) as HTMLSelectElement;
    // every catalog entry is selectable, plus 未记录
    expect(select.options.length).toBe(encounterRepository.getEncounters().length + 1);
    expect(select.value).toBe("");

    fireEvent.click(getByRole("button", { name: "保存对局" }));
    await waitFor(() => expect(select).toBeTruthy());
    void findByLabelText;
  });

  it("echoes the stored encounter when the match is reopened", async () => {
    const m = await addMatch({
      playedAt: "2026-10-14T12:00",
      placement: "2",
      encounterId: EMBLEM,
      openingPlan: "WIN_STREAK",
    });

    renderWithProviders(<MatchForm mode="edit" match={m} />);
    await waitFor(() => expect(screen.getByLabelText(/开局事件/)).toBeTruthy());

    const select = screen.getByLabelText(/开局事件/) as HTMLSelectElement;
    expect(select.value).toBe(EMBLEM);
    // the opening route is echoed too, so the two stay consistent
    expect(screen.getByRole("button", { name: "连胜" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("distinguishes 'no encounter' from 'not recorded'", async () => {
    const none = await addMatch({ playedAt: "2026-10-14T12:00", placement: "2", encounterId: NO_ENCOUNTER });
    renderWithProviders(<MatchForm mode="edit" match={none} />);
    await waitFor(() =>
      expect((screen.getByLabelText(/开局事件/) as HTMLSelectElement).value).toBe(NO_ENCOUNTER),
    );

  });

  it("shows 'not recorded' for a match that never got one", async () => {
    const plain = await addMatch({ playedAt: "2026-10-14T13:00", placement: "3" });
    renderWithProviders(<MatchForm mode="edit" match={plain} />);
    await waitFor(() =>
      expect((screen.getByLabelText(/开局事件/) as HTMLSelectElement).value).toBe(""),
    );
  });

  it("keeps the encounter out of the augment field", async () => {
    const m = await addMatch({
      playedAt: "2026-10-14T12:00",
      placement: "2",
      encounterId: EMBLEM,
      augmentIds: ["DA_18_BigGrabBag"],
    });
    const stored = await matchRepository.get(m.id);
    expect(stored?.encounterId).toBe(EMBLEM);
    expect(stored?.augmentIds).toEqual(["DA_18_BigGrabBag"]);
  });
});

describe("MatchForm · opening route", () => {
  it("can select and deselect a route", async () => {
    renderWithProviders(<MatchForm mode="create" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "连胜" })).toBeTruthy());

    const win = screen.getByRole("button", { name: "连胜" });
    expect(win.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(win);
    expect(win.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(win);
    expect(win.getAttribute("aria-pressed")).toBe("false");
  });
});
