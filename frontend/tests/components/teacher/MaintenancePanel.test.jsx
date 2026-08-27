import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MaintenancePanel from "../../../src/components/teacher/MaintenancePanel.jsx";

function renderPanel(props = {}) {
  return render(
    <MaintenancePanel
      onExportBackup={vi.fn()}
      onRestoreBackup={vi.fn()}
      onEraseHistory={vi.fn()}
      busy={false}
      {...props}
    />,
  );
}

describe("MaintenancePanel", () => {
  let confirmSpy;

  beforeEach(() => {
    confirmSpy = vi.spyOn(window, "confirm");
  });

  afterEach(() => {
    confirmSpy.mockRestore();
  });

  it("downloads the backup as a JSON blob when 'Baixar backup' is clicked", async () => {
    const user = userEvent.setup();
    const backup = { version: 1, exportedAt: "2026-01-01", data: { teacher: [] } };
    const onExportBackup = vi.fn().mockResolvedValue(backup);
    const createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    renderPanel({ onExportBackup });
    await user.click(screen.getByRole("button", { name: "Baixar backup" }));

    expect(onExportBackup).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0];
    expect(blob.type).toBe("application/json;charset=utf-8;");
    const text = await blob.text();
    expect(JSON.parse(text)).toEqual(backup);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
    expect(await screen.findByText("Backup baixado.")).toBeInTheDocument();
  });

  it("does not download anything when the export itself fails (onExportBackup resolves null)", async () => {
    const user = userEvent.setup();
    const onExportBackup = vi.fn().mockResolvedValue(null);
    const createObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL: vi.fn() });

    renderPanel({ onExportBackup });
    await user.click(screen.getByRole("button", { name: "Baixar backup" }));

    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("asks for confirmation before erasing history, and does nothing if declined", async () => {
    const user = userEvent.setup();
    confirmSpy.mockReturnValue(false);
    const onEraseHistory = vi.fn();

    renderPanel({ onEraseHistory });
    await user.click(screen.getByRole("button", { name: "Apagar todo o histórico de partidas" }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(onEraseHistory).not.toHaveBeenCalled();
  });

  it("erases history and shows a summary when confirmed", async () => {
    const user = userEvent.setup();
    confirmSpy.mockReturnValue(true);
    const onEraseHistory = vi.fn().mockResolvedValue({ gamesDeleted: 3, telemetryEventsDeleted: 40 });

    renderPanel({ onEraseHistory });
    await user.click(screen.getByRole("button", { name: "Apagar todo o histórico de partidas" }));

    expect(onEraseHistory).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Histórico apagado: 3 partida(s) removida(s).")).toBeInTheDocument();
  });

  it("restoring a backup: choosing a file asks for confirmation naming the file", async () => {
    const user = userEvent.setup();
    confirmSpy.mockReturnValue(false);
    const onRestoreBackup = vi.fn();

    renderPanel({ onRestoreBackup });
    const file = new File(['{"version":1,"data":{}}'], "meu-backup.json", { type: "application/json" });
    const input = screen.getByLabelText("Selecionar arquivo de backup para restaurar");
    await user.upload(input, file);

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining("meu-backup.json"));
    expect(onRestoreBackup).not.toHaveBeenCalled();
  });

  it("restores a backup end-to-end when confirmed, parsing the file as JSON", async () => {
    const user = userEvent.setup();
    confirmSpy.mockReturnValue(true);
    const onRestoreBackup = vi.fn().mockResolvedValue(true);

    renderPanel({ onRestoreBackup });
    const backup = { version: 1, data: { teacher: [{ id: 1 }] } };
    const file = new File([JSON.stringify(backup)], "backup.json", { type: "application/json" });
    const input = screen.getByLabelText("Selecionar arquivo de backup para restaurar");
    await user.upload(input, file);

    expect(onRestoreBackup).toHaveBeenCalledWith(backup);
    expect(await screen.findByText("Backup restaurado. Recarregando…")).toBeInTheDocument();
  });

  it("shows an error and never calls onRestoreBackup when the file isn't valid JSON", async () => {
    const user = userEvent.setup();
    confirmSpy.mockReturnValue(true);
    const onRestoreBackup = vi.fn();

    renderPanel({ onRestoreBackup });
    const file = new File(["not json at all"], "backup.json", { type: "application/json" });
    const input = screen.getByLabelText("Selecionar arquivo de backup para restaurar");
    await user.upload(input, file);

    expect(onRestoreBackup).not.toHaveBeenCalled();
    expect(
      await screen.findByText("Arquivo inválido: não é um JSON de backup reconhecível."),
    ).toBeInTheDocument();
  });

  it("disables every action button while busy", () => {
    renderPanel({ busy: true });
    expect(screen.getByRole("button", { name: "Baixar backup" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Restaurar backup…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Apagar todo o histórico de partidas" })).toBeDisabled();
  });
});
