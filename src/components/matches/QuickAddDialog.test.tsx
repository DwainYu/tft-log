import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QuickAddDialog } from "./QuickAddDialog";
import { allMatches, getMatchBundle } from "../../services/match-service";
import { compositionUsageRepository } from "../../data/repository/composition-usage-repository";
import { resetDatabase } from "../../test/db-helper";
import { ToastProvider } from "../ui/Toast";

// The dialog navigates on "保存并详细复盘"; a stub keeps this test about data.
const navigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigate };
});

// Controllable wall clock: the dialog seeds `playedAt` from `wallClockNow()`,
// and these tests need to move "now" without touching real timers (Dexie and
// useLiveQuery run on real async). When unset, the real implementation is used.
const timeControl = vi.hoisted(() => ({ now: undefined as string | undefined }));
vi.mock("../../lib/wallclock", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/wallclock")>();
  return {
    ...actual,
    wallClockNow: () => timeControl.now ?? actual.wallClockNow(),
  };
});

function renderDialog(onClose = () => undefined, open = true) {
  return render(
    <ToastProvider>
      <QuickAddDialog open={open} onClose={onClose} />
    </ToastProvider>,
  );
}

function rerenderDialog(
  view: ReturnType<typeof renderDialog>,
  onClose = () => undefined,
  open = true,
) {
  view.rerender(
    <ToastProvider>
      <QuickAddDialog open={open} onClose={onClose} />
    </ToastProvider>,
  );
}

beforeEach(async () => {
  await resetDatabase();
  navigate.mockClear();
  timeControl.now = undefined;
});

describe("Quick Add", () => {
  it("requires a placement before saving", async () => {
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: /^保存$/ }));
    expect(await screen.findByText("赛后结算请先选择名次（快捷键 1 – 8）")).toBeInTheDocument();
    expect(await allMatches()).toHaveLength(0);
  });

  it("saves a complete match in one pass", async () => {
    renderDialog();

    fireEvent.click(screen.getByRole("radio", { name: "第 3 名" }));
    fireEvent.change(screen.getByLabelText("阵容"), { target: { value: "Arcader" } });
    // 海克斯 now comes from the Set 18 picker: search + click, ids only
    fireEvent.focus(screen.getByLabelText("强化符文"));
    fireEvent.change(screen.getByLabelText("强化符文"), { target: { value: "百宝袋" } });
    fireEvent.click((await screen.findAllByRole("button", { name: /大百宝袋/ }))[0]);
    // 核心装备 now comes from the Set 18 item picker as well
    fireEvent.focus(screen.getByLabelText("核心装备"));
    fireEvent.change(screen.getByLabelText("核心装备"), { target: { value: "金铲铲冠冕" } });
    fireEvent.click(await screen.findByRole("button", { name: /金铲铲冠冕/ }));
    fireEvent.click(screen.getByRole("button", { name: "D牌" }));
    fireEvent.change(screen.getByLabelText("下一局训练重点"), {
      target: { value: "4-1 前不 D 超过 30 金" },
    });
    fireEvent.change(screen.getByLabelText("对局结束时间"), {
      target: { value: "2026-02-05T13:20" },
    });

    fireEvent.click(screen.getByRole("button", { name: /^保存$/ }));

    // Quick Add also seeds the review, one write behind the match itself
    await waitFor(async () => {
      const [saved] = await allMatches();
      expect(saved).toBeTruthy();
      expect((await getMatchBundle(saved.id))?.review?.nextGameFocus).toBe("4-1 前不 D 超过 30 金");
    });
    const [match] = await allMatches();
    expect(match.placement).toBe(3);
    expect(match.composition).toBe("Arcader");
    expect(match.augmentIds).toEqual(["DA_18_BigGrabBag"]);
    // the free-text field is still filled in, because detail pages read it
    expect(match.augments).toEqual(["大百宝袋"]);
    expect(match.coreItemIds).toEqual(["TFT_Item_ForceOfNature"]);
    expect(match.coreItems).toEqual(["金铲铲冠冕"]);
    expect(match.primaryMistake).toBe("ROLLING");
    expect(match.playedAt).toBe("2026-02-05T13:20");
    expect(match.reviewed).toBe(false);
  });

  it("sets the placement with the 1–8 keyboard shortcuts", async () => {
    renderDialog();
    fireEvent.keyDown(window, { key: "7" });
    fireEvent.click(screen.getByRole("button", { name: /^保存$/ }));
    await waitFor(async () => expect(await allMatches()).toHaveLength(1));
    const [match] = await allMatches();
    expect(match.placement).toBe(7);
  });

  it("keeps the date/time field and shows no training-window warning", () => {
    renderDialog();
    expect(screen.getByLabelText("对局结束时间")).toBeInTheDocument();
    expect(screen.queryByText(/训练时段/)).not.toBeInTheDocument();
    expect(screen.queryByText(/12:00/)).not.toBeInTheDocument();
  });

  it("saves at any time of day: 00:00 / 08:00 / 12:00 / 18:00 / 22:00 / 23:59", async () => {
    // The product has no fixed training window, so the hour must never change
    // whether a record is accepted. Every value is typed in, never `new Date()`.
    for (const playedAt of [
      "2026-02-05T00:00",
      "2026-02-05T08:00",
      "2026-02-05T12:00",
      "2026-02-05T18:00",
      "2026-02-05T22:00",
      "2026-02-05T23:59",
    ]) {
      const view = renderDialog();
      fireEvent.click(screen.getByRole("radio", { name: "第 1 名" }));
      fireEvent.change(screen.getByLabelText("对局结束时间"), { target: { value: playedAt } });

      expect(screen.queryByText(/训练时段/)).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /^保存$/ }));
      await waitFor(async () => expect(await allMatches()).toHaveLength(1));
      expect((await allMatches())[0].playedAt).toBe(playedAt);

      view.unmount();
      await resetDatabase();
    }
  });

  it("picks a composition from the selector and only counts it once the game is saved", async () => {
    renderDialog();
    fireEvent.click(screen.getByRole("radio", { name: "第 2 名" }));
    fireEvent.focus(screen.getByLabelText("阵容"));
    fireEvent.click(await screen.findByRole("button", { name: "法师" }));

    expect(screen.getByLabelText("阵容")).toHaveValue("法师");
    // choosing is a form edit: opening the selector and clicking must not
    // inflate usage on its own
    expect(await compositionUsageRepository.get("法师")).toBeUndefined();

    fireEvent.click(screen.getByRole("button", { name: /^保存$/ }));
    await waitFor(async () => expect(await allMatches()).toHaveLength(1));

    const [match] = await allMatches();
    expect(match.composition).toBe("法师");
    expect((await compositionUsageRepository.get("法师"))?.usageCount).toBe(1);
  });

  it("stays open for the next game when saving with 保存并再记一局", async () => {
    renderDialog();
    fireEvent.click(screen.getByRole("radio", { name: "第 4 名" }));
    fireEvent.change(screen.getByLabelText("阵容"), { target: { value: "Rebel" } });
    fireEvent.click(screen.getByRole("button", { name: "保存并再记一局" }));

    // the draft reset happens after every write of the record is through
    await waitFor(async () => {
      expect(await allMatches()).toHaveLength(1);
      expect(screen.getByRole("radio", { name: "第 4 名" })).toHaveAttribute("aria-checked", "false");
    });
    expect(screen.getByLabelText("阵容")).toHaveValue("Rebel");
  });

  it("closes only the selector panel on Escape and keeps the draft", async () => {
    // a real spy, not a no-op: a dismissal must be observable
    const onClose = vi.fn();
    renderDialog(onClose);
    fireEvent.click(screen.getByRole("radio", { name: "第 5 名" }));
    fireEvent.change(screen.getByLabelText("阵容"), { target: { value: "Arcader" } });

    // open a selector panel, then press Escape inside its input
    fireEvent.focus(screen.getByLabelText("强化符文"));
    await screen.findByText(/全部海克斯/);
    fireEvent.keyDown(screen.getByLabelText("强化符文"), { key: "Escape" });

    // the panel is gone...
    await waitFor(() => expect(screen.queryByText(/全部海克斯/)).not.toBeInTheDocument());
    // ...but the dialog survived, draft intact. One Esc used to dismiss both
    // and silently throw the whole record away.
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("阵容")).toHaveValue("Arcader");
    expect(screen.getByRole("radio", { name: "第 5 名" })).toHaveAttribute("aria-checked", "true");

    // and the draft is still savable
    fireEvent.click(screen.getByRole("button", { name: /^保存$/ }));
    await waitFor(async () => expect(await allMatches()).toHaveLength(1));
    expect((await allMatches())[0].composition).toBe("Arcader");
  });

  it("still closes the dialog on Escape when no selector panel is open", () => {
    const onClose = vi.fn();
    renderDialog(onClose);

    // focus a plain text field: no panel, so Esc belongs to the dialog
    fireEvent.keyDown(screen.getByLabelText("下一局训练重点"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("seeds the time from when the player clicks, not when the page loaded", () => {
    // The app has been sitting open since 09:00 (the dialog mounts with the
    // shell, hidden). At 10:27 the player finishes a game and clicks quick add.
    timeControl.now = "2026-02-05T09:00";
    const view = renderDialog(() => undefined, false);

    timeControl.now = "2026-02-05T10:27";
    rerenderDialog(view);
    expect(screen.getByLabelText("对局结束时间")).toHaveValue("2026-02-05T10:27");
  });

  it("re-seeds the time on every fresh open after a cancel", () => {
    timeControl.now = "2026-02-05T10:27";
    const onClose = vi.fn();
    const view = renderDialog(onClose);
    expect(screen.getByLabelText("对局结束时间")).toHaveValue("2026-02-05T10:27");

    rerenderDialog(view, onClose, false);
    timeControl.now = "2026-02-05T10:42";
    rerenderDialog(view, onClose);
    expect(screen.getByLabelText("对局结束时间")).toHaveValue("2026-02-05T10:42");
  });

  it("does not overwrite a manually edited time while the dialog is open", () => {
    timeControl.now = "2026-02-05T10:27";
    const view = renderDialog();

    fireEvent.change(screen.getByLabelText("对局结束时间"), {
      target: { value: "2026-02-05T10:15" },
    });

    // ordinary re-renders (state updates, parent re-render) must not reset it
    rerenderDialog(view, () => undefined);
    expect(screen.getByLabelText("对局结束时间")).toHaveValue("2026-02-05T10:15");
  });

  it("rolls the seeded time across midnight without a day offset", () => {
    timeControl.now = "2026-02-05T23:59";
    const view = renderDialog();
    expect(screen.getByLabelText("对局结束时间")).toHaveValue("2026-02-05T23:59");

    rerenderDialog(view, () => undefined, false);
    timeControl.now = "2026-02-06T00:03";
    rerenderDialog(view);
    expect(screen.getByLabelText("对局结束时间")).toHaveValue("2026-02-06T00:03");
  });
  it("saves an opening record without a placement, and the value stays undefined — not 0", async () => {
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "开局记录" }));

    fireEvent.change(screen.getByLabelText("开局事件（选填）"), {
      target: { value: "SET18_ENC_TWO_COST_START" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^保存$/ }));

    await waitFor(async () => expect(await allMatches()).toHaveLength(1));
    const [match] = await allMatches();
    expect(match.placement).toBeUndefined();
    expect(match.encounterId).toBe("SET18_ENC_TWO_COST_START");
    // 开局时刻这一刻是开始时间，不是结束时间
    expect(match.startedAt).toBe(match.playedAt);
    expect(match.endedAt).toBeUndefined();
  });

  it("never carries the encounter into 保存并再记一局 or 复制上一局", async () => {
    renderDialog();
    // settle one game with an encounter picked
    fireEvent.click(screen.getByRole("radio", { name: "第 5 名" }));
    fireEvent.change(screen.getByLabelText("开局事件（选填）"), {
      target: { value: "SET18_ENC_TWO_COST_START" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^保存并再记一局$/ }));

    await waitFor(async () => expect(await allMatches()).toHaveLength(1));
    expect(screen.getByLabelText("开局事件（选填）")).toHaveValue("");
    // the dialog stays open: the next save is game #2 and must not inherit it
    fireEvent.click(screen.getByRole("radio", { name: "第 2 名" }));
    fireEvent.click(screen.getByRole("button", { name: /^保存$/ }));
    await waitFor(async () => expect(await allMatches()).toHaveLength(2));
    // table order is by primary key (a random uuid), so find the second game
    const second = (await allMatches()).find((m) => m.placement === 2);
    expect(second?.encounterId).toBeUndefined();

    // 复制上一局 copies comp/augments/items — never the rolled encounter
    fireEvent.click(screen.getByRole("button", { name: "复制上一局" }));
    expect(screen.getByLabelText("开局事件（选填）")).toHaveValue("");
  });
});
