import { useEffect, useRef } from "react";

/**
 * Campo de resposta da categoria selecionada (spec 10).
 *
 * Sem botao "salvar" por categoria: o texto vive no estado do React e e
 * sincronizado com o servidor por debounce, ao sair do campo e ao trocar
 * de categoria (spec 48).
 */
export function AnswerEditor({ category, value, letter, letterRule = "STARTS_WITH", disabled, onChange, onCommit, onClose }) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (!disabled) inputRef.current?.focus();
  }, [category?.id, disabled]);

  if (!category) return null;

  const trimmed = (value ?? "").trim();
  const fold = (text) =>
    text
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLocaleLowerCase("pt-BR");
  const matchesLetter =
    !letter ||
    trimmed.length === 0 ||
    (letterRule === "CONTAINS" ? fold(trimmed).includes(fold(letter)) : fold(trimmed).startsWith(fold(letter)));
  const ruleHint = letterRule === "CONTAINS" ? `Contém ${letter}` : `Começa com ${letter}`;

  return (
    <section className="editor" aria-label={`Resposta para ${category.name}`}>
      <span className="editor__title">{category.name}</span>
      <input
        ref={inputRef}
        id={`answer-${category.id}`}
        className="input editor__input"
        type="text"
        value={value ?? ""}
        maxLength={120}
        disabled={disabled}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="done"
        placeholder={letter ? `${ruleHint}...` : "Sua resposta"}
        onChange={(event) => onChange(category.id, event.target.value)}
        onBlur={() => onCommit(category.id)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onCommit(category.id);
            onClose();
          }
        }}
      />
      {!matchesLetter ? (
        <span className="editor__hint editor__hint--warn">
          Atenção: a resposta não {letterRule === "CONTAINS" ? "contém" : "começa com"} a letra {letter}.
        </span>
      ) : (
        <span className="editor__hint">A resposta é salva automaticamente.</span>
      )}
      <button type="button" className="btn btn--ghost" onClick={onClose}>
        Voltar
      </button>
    </section>
  );
}

export default AnswerEditor;
