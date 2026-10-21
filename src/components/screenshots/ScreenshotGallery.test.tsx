import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScreenshotGallery } from "./ScreenshotGallery";
import { addMatch } from "../../services/match-service";
import { listScreenshots, saveScreenshots } from "../../services/screenshot-service";
import { resetDatabase } from "../../test/db-helper";
import { renderWithProviders } from "../../test/render";

/**
 * The gallery is where a screenshot becomes something the player can look at,
 * so these cases walk the whole loop a real session would: pick a file, see the
 * thumbnail, open it, delete it with confirmation.
 */

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function pngFile(name = "结算.png"): File {
  return new File([new Uint8Array(PNG_HEADER)], name, { type: "image/png" });
}

async function newMatch() {
  return addMatch({ playedAt: "2026-10-15T20:30", placement: "3" });
}

function renderGallery(matchId: string) {
  return renderWithProviders(
    <ScreenshotGallery
      matchId={matchId}
      upload
      acceptPaste
      emptyTitle="还没有保存结算截图"
      emptyHint="把结算界面的图片存进来"
    />,
  );
}

async function upload(files: File[]) {
  const input = screen.getByLabelText("选择结算截图") as HTMLInputElement;
  fireEvent.change(input, { target: { files, value: "" } });
}

beforeEach(resetDatabase);

describe("ScreenshotGallery", () => {
  it("shows the empty state before anything is saved", async () => {
    const m = await newMatch();
    renderGallery(m.id);

    expect(await screen.findByText("还没有保存结算截图")).toBeInTheDocument();
    expect(screen.getByText("把结算界面的图片存进来")).toBeInTheDocument();
  });

  it("uploads a file and shows it as a thumbnail", async () => {
    const m = await newMatch();
    renderGallery(m.id);
    expect(await screen.findByText("还没有保存结算截图")).toBeInTheDocument();

    await upload([pngFile()]);

    expect(await screen.findByTitle(/结算\.png/)).toBeInTheDocument();
    expect(await listScreenshots(m.id)).toHaveLength(1);
    expect(screen.queryByText("还没有保存结算截图")).not.toBeInTheDocument();
  });

  it("reports a rejected file without losing the good one", async () => {
    const m = await newMatch();
    renderGallery(m.id);
    expect(await screen.findByText("还没有保存结算截图")).toBeInTheDocument();

    const notAnImage = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "bad.png", {
      type: "image/png",
    });
    await upload([pngFile("good.png"), notAnImage]);

    expect(await screen.findByTitle(/good\.png/)).toBeInTheDocument();
    expect(await screen.findByText(/不是支持的图片/)).toBeInTheDocument();
    expect(screen.queryByTitle(/bad\.png/)).not.toBeInTheDocument();
    expect(await listScreenshots(m.id)).toHaveLength(1);
  });

  it("opens a large preview with the file metadata", async () => {
    const m = await newMatch();
    await saveScreenshots(m.id, [
      { name: "结算.png", type: "image/png", size: 4096, blob: pngFile() },
    ]);
    renderGallery(m.id);

    fireEvent.click(await screen.findByTitle(/结算\.png/));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAccessibleName("结算.png");
    expect(dialog.textContent).toContain("4 KB");
    expect(screen.getByText("保存时间")).toBeInTheDocument();
    // The preview image arrives once its bytes have been read out of IndexedDB.
    await waitFor(() => expect(within(dialog).getByAltText("结算.png")).toBeInTheDocument());
  });

  it("deletes only after confirmation, and the confirmation can be dismissed", async () => {
    const m = await newMatch();
    await saveScreenshots(m.id, [
      { name: "结算.png", type: "image/png", size: 8, blob: pngFile() },
    ]);
    renderGallery(m.id);
    fireEvent.click(await screen.findByTitle(/结算\.png/));

    fireEvent.click(await screen.findByRole("button", { name: /删除/ }));
    fireEvent.click(await screen.findByRole("button", { name: "取消" }));
    expect(await listScreenshots(m.id)).toHaveLength(1);

    fireEvent.click(await screen.findByRole("button", { name: /删除/ }));
    fireEvent.click(await screen.findByRole("button", { name: "确认删除" }));

    await waitFor(() => expect(screen.queryByTitle(/结算\.png/)).not.toBeInTheDocument());
    expect(await listScreenshots(m.id)).toEqual([]);
  });

  it("closes the preview", async () => {
    const m = await newMatch();
    await saveScreenshots(m.id, [{ name: "a.png", type: "image/png", size: 8, blob: pngFile() }]);
    renderGallery(m.id);
    fireEvent.click(await screen.findByTitle(/a\.png/));

    // Two controls answer to "关闭": the header X and the footer button.
    const close = screen.getAllByRole("button", { name: "关闭" }).find((b) => b.textContent === "关闭");
    fireEvent.click(close!);

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByTitle(/a\.png/)).toBeInTheDocument();
  });

  it("revokes every object URL it created when it unmounts", async () => {
    const created: string[] = [];
    const revoked: string[] = [];
    const createSpy = vi
      .spyOn(URL, "createObjectURL")
      .mockImplementation((obj: Blob | MediaSource) => {
        const url = `blob:test/${created.length}`;
        created.push(url);
        void obj;
        return url;
      });
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation((url: string) => {
      revoked.push(url);
    });

    try {
      const m = await newMatch();
      await saveScreenshots(m.id, [
        { name: "a.png", type: "image/png", size: 8, blob: pngFile() },
        { name: "b.png", type: "image/png", size: 8, blob: pngFile("b.png") },
      ]);
      const view = renderGallery(m.id);

      await screen.findByAltText("a.png");
      await screen.findByAltText("b.png");
      // One URL per thumbnail, plus another once the preview opens.
      fireEvent.click(screen.getByTitle(/a\.png/));
      await screen.findByRole("dialog");
      await waitFor(() => expect(created.length).toBeGreaterThanOrEqual(3));
      const whileOpen = created.length;

      view.unmount();
      expect(revoked.sort()).toEqual(created.slice(0, whileOpen).sort());
    } finally {
      createSpy.mockRestore();
      revokeSpy.mockRestore();
    }
  });

  it("accepts an image pasted from the clipboard", async () => {
    const m = await newMatch();
    renderGallery(m.id);
    expect(await screen.findByText("还没有保存结算截图")).toBeInTheDocument();

    const data = { files: [pngFile("paste.png")] } as unknown as DataTransfer;
    fireEvent.paste(window, { clipboardData: data });

    expect(await screen.findByTitle(/paste\.png/)).toBeInTheDocument();
    expect(await listScreenshots(m.id)).toHaveLength(1);
  });

  it("ignores a paste aimed at a text field", async () => {
    const m = await newMatch();
    renderGallery(m.id);
    expect(await screen.findByText("还没有保存结算截图")).toBeInTheDocument();

    const input = document.createElement("input");
    document.body.append(input);
    const data = { files: [pngFile("ignored.png")] } as unknown as DataTransfer;
    fireEvent.paste(input, { clipboardData: data });

    expect(await listScreenshots(m.id)).toEqual([]);
    input.remove();
  });
});
