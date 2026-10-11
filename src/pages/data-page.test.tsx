import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { DataPage } from "./DataPage";
import { renderWithProviders } from "../test/render";
import { resetDatabase } from "../test/db-helper";

beforeEach(resetDatabase);

const renderPage = () => renderWithProviders(<DataPage />, "/data");

describe("Data page", () => {
  it("finishes loading without a hook-order crash (regression: state after early return)", async () => {
    renderPage();
    // first render shows the storage spinner; when the live query resolves the
    // component re-renders — a hook-count change used to throw React #310 here
    const exportBtn = await screen.findByRole("button", { name: /Export JSON/ });
    expect(exportBtn).toBeInTheDocument();
  });

  it("offers the copy-backup escape hatch and states the real merge semantics", async () => {
    renderPage();
    const copy = await screen.findByRole("button", { name: /复制备份/ });
    expect(copy).toBeDisabled(); // empty database
    expect(
      await screen.findByText(/同 id 记录以文件内容覆盖/),
    ).toBeInTheDocument();
  });
});
