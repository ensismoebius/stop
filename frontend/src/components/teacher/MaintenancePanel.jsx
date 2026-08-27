import { useRef, useState } from "react";
import Alert from "../common/Alert.jsx";

/** Baixa `backup` como arquivo JSON — mesmo padrão de download do CSV em ReportsPanel. */
function downloadBackupJson(backup) {
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: "application/json;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `stop-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Zona de risco do painel de configuração: apagar todo o histórico de
 * partidas, ou baixar/restaurar um backup completo do banco (config +
 * histórico). Cada ação pede sua própria confirmação com `window.confirm`
 * — mesmo padrão já usado em "Remover turma"/"Remover aluno" —, mas a
 * restauração é, de longe, a ação mais destrutiva do app inteiro (troca
 * até as contas de professor), então o texto da confirmação é explícito
 * sobre isso em vez de reusar uma mensagem genérica.
 */
export function MaintenancePanel({ onExportBackup, onRestoreBackup, onEraseHistory, busy }) {
  const fileInputRef = useRef(null);
  const [status, setStatus] = useState(null);

  const handleExport = async () => {
    setStatus(null);
    const backup = await onExportBackup();
    if (!backup) return;
    downloadBackupJson(backup);
    setStatus({ kind: "success", text: "Backup baixado." });
  };

  const handleEraseHistory = async () => {
    setStatus(null);
    if (
      !window.confirm(
        "Apagar TODO o histórico de partidas? Isso remove para sempre todas as partidas, rodadas, respostas, correções e rankings — turmas, alunos e conjuntos de categoria não são afetados. Não pode ser desfeito.",
      )
    ) {
      return;
    }
    const result = await onEraseHistory();
    if (result) setStatus({ kind: "success", text: `Histórico apagado: ${result.gamesDeleted} partida(s) removida(s).` });
  };

  const handleFileChosen = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setStatus(null);
    if (
      !window.confirm(
        `Restaurar o backup "${file.name}"? Isso APAGA TUDO que existe agora — turmas, alunos, conjuntos de categoria, contas de professor e todo o histórico — e substitui pelo conteúdo do arquivo. Não pode ser desfeito.`,
      )
    ) {
      return;
    }
    let backup;
    try {
      backup = JSON.parse(await file.text());
    } catch {
      setStatus({ kind: "error", text: "Arquivo inválido: não é um JSON de backup reconhecível." });
      return;
    }
    const ok = await onRestoreBackup(backup);
    if (ok) setStatus({ kind: "success", text: "Backup restaurado. Recarregando…" });
  };

  return (
    <section className="card stack">
      <h2>Manutenção</h2>
      <p className="muted small">
        Backup completo do banco (configuração e histórico) e opções para apagar dados. As ações
        abaixo não podem ser desfeitas — use com cuidado.
      </p>

      <Alert kind={status?.kind ?? "success"}>{status?.text}</Alert>

      <div className="row">
        <button type="button" className="btn btn--ghost" disabled={busy} onClick={handleExport}>
          Baixar backup
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
        >
          Restaurar backup…
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="sr-only"
          aria-label="Selecionar arquivo de backup para restaurar"
          onChange={handleFileChosen}
        />
      </div>

      <div className="row">
        <button type="button" className="btn btn--danger" disabled={busy} onClick={handleEraseHistory}>
          Apagar todo o histórico de partidas
        </button>
      </div>
    </section>
  );
}

export default MaintenancePanel;
