export const EMOJI_REACTIONS = ["😂", "😮", "👍", "🔥", "❤️", "😈", "🎉"];

/** Reacoes rapidas: conjunto fixo, sem digitacao (spec: facil de moderar). */
export function EmojiPicker({ onSend }) {
  return (
    <div className="emoji-picker row" role="group" aria-label="Enviar reação">
      {EMOJI_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          className="emoji-picker__btn"
          onClick={() => onSend(emoji)}
          aria-label={`Enviar reação ${emoji}`}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

export default EmojiPicker;
