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

function stepStateFor(status) {
  if (!status || status === "FINISHED") return "theme";
  if (status === "CREATED") return "letter";
  if (status === "READY") return "start";
  if (status === "STARTING" || status === "PLAYING") return "play";
  if (status === "STOPPED" || status === "CORRECTION") return "correct";
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
  disabled,
}) {
  const [categorySetId, setCategorySetId] = useState("");
  const [duration, setDuration] = useState(120);

  useEffect(() => {
    if (!categorySetId && categorySets.length > 0) setCategorySetId(String(categorySets[0].id));
  }, [categorySets, categorySetId]);

  const status = round?.status;
  const currentIndex = STEPS.findIndex((step) => step.key === stepStateFor(status));
  const payload = () => ({
    categorySetId: Number(categorySetId),
    durationSeconds: Number(duration),
  });

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

  const usedLettersStrip =
    (usedLetters ?? []).filter(Boolean).length > 0 ? (
      <div className="letters-strip">
        <span className="small muted">Letras já usadas nesta partida:</span>
        <div className="letters">
          {usedLetters
            .filter(Boolean)
            .map((letter, index, list) => (
              <span
                key={`${letter}-${index}`}
                className={`letters__item${
                  letter === round?.letter && index === list.length - 1
                    ? " letters__item--current"
                    : ""
                }`}
              >
                {letter}
              </span>
            ))}
        </div>
      </div>
    ) : null;

  // ------------------------------------------------------------------
  // Uma fase, um painel. Nunca dois ao mesmo tempo.
  // ------------------------------------------------------------------
  let phase;

  if (!status || status === "FINISHED") {
    phase = (
      <div className="phase phase--theme">
        <p className="phase__hint">Escolha o tema e o tempo da rodada para começar.</p>
        {themeField}
        {durationField}
        <button
          type="button"
          className="btn btn--primary btn--block phase__action"
          disabled={busy || disabled || !categorySetId}
          onClick={() => onCreateRound(payload())}
        >
          Criar rodada
        </button>
      </div>
    );
  } else if (status === "CREATED") {
    phase = (
      <div className="phase phase--letter">
        <p className="phase__hint">
          Rodada {round.roundNumber} · <strong>{round.themeName}</strong>
        </p>
        {/*
          O sorteio em si (animacao, letra girando) e o momento de show —
          acontece so na tela publica. Aqui o professor so dispara a acao.
        */}
        <button
          type="button"
          className="btn btn--warning btn--block phase__action"
          disabled={busy}
          onClick={onDrawLetter}
        >
          Sortear letra
        </button>
        <CancelLink onCancel={onCancel} disabled={busy} />
      </div>
    );
  } else if (status === "READY") {
    phase = (
      <div className="phase phase--ready">
        <p className="phase__hint">
          Letra sorteada para <strong>{round.themeName}</strong> — veja a revelação na tela
          pública. Os alunos ainda não veem as categorias.
        </p>
        <button
          type="button"
          className="btn btn--success btn--block phase__action"
          disabled={busy}
          onClick={onStart}
        >
          Iniciar rodada
        </button>
        <button type="button" className="btn btn--ghost btn--block" disabled={busy} onClick={onDrawLetter}>
          Sortear outra letra
        </button>
        <CancelLink onCancel={onCancel} disabled={busy} />
      </div>
    );
  } else if (status === "STARTING" || status === "PLAYING") {
    phase = (
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
  } else if (status === "STOPPED" || status === "CORRECTION") {
    phase = (
      <div className="phase phase--correction">
        <p className="phase__hint">
          A rodada foi encerrada. Corrija as respostas na aba <strong>Correção</strong>.
        </p>
        <button
          type="button"
          className="btn btn--primary btn--block phase__action"
          onClick={onGoToCorrection}
        >
          Abrir correção →
        </button>
        {status === "CORRECTION" ? (
          <button type="button" className="btn btn--success btn--block" disabled={busy} onClick={onScore}>
            Pontuar rodada agora
          </button>
        ) : null}
        <CancelLink onCancel={onCancel} disabled={busy} />
      </div>
    );
  } else if (status === "SCORED") {
    phase = (
      <div className="phase phase--next">
        <p className="phase__hint">
          Pontuação de <strong>{round.themeName}</strong> divulgada. Escolha o próximo tema.
        </p>
        {themeField}
        {durationField}
        <button
          type="button"
          className="btn btn--primary btn--block phase__action phase__action--huge"
          disabled={busy || !categorySetId}
          onClick={() => onNextRound(payload())}
        >
          PRÓXIMA RODADA →
        </button>
      </div>
    );
  }

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

      <div className="flow" aria-label="Fluxo da rodada">
        {STEPS.map((step, index) => (
          <span
            key={step.key}
            className={`flow__step${
              index < currentIndex ? " flow__step--done" : ""
            }${index === currentIndex ? " flow__step--current" : ""}`}
          >
            {step.label}
          </span>
        ))}
      </div>

      {phase}
      {usedLettersStrip}
    </section>
  );
}

export default RoundControl;
