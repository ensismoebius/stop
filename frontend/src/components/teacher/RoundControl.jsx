import { useEffect, useState } from "react";
import Field from "../common/Field.jsx";
import { formatClock } from "../../hooks/useServerClock.js";

const STEPS = [
  { key: "theme", label: "Tema" },
  { key: "letter", label: "Letra" },
  { key: "start", label: "Iniciar" },
  { key: "play", label: "Acompanhar" },
  { key: "correct", label: "Corrigir" },
  { key: "score", label: "Pontuar" },
  { key: "next", label: "Próxima" },
];

/** Mapeia o status da rodada para a etapa correspondente do fluxo. */
function stepStateFor(status) {
  if (!status || status === "FINISHED") return "theme";
  if (status === "CREATED") return "letter";
  if (status === "READY") return "start";
  if (status === "STARTING" || status === "PLAYING") return "play";
  if (["STOPPED", "COLLABORATIVE_CORRECTION", "CORRECTION"].includes(status)) return "correct";
  if (status === "SCORED") return "next";
  return "theme";
}

/** Botao discreto de cancelamento, disponivel em qualquer fase com rodada ativa. */
function CancelLink({ onCancel, disabled }) {
  return (
    <button
      type="button"
      className="phase__cancel"
      disabled={disabled}
      onClick={() => {
        if (window.confirm("Cancelar a rodada atual? Ela não será pontuada.")) onCancel();
      }}
    >
      ✕ cancelar esta rodada
    </button>
  );
}

/**
 * Escolher tema + duração e confirmar — usado tanto para criar a primeira
 * rodada (`ThemePhase`) quanto para escolher a próxima depois de pontuar
 * (`ScoredPhase`, mesma forma de UI, só hint/rótulo/handler mudam).
 */
function ChooseThemePhase({
  className,
  hint,
  themeField,
  durationField,
  letterRuleField,
  busy,
  disabled,
  categorySetId,
  buttonLabel,
  huge,
  onSubmit,
}) {
  return (
    <div className={`phase ${className}`}>
      <p className="phase__hint">{hint}</p>
      {themeField}
      {durationField}
      {letterRuleField}
      <button
        type="button"
        className={`btn btn--primary btn--block phase__action${huge ? " phase__action--huge" : ""}`}
        disabled={busy || disabled || !categorySetId}
        onClick={onSubmit}
      >
        {buttonLabel}
      </button>
    </div>
  );
}

/** Fase de sorteio da letra da rodada. */
function LetterPhase({ round, busy, onDrawLetter, onCancel }) {
  return (
    <div className="phase phase--letter">
      <p className="phase__hint">
        Rodada {round.roundNumber} · <strong>{round.themeName}</strong>
      </p>
      {/*
        O sorteio em si (animacao, letra girando) e o momento de show —
        acontece so na tela publica. Aqui o professor so dispara a acao.
      */}
      <button type="button" className="btn btn--warning btn--block phase__action" disabled={busy} onClick={onDrawLetter}>
        Sortear letra
      </button>
      <CancelLink onCancel={onCancel} disabled={busy} />
    </div>
  );
}

/** Fase de prontidao: mostra a letra sorteada e inicia a rodada. */
function ReadyPhase({ round, busy, onStart, onDrawLetter, onCancel }) {
  return (
    <div className="phase phase--ready">
      <p className="phase__hint">
        Letra sorteada para <strong>{round.themeName}</strong> — veja a revelação na tela pública. Os
        alunos ainda não veem as categorias.
      </p>
      <button type="button" className="btn btn--success btn--block phase__action" disabled={busy} onClick={onStart}>
        Iniciar rodada
      </button>
      <button type="button" className="btn btn--ghost btn--block" disabled={busy} onClick={onDrawLetter}>
        Sortear outra letra
      </button>
      <CancelLink onCancel={onCancel} disabled={busy} />
    </div>
  );
}

/** Fase de sincronizacao antes do inicio da rodada. */
function StartingPhase({ round, busy, onCancel }) {
  return (
    <div className="phase phase--starting">
      <p className="phase__hint">
        <strong>{round.themeName}</strong> — sincronizando o início com os dispositivos dos alunos. A
        letra ainda está oculta para eles; o cronômetro começa em instantes.
      </p>
      <CancelLink onCancel={onCancel} disabled={busy} />
    </div>
  );
}

/** Fase de jogo em andamento com cronometro e botao de encerrar. */
function PlayingPhase({ round, seconds, busy, onStop, onCancel }) {
  return (
    <div className="phase phase--playing">
      <div className="phase__live">
        <span className="phase__clock">{formatClock(seconds)}</span>
        <span className="phase__letter phase__letter--inline">{round.letter}</span>
      </div>
      <p className="phase__hint">
        <strong>{round.themeName}</strong> em andamento — acompanhe os alunos ao lado.
      </p>
      <button
        type="button"
        className="btn btn--danger btn--block phase__action phase__action--huge"
        disabled={busy}
        onClick={onStop}
      >
        ⏹ ENCERRAR RODADA
      </button>
      <CancelLink onCancel={onCancel} disabled={busy} />
    </div>
  );
}

/** Fase de correcao colaborativa, com progresso das avaliacoes. */
function CollaborativeCorrectionPhase({ collabProgress, busy, onFinishCollaborativeCorrection, onCancel }) {
  const done = collabProgress?.completedAssignments ?? 0;
  const total = collabProgress?.totalAssignments ?? 0;
  return (
    <div className="phase phase--correction">
      <p className="phase__hint">
        Os alunos estão corrigindo as respostas dos colegas antes da correção oficial.
      </p>
      <div className="phase__live">
        <span className="phase__clock">
          {done} / {total}
        </span>
        <span className="small muted">avaliações concluídas</span>
      </div>
      <button
        type="button"
        className="btn btn--primary btn--block phase__action"
        disabled={busy}
        onClick={onFinishCollaborativeCorrection}
      >
        Finalizar correção colaborativa agora →
      </button>
      <CancelLink onCancel={onCancel} disabled={busy} />
    </div>
  );
}

/** Fase de correcao, encaminhando para a aba de correcao ou pontuacao. */
function CorrectionPhase({ busy, onGoToCorrection, onScore, onCancel }) {
  return (
    <div className="phase phase--correction">
      <p className="phase__hint">
        Corrija as respostas na aba <strong>Correção</strong>.
      </p>
      <button type="button" className="btn btn--primary btn--block phase__action" onClick={onGoToCorrection}>
        Abrir correção →
      </button>
      <button type="button" className="btn btn--success btn--block" disabled={busy} onClick={onScore}>
        Pontuar rodada agora
      </button>
      <CancelLink onCancel={onCancel} disabled={busy} />
    </div>
  );
}

/**
 * Escolhe qual painel de fase renderizar (spec 41) — uma fase, um painel,
 * nunca dois ao mesmo tempo, para o professor nunca precisar procurar o
 * comando certo em meio a campos que não servem para o momento.
 */
function renderPhase(status, props) {
  const { round, themeField, durationField, letterRuleField, busy, disabled, categorySetId, seconds, collabProgress } =
    props;
  const { onCreateRound, onDrawLetter, onStart, onStop, onCancel, onScore, onNextRound } = props;
  const { onGoToCorrection, onFinishCollaborativeCorrection } = props;

  if (!status || status === "FINISHED") {
    return (
      <ChooseThemePhase
        className="phase--theme"
        hint="Escolha o tema e o tempo da rodada para começar."
        themeField={themeField}
        durationField={durationField}
        letterRuleField={letterRuleField}
        busy={busy}
        disabled={disabled}
        categorySetId={categorySetId}
        buttonLabel="Criar rodada"
        onSubmit={onCreateRound}
      />
    );
  }
  if (status === "CREATED") {
    return <LetterPhase round={round} busy={busy} onDrawLetter={onDrawLetter} onCancel={onCancel} />;
  }
  if (status === "READY") {
    return (
      <ReadyPhase round={round} busy={busy} onStart={onStart} onDrawLetter={onDrawLetter} onCancel={onCancel} />
    );
  }
  if (status === "STARTING") {
    return <StartingPhase round={round} busy={busy} onCancel={onCancel} />;
  }
  if (status === "PLAYING") {
    return <PlayingPhase round={round} seconds={seconds} busy={busy} onStop={onStop} onCancel={onCancel} />;
  }
  if (status === "STOPPED") {
    return (
      <div className="phase phase--correction">
        <p className="phase__hint">A rodada foi encerrada. Preparando a correção colaborativa…</p>
      </div>
    );
  }
  if (status === "COLLABORATIVE_CORRECTION") {
    return (
      <CollaborativeCorrectionPhase
        collabProgress={collabProgress}
        busy={busy}
        onFinishCollaborativeCorrection={onFinishCollaborativeCorrection}
        onCancel={onCancel}
      />
    );
  }
  if (status === "CORRECTION") {
    return <CorrectionPhase busy={busy} onGoToCorrection={onGoToCorrection} onScore={onScore} onCancel={onCancel} />;
  }
  if (status === "SCORED") {
    return (
      <ChooseThemePhase
        className="phase--next"
        hint={
          <>
            Pontuação de <strong>{round.themeName}</strong> divulgada. Escolha o próximo tema.
          </>
        }
        themeField={themeField}
        durationField={durationField}
        letterRuleField={letterRuleField}
        busy={busy}
        categorySetId={categorySetId}
        buttonLabel="PRÓXIMA RODADA →"
        huge
        onSubmit={onNextRound}
      />
    );
  }
  return null;
}

/** Barra visual com as etapas do fluxo da rodada. */
function RoundFlowSteps({ currentIndex }) {
  return (
    <div className="flow" aria-label="Fluxo da rodada">
      {STEPS.map((step, index) => (
        <span
          key={step.key}
          className={`flow__step${index < currentIndex ? " flow__step--done" : ""}${
            index === currentIndex ? " flow__step--current" : ""
          }`}
        >
          {step.label}
        </span>
      ))}
    </div>
  );
}

/** Campos de tema/duração compartilhados por `ThemePhase` e `ScoredPhase`, mais o payload pronto para enviar. */
function useRoundFormFields(categorySets, disabled) {
  const [categorySetId, setCategorySetId] = useState("");
  const [duration, setDuration] = useState(120);
  const [letterRule, setLetterRule] = useState("STARTS_WITH");

  useEffect(() => {
    if (!categorySetId && categorySets.length > 0) setCategorySetId(String(categorySets[0].id));
  }, [categorySets, categorySetId]);

  const payload = () => ({ categorySetId: Number(categorySetId), durationSeconds: Number(duration), letterRule });

  const themeField = (
    <Field id="category-set" label="Tema / conjunto de categorias">
      <select
        id="category-set"
        className="input"
        value={categorySetId}
        onChange={(event) => setCategorySetId(event.target.value)}
        disabled={disabled}
      >
        {categorySets.map((set) => (
          <option key={set.id} value={set.id}>
            {set.name} ({set.categories?.length ?? 0} categorias)
          </option>
        ))}
      </select>
    </Field>
  );

  const durationField = (
    <Field id="duration" label="Duração (segundos)">
      <input
        id="duration"
        className="input"
        type="number"
        min={15}
        max={900}
        value={duration}
        onChange={(event) => setDuration(event.target.value)}
        disabled={disabled}
      />
    </Field>
  );

  const letterRuleField = (
    <Field id="letter-rule" label="Regra da letra">
      <select
        id="letter-rule"
        className="input"
        value={letterRule}
        onChange={(event) => setLetterRule(event.target.value)}
        disabled={disabled}
      >
        <option value="STARTS_WITH">Começar com a letra</option>
        <option value="CONTAINS">Conter a letra</option>
      </select>
    </Field>
  );

  return { categorySetId, themeField, durationField, letterRuleField, payload };
}

/** Faixa com as letras ja usadas na partida, destacando a atual. */
function UsedLettersStrip({ usedLetters, currentLetter }) {
  const letters = (usedLetters ?? []).filter(Boolean);
  if (letters.length === 0) return null;

  return (
    <div className="letters-strip">
      <span className="small muted">Letras já usadas nesta partida:</span>
      <div className="letters">
        {letters.map((letter, index, list) => (
          <span
            key={`${letter}-${index}`}
            className={`letters__item${
              letter === currentLetter && index === list.length - 1 ? " letters__item--current" : ""
            }`}
          >
            {letter}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Controle da rodada (spec 41).
 *
 * Cada fase da máquina de estados exibe **apenas** o painel daquela fase —
 * nada de campos ou botões de outras etapas na tela ao mesmo tempo. Isso
 * evita que o professor precise procurar o comando certo em meio a campos
 * que não servem para o momento.
 */
export function RoundControl({
  round,
  categorySets,
  usedLetters,
  seconds,
  busy,
  onCreateRound,
  onDrawLetter,
  onStart,
  onStop,
  onCancel,
  onScore,
  onNextRound,
  onGoToCorrection,
  collabProgress,
  onFinishCollaborativeCorrection,
  disabled,
}) {
  const status = round?.status;
  const currentIndex = STEPS.findIndex((step) => step.key === stepStateFor(status));
  const { categorySetId, themeField, durationField, letterRuleField, payload } = useRoundFormFields(
    categorySets,
    disabled,
  );

  return (
    <section className="card stack">
      <div className="spread">
        <h2>Rodada</h2>
        {round && status !== "FINISHED" ? (
          <span className="badge badge--submitted">
            Rodada {round.roundNumber} · {status}
          </span>
        ) : (
          <span className="badge badge--waiting">nenhuma rodada</span>
        )}
      </div>

      <RoundFlowSteps currentIndex={currentIndex} />

      {renderPhase(status, {
        round,
        themeField,
        durationField,
        letterRuleField,
        busy,
        disabled,
        categorySetId,
        seconds,
        collabProgress,
        onCreateRound: () => onCreateRound(payload()),
        onDrawLetter,
        onStart,
        onStop,
        onCancel,
        onScore,
        onNextRound: () => onNextRound(payload()),
        onGoToCorrection,
        onFinishCollaborativeCorrection,
      })}
      <UsedLettersStrip usedLetters={usedLetters} currentLetter={round?.letter} />
    </section>
  );
}

export default RoundControl;
