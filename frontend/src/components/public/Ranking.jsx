import { useEffect, useRef, useState } from "react";
import Avatar from "../common/Avatar.jsx";

/* -----------------------------------------------------------------------
   Ranking de rodada (o de sempre)
   -----------------------------------------------------------------------
   Entre rodadas o placar aparece como lista, revelada do último colocado
   para o primeiro. A cerimônia de pódio é reservada para o fim da partida:
   usá-la a cada rodada gastaria o efeito e alongaria demais a aula.
   -------------------------------------------------------------------- */

const REVEAL_INTERVAL_MS = 1100;
const FIRST_REVEAL_DELAY_MS = 700;

/** Suspense antes de cada colocação, e tempo que ela fica sozinha em cena. */
const TEASE_MS = 1700;
const LAND_MS = 2100;
/** O 1º lugar respira mais tempo antes do resto da turma entrar. */
const WINNER_LAND_MS = 3200;
const COUNT_DURATION_MS = 900;

const MEDAL_BY_POSITION = { 1: "🥇", 2: "🥈", 3: "🥉" };
const PLACE_LABEL = { 1: "1º LUGAR", 2: "2º LUGAR", 3: "3º LUGAR" };

/**
 * Roteiro do pódio, do bronze ao ouro: cada colocação primeiro é anunciada
 * (suspense) e só depois revelada. O 1º lugar fecha com fogos, e a turma
 * inteira aparece no rodapé no final.
 */
const SCRIPT = [
  { kind: "tease", place: 3 },
  { kind: "reveal", place: 3 },
  { kind: "tease", place: 2 },
  { kind: "reveal", place: 2 },
  { kind: "tease", place: 1 },
  { kind: "reveal", place: 1 },
  { kind: "others" },
];

/** Pontuação subindo do zero — o número "corre" até o total real. */
function useCountUp(target, active) {
  const [value, setValue] = useState(0);
  const frameRef = useRef(null);

  useEffect(() => {
    if (!active) return undefined;
    const start = performance.now();
    const tick = (now) => {
      const progress = Math.min(1, (now - start) / COUNT_DURATION_MS);
      setValue(Math.round(target * (1 - (1 - progress) ** 3)));
      if (progress < 1) frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [active, target]);

  return active ? value : 0;
}

function PodiumWinner({ entry, revealed, hidePoints }) {
  const total = useCountUp(entry.total, revealed);
  return (
    <div className={`podium__winner podium__winner--p${entry.position}`}>
      {entry.avatarUrl ? (
        <Avatar className="podium__avatar" value={entry.avatarUrl} name={entry.name} />
      ) : (
        <span className="podium__avatar podium__avatar--blank" aria-hidden="true" />
      )}
      <span className="podium__name">{entry.name}</span>
      {hidePoints ? (
        <span className="podium__total podium__total--hidden" aria-hidden="true">
          •••
        </span>
      ) : (
        <span className="podium__total">{total}</span>
      )}
    </div>
  );
}

/**
 * Um degrau do pódio. A ordem visual segue a olímpica (2º à esquerda, 1º ao
 * centro e mais alto, 3º à direita) e a altura do bloco vem do CSS.
 *
 * Empates são reais aqui — dois alunos em 1º sobem no mesmo degrau —, então
 * o degrau recebe uma lista, não uma pessoa.
 */
function PodiumStep({ place, entries, revealed, hidePoints }) {
  return (
    <div
      className={`podium__step podium__step--p${place}${revealed ? " podium__step--in" : ""}`}
      data-testid={`podium-step-${place}`}
    >
      <div className="podium__people">
        {revealed
          ? entries.map((entry) => (
              <PodiumWinner key={entry.studentId} entry={entry} revealed={revealed} hidePoints={hidePoints} />
            ))
          : null}
      </div>
      <div className="podium__block">
        <span className="podium__medal" aria-hidden="true">
          {MEDAL_BY_POSITION[place]}
        </span>
        <span className="podium__place">{place}º</span>
      </div>
    </div>
  );
}

const FIREWORKS_BURSTS = 6;
const FIREWORKS_SPARKS = 18;

/** Um valor aleatório estável por montagem do componente, para os fogos
 *  não abrirem todos juntos nem re-sortearem a cada re-render do pódio. */
function useStableRandom() {
  const ref = useRef(null);
  if (ref.current === null) {
    ref.current = {
      // Cada explosão ganha um atraso e um ritmo próprios, em segundos:
      // quanto maior o delay, mais "solta" a sequência fica no ar.
      delay: Array.from({ length: FIREWORKS_BURSTS }, () => +(Math.random() * 1.8).toFixed(2)),
      duration: Array.from(
        { length: FIREWORKS_BURSTS },
        () => +(1.5 + Math.random() * 1.0).toFixed(2),
      ),
    };
  }
  return ref.current;
}

/** Fogos do 1º lugar — puro CSS, com tempos de explosão aleatórios. */
function Fireworks() {
  const { delay, duration } = useStableRandom();
  return (
    <div className="fireworks" aria-hidden="true">
      {Array.from({ length: FIREWORKS_BURSTS }, (_, burst) => (
        <span
          key={burst}
          className={`fireworks__burst fireworks__burst--${burst + 1}`}
          style={{ "--fx-delay": `${delay[burst]}s`, "--fx-duration": `${duration[burst]}s` }}
        >
          {Array.from({ length: FIREWORKS_SPARKS }, (__, spark) => (
            <i key={spark} style={{ "--angle": `${(spark * 360) / FIREWORKS_SPARKS}deg` }} />
          ))}
        </span>
      ))}
    </div>
  );
}

/** Todo mundo que participou, no rodapé ao final da cerimônia: os vencedores
 *  do pódio sobem ao degrau e ainda aparecem aqui, junto com o resto da turma
 *  — ninguém fica de fora da "foto" final da partida.
 */
function Audience({ entries }) {
  if (entries.length === 0) return null;
  return (
    <div className="audience" data-testid="audience">
      <span className="audience__label">Participantes</span>
      <ul className="audience__list">
        {entries.map((entry) => (
          <li
            key={entry.studentId}
            className={`audience__item${entry.position <= 3 ? ` audience__item--p${entry.position}` : ""}`}
            title={`${entry.position}º ${entry.name}`}
          >
            {entry.avatarUrl ? (
              <Avatar className="audience__avatar" value={entry.avatarUrl} name={entry.name} />
            ) : (
              <span className="audience__avatar audience__avatar--blank">
                {entry.name.slice(0, 1)}
              </span>
            )}
            <span className="audience__name">{entry.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Uma linha da lista: some até ser revelada, depois conta os pontos. */
function RankingRow({ entry, revealed, hidePoints }) {
  const value = useCountUp(entry.total, revealed);
  if (!revealed) return null;

  const podium = entry.position <= 3 ? ` ranking-reveal__row--p${entry.position}` : "";
  const winner = entry.position === 1 ? " ranking-reveal__row--winner" : "";
  const decisive = entry.position <= 3 ? " ranking-reveal__row--decisive" : "";

  return (
    <li className={`ranking-reveal__row${podium}${decisive}${winner}`}>
      <span className="ranking-reveal__position">
        {MEDAL_BY_POSITION[entry.position] ? (
          <span className="ranking-reveal__medal" aria-hidden="true">
            {MEDAL_BY_POSITION[entry.position]}
          </span>
        ) : null}
        {entry.position}º
      </span>
      <span className="ranking-reveal__name">
        {entry.avatarUrl ? (
          <Avatar className="ranking-reveal__avatar" value={entry.avatarUrl} name={entry.name} />
        ) : null}
        {entry.name}
      </span>
      <span className="ranking-reveal__score">
        {hidePoints ? (
          <span className="ranking-reveal__total ranking-reveal__total--hidden" aria-hidden="true">
            •••
          </span>
        ) : (
          <span className="ranking-reveal__total">{value}</span>
        )}
      </span>
    </li>
  );
}

/**
 * Ranking de rodada: revela do último colocado para o primeiro, uma
 * posição por vez, com os pontos contando até o valor final.
 */
function RankingList({ entries, audio, hidePoints }) {
  const shown = entries.slice(0, 8);
  const [step, setStep] = useState(0);

  const signature = shown.map((entry) => `${entry.studentId}:${entry.total}`).join("|");
  const signatureRef = useRef(null);
  useEffect(() => {
    if (signatureRef.current !== signature) {
      signatureRef.current = signature;
      setStep(0);
    }
  }, [signature]);

  useEffect(() => {
    if (shown.length === 0 || step >= shown.length) return undefined;
    const delay = step === 0 ? FIRST_REVEAL_DELAY_MS : REVEAL_INTERVAL_MS;
    const timer = setTimeout(() => {
      const revealingWinner = step === shown.length - 1;
      audio?.play(revealingWinner ? "RANKING" : "TICK");
      setStep((current) => current + 1);
    }, delay);
    return () => clearTimeout(timer);
  }, [step, shown.length, signature, audio]);

  if (shown.length === 0) return null;

  // Revela de baixo para cima: o 1º lugar fica guardado para o final.
  const revealFrom = shown.length - step;

  return (
    <div className="ranking-reveal">
      <div className="ranking-reveal__title">🏆 RANKING 🏆</div>
      <ol className="ranking-reveal__list">
        {shown.map((entry, index) => (
          <RankingRow key={entry.studentId} entry={entry} revealed={index >= revealFrom} hidePoints={hidePoints} />
        ))}
      </ol>
    </div>
  );
}

/**
 * Cerimônia de pódio no estilo olímpico: revela o 3º lugar, segura o
 * suspense, revela o 2º, segura de novo e só então o 1º, com fogos. No
 * fim, todos os outros participantes aparecem no rodapé.
 */
function PodiumCeremony({ entries, audio, hidePoints = false }) {
  const all = entries ?? [];
  const [step, setStep] = useState(0);

  // A cerimônia só recomeça quando o ranking muda de verdade (nova rodada
  // pontuada), nunca a cada re-render por outro motivo.
  const signature = all.map((entry) => `${entry.studentId}:${entry.total}`).join("|");
  const signatureRef = useRef(null);
  useEffect(() => {
    if (signatureRef.current !== signature) {
      signatureRef.current = signature;
      setStep(0);
    }
  }, [signature]);

  useEffect(() => {
    const current = SCRIPT[step];
    // O último passo ("others") é o estado final da cerimônia: nada mais a
    // agendar depois dele.
    if (all.length === 0 || !current || current.kind === "others") return undefined;
    if (current.kind === "tease") audio?.play("DRUMROLL");
    if (current.kind === "reveal") audio?.play(current.place === 1 ? "FANFARE" : "PODIUM");

    const delay =
      current.kind === "tease"
        ? TEASE_MS
        : current.kind === "reveal" && current.place === 1
          ? WINNER_LAND_MS
          : LAND_MS;
    const timer = setTimeout(() => setStep((value) => value + 1), delay);
    return () => clearTimeout(timer);
  }, [step, all.length, signature, audio]);

  if (all.length === 0) return null;

  const stage = SCRIPT[step] ?? SCRIPT[SCRIPT.length - 1];
  // Uma colocação está revelada assim que seu passo "reveal" já começou.
  const revealedPlaces = new Set(
    SCRIPT.slice(0, step + 1)
      .filter((item) => item.kind === "reveal")
      .map((item) => item.place),
  );
  const done = step >= SCRIPT.length - 1;

  const byPlace = (place) => all.filter((entry) => entry.position === place);
  // No rodapé ao final entram todos — inclusive os que subiram ao pódio.
  const audience = [...all];

  return (
    <div className="podium-stage">
      <div className="podium-stage__title">🏆 PÓDIO 🏆</div>

      {/* O anúncio ocupa a cena sozinho enquanto o degrau ainda está vazio. */}
      <div className="podium-stage__tease" aria-live="polite">
        {stage.kind === "tease" ? (
          <span className="podium-tease">{PLACE_LABEL[stage.place]}…</span>
        ) : null}
      </div>

      {/* Ordem olímpica: 2º, 1º, 3º — o degrau do meio é o mais alto. */}
      <div className="podium">
        <PodiumStep place={2} entries={byPlace(2)} revealed={revealedPlaces.has(2)} hidePoints={hidePoints} />
        <PodiumStep place={1} entries={byPlace(1)} revealed={revealedPlaces.has(1)} hidePoints={hidePoints} />
        <PodiumStep place={3} entries={byPlace(3)} revealed={revealedPlaces.has(3)} hidePoints={hidePoints} />
      </div>

      {revealedPlaces.has(1) ? <Fireworks /> : null}
      {done ? <Audience entries={audience} /> : null}
    </div>
  );
}

/**
 * Placar da tela pública. Entre rodadas mostra a lista de sempre; a
 * cerimônia de pódio fica guardada para o encerramento da partida
 * (`finished`), que é quando ela significa alguma coisa.
 */
export function Ranking({ entries, audio, finished = false, hidePoints = false }) {
  const all = entries ?? [];
  if (all.length === 0) return null;
  return finished ? (
    <PodiumCeremony entries={all} audio={audio} hidePoints={hidePoints} />
  ) : (
    <RankingList entries={all} audio={audio} hidePoints={hidePoints} />
  );
}

export default Ranking;
