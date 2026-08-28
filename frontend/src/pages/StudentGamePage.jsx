import GameHeader from "../components/student/GameHeader.jsx";
import StopButton from "../components/student/StopButton.jsx";
import EmojiBursts from "../components/common/EmojiBursts.jsx";
import StopSplash from "../components/common/StopSplash.jsx";
import { useStudentGameState } from "./StudentGamePage.state.jsx";
import {
  StudentStatusArea,
  StudentRankingList,
  StudentAnswerArea,
  StudentFooterControls,
} from "./StudentGamePage.parts.jsx";

const STATUS_MESSAGE = {
  CREATED: { title: "Aguardando", text: "O professor está preparando a rodada." },
  READY: { title: "Preparar!", text: "A letra foi sorteada. Aguarde a revelação na tela." },
  STARTING: { title: "Preparar!", text: "A rodada vai começar." },
  STOPPED: { title: "STOP!", text: "A rodada foi encerrada. Aguarde a correção." },
  CORRECTION: { title: "Correção", text: "O professor está corrigindo as respostas." },
  SCORED: { title: "Pontuação", text: "A pontuação da rodada foi divulgada." },
  FINISHED: { title: "Rodada encerrada", text: "Aguarde o professor iniciar a próxima." },
};

/**
 * Student game page: displays categories, answer inputs, the STOP
 * button, and handles all round lifecycle events via WebSocket.
 *
 * @returns {JSX.Element}
 */
export function StudentGamePage() {
  const game = useStudentGameState();
  const { player, phase, answerActions, stop, reviewActions, fullscreenFlow } = game;

  if (!player) return null;

  const message = phase.round ? STATUS_MESSAGE[phase.round.status] : null;
  const currentCategory = phase.categories.find((category) => category.id === game.currentId) ?? null;

  return (
    <div className="student">
      <GameHeader
        round={phase.round}
        seconds={phase.seconds}
        running={phase.playing}
        filled={answerActions.filledCount}
        total={phase.categories.length}
      />

      <main className="student__body">
        <StudentStatusArea
          connection={game.connection}
          player={player}
          feedback={game.feedback}
          eliminated={game.eliminated}
          phase={phase}
          fullscreenFlow={fullscreenFlow}
          reviews={game.reviews}
          completedReviewIds={game.completedReviewIds}
          reviewActions={reviewActions}
          message={message}
        />

        <StudentRankingList
          ranking={game.ranking}
          round={phase.round}
          gameStatus={game.connection.state?.game?.status}
          studentId={game.connection.state?.student?.id}
        />

        <StudentAnswerArea
          currentCategory={currentCategory}
          answers={game.answers}
          phase={phase}
          answerActions={answerActions}
          setCurrentId={game.setCurrentId}
          currentId={game.currentId}
        />

        <StudentFooterControls sendEmoji={reviewActions.sendEmoji} audio={game.audio} leaveRoom={fullscreenFlow.leaveRoom} />
      </main>

      <div className="stopbar">
        <StopButton
          disabled={!answerActions.canStop || stop.stopping}
          filled={answerActions.filledCount}
          total={phase.categories.length}
          onClick={stop.handleStop}
        />
      </div>

      <EmojiBursts items={game.emojiBursts.items} />

      {game.stopSplash ? <StopSplash onDone={() => game.setStopSplash(false)} /> : null}
    </div>
  );
}

export default StudentGamePage;
