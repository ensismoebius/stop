/** Cabecalho da tela publica com o titulo do jogo e o codigo da sala. */
export function GameTitle({ name, roomCode }) {
  return (
    <div className="screen__top">
      <span className="screen__title">STOP RN</span>
      <span className="screen__room">
        {name} · {roomCode}
      </span>
    </div>
  );
}

export default GameTitle;
