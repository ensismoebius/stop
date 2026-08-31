import Avatar from "../components/common/Avatar.jsx";
import ConnectionBadge from "../components/common/ConnectionBadge.jsx";
import Alert from "../components/common/Alert.jsx";
import CollaborativeCorrection from "../components/student/CollaborativeCorrection.jsx";
import AnswerEditor from "../components/student/AnswerEditor.jsx";
import CategoryList from "../components/student/CategoryList.jsx";
import EmojiPicker from "../components/student/EmojiPicker.jsx";

const MEDAL_BY_POSITION = { 1: "🥇", 2: "🥈", 3: "🥉" };

/** Avatar/nome do aluno + badge de conexão. */
export function StudentTopBar({ state, player, connected }) {
  return (
    <div className="spread small muted">
      <span className="row">
        {state?.student?.avatarUrl ?? player.student?.avatarUrl ? (
          <Avatar
            className="student__avatar"
            value={state?.student?.avatarUrl ?? player.student?.avatarUrl}
            name={state?.student?.name}
          />
        ) : null}
        {state?.student?.name} · sala {player.room?.code}
      </span>
      <ConnectionBadge connected={connected} />
    </div>
  );
}

/** Avisos/estado da rodada acima do editor de respostas: feedback, eliminação, fullscreen, correção colaborativa, status. */
export function StudentStatusArea({ connection, player, feedback, eliminated, phase, fullscreenFlow, reviews, completedReviewIds, reviewActions, message }) {
  const { round, playing, revealSeconds } = phase;
  const { fullscreen, enterGame } = fullscreenFlow;
  const { handleDecideReview, reviewBusy } = reviewActions;
  return (
    <>
      <StudentTopBar state={connection.state} player={player} connected={connection.connected} />

      {feedback ? <Alert kind={feedback.kind}>{feedback.message}</Alert> : null}

      {eliminated ? (
        <div className="notice notice--eliminated" role="alert">
          <div className="notice__title">Você foi eliminado desta rodada</div>
          {eliminated.message ??
            "Você saiu da tela cheia.\n\nVocê poderá participar da próxima rodada."}
        </div>
      ) : null}

      {(connection.syncStatus === "DEGRADED" || connection.syncStatus === "UNREACHABLE") ? (
        <div className="notice notice--sync" role="status">
          <div className="notice__title">Sincronizando com a sala…</div>
          <p className="muted">Você está fora de sincronia com o jogo. Tudo bem — seu progresso não foi perdido.</p>
          <button
            type="button"
            className="btn btn--block"
            onClick={() => connection.refresh?.()}
          >
            Sincronizar agora
          </button>
        </div>
      ) : null}

      {playing && !fullscreen.isFullscreen && fullscreen.supported ? (
        <Alert kind="warning">
          Você não está em tela cheia. Volte para o modo tela cheia para continuar jogando.
          <button type="button" className="btn btn--block" onClick={enterGame}>
            Voltar à tela cheia
          </button>
        </Alert>
      ) : null}

      {!playing && round?.status === "COLLABORATIVE_CORRECTION" ? (
        <CollaborativeCorrection
          reviews={reviews}
          completedIds={completedReviewIds}
          onDecide={handleDecideReview}
          deciding={reviewBusy}
          letter={round?.letter}
          letterRule={round?.letterRule}
        />
      ) : null}

      {!playing && round?.status !== "COLLABORATIVE_CORRECTION" && message ? (
        <div className="notice">
          <div className="notice__title">{message.title}</div>
          <p className="muted">{message.text}</p>
          {round?.status === "STARTING" ? (
            <span className="letter__value" aria-live="polite">
              {round?.letter
                ? round.letter
                : revealSeconds !== null && revealSeconds > 0
                  ? revealSeconds
                  : "—"}
            </span>
          ) : null}
        </div>
      ) : null}

      {!round ? (
        <div className="notice">
          <div className="notice__title">Aguardando jogadores</div>
          <p className="muted">Assim que o professor iniciar a rodada, ela aparecerá aqui.</p>
        </div>
      ) : null}
    </>
  );
}

/** Editor da categoria atual (spec 48) + lista de categorias, visível só depois que a rodada de fato começa. */
export function StudentAnswerArea({ currentCategory, answers, phase, answerActions, setCurrentId, currentId }) {
  const { round, playing, roundHasStarted, categories } = phase;
  const { handleChange, commit, selectCategory } = answerActions;
  return (
    <>
      {currentCategory ? (
        <AnswerEditor
          category={currentCategory}
          value={answers[currentCategory.id] ?? ""}
          letter={round?.letter}
          letterRule={round?.letterRule}
          disabled={!playing}
          onChange={handleChange}
          onCommit={commit}
          onClose={() => {
            commit(currentCategory.id);
            setCurrentId(null);
          }}
        />
      ) : null}

      {/* As categorias so aparecem quando a rodada de fato comeca a valer
          (spec): antes disso (CREATED/READY/STARTING) nao ha nada a
          responder ainda, entao mostrar a lista so antecipa/spoila o
          conteudo sem utilidade. */}
      {roundHasStarted && categories.length > 0 ? (
        <CategoryList
          categories={categories}
          answers={answers}
          currentId={currentId}
          disabled={!playing}
          onSelect={selectCategory}
        />
      ) : null}
    </>
  );
}

/**
 * Ranking, visível só ao fim de rodada/partida (nunca durante o jogo).
 * Checa `gameStatus` alem de `round?.status` porque o professor pode
 * finalizar a partida com a ultima rodada ainda em correcao (nunca
 * pontuada) — sem isso, o ranking final nunca aparecia nesse caso.
 */
export function StudentRankingList({ ranking, round, gameStatus, studentId, hidePoints = false }) {
  const show =
    gameStatus === "FINISHED" || round?.status === "SCORED" || round?.status === "FINISHED" || !round;
  if (!(ranking.length > 0 && show)) {
    return null;
  }

  // "Ocultar pontos" vale enquanto a partida corre — no resultado final os
  // números aparecem de qualquer forma, igual ao pódio da tela pública: o
  // interruptor existe para não estragar a virada durante o jogo, não para
  // esconder do aluno como ele terminou.
  const maskPoints = hidePoints && gameStatus !== "FINISHED";

  // A lista visivel e so o top 10, entao numa turma de 100+ alunos a
  // maioria simplesmente nao se encontrava nela e terminava a partida sem
  // saber a propria colocacao. O aluno sempre ve o proprio resultado: em
  // destaque no topo e, se estiver fora do top 10, tambem no fim da lista.
  const me = studentId ? ranking.find((entry) => entry.studentId === studentId) : null;
  const top = ranking.slice(0, 10);
  const meOutsideTop = Boolean(me) && !top.some((entry) => entry.studentId === me.studentId);

  const renderRow = (entry) => (
    <li
      key={entry.studentId}
      className={[
        "ranking__item",
        entry.position <= 3 ? `ranking__item--p${entry.position}` : "",
        me && entry.studentId === me.studentId ? "ranking__item--me" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="ranking__position">{MEDAL_BY_POSITION[entry.position] ?? entry.position}</span>
      <span className="ranking__name">{entry.name}</span>
      {maskPoints ? (
        <span className="ranking__total ranking__total--hidden" aria-hidden="true">
          •••
        </span>
      ) : (
        <span className="ranking__total">{entry.total}</span>
      )}
    </li>
  );

  return (
    <section className="card">
      <h2>Ranking</h2>

      {me ? (
        <div className="ranking__me">
          <span className="ranking__me-medal">{MEDAL_BY_POSITION[me.position] ?? `${me.position}º`}</span>
          <span className="ranking__me-label">
            Sua colocação: <strong>{me.position}º lugar</strong>
          </span>
          {maskPoints ? (
            <span className="ranking__me-total ranking__me-total--hidden">
              pontos ocultos pelo professor
            </span>
          ) : (
            <span className="ranking__me-total">
              <strong>{me.total}</strong> {me.total === 1 ? "ponto" : "pontos"}
            </span>
          )}
        </div>
      ) : null}

      <ol className="ranking__list">
        {top.map(renderRow)}
        {meOutsideTop ? (
          <>
            <li className="ranking__gap" aria-hidden="true">
              ⋯
            </li>
            {renderRow(me)}
          </>
        ) : null}
      </ol>
    </section>
  );
}

/** Emoji picker + botões de som/sair, no rodapé do corpo da página. */
export function StudentFooterControls({ sendEmoji, audio, leaveRoom }) {
  return (
    <>
      <EmojiPicker onSend={sendEmoji} />
      <div className="row small">
        <button type="button" className="btn btn--ghost" onClick={audio.toggle}>
          {audio.enabled ? "🔊 Som ligado" : "🔇 Som desligado"}
        </button>
        <button type="button" className="btn btn--ghost" onClick={leaveRoom}>
          Sair
        </button>
      </div>
    </>
  );
}
