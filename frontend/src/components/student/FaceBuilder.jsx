import { useCallback, useMemo, useState } from "react";
import FaceSvg from "../common/FaceSvg.jsx";
import { DEFAULT_FACE, FACE_STEPS, decodeFace, encodeFace, randomFace } from "../../lib/face.js";

/** Miniatura de uma opção da etapa: o rosto inteiro, só trocando esta peça. */
function Option({ spec, field, index, selected, onPick }) {
  return (
    <button
      type="button"
      className={`wz__option${selected ? " wz__option--on" : ""}`}
      aria-pressed={selected}
      aria-label={`Opção ${index + 1}`}
      onClick={() => onPick(index)}
    >
      <FaceSvg spec={{ ...spec, [field]: index }} />
    </button>
  );
}

/**
 * Montador de rosto em formato de assistente (spec 6).
 *
 * Uma decisão por tela — tom de pele, cabelo, cor, olhos, sobrancelha,
 * boca — em vez de todos os controles de uma vez. Cada opção é mostrada
 * como o rosto inteiro do aluno com aquela peça trocada, então dá para
 * escolher olhando o resultado, e não um nome como "variant07".
 *
 * @param {{ value: string|null, onChange: (value: string) => void }} props
 */
export function FaceBuilder({ value, onChange }) {
  const spec = useMemo(() => decodeFace(value) ?? DEFAULT_FACE, [value]);
  const [step, setStep] = useState(0);

  const current = FACE_STEPS[step];
  const isLast = step === FACE_STEPS.length - 1;

  const pick = useCallback(
    (next) => onChange(encodeFace({ ...spec, [current.key]: next })),
    [current.key, onChange, spec],
  );

  return (
    <div className="wz">
      <div className="wz__preview">
        <FaceSvg spec={spec} title="Seu avatar" className="wz__face" />
      </div>

      {/* Trilha das etapas: mostra onde o aluno está e deixa voltar direto. */}
      <ol className="wz__track">
        {FACE_STEPS.map((item, index) => (
          <li key={item.key}>
            <button
              type="button"
              className={`wz__dot${index === step ? " wz__dot--on" : ""}${index < step ? " wz__dot--done" : ""}`}
              aria-label={item.title}
              aria-current={index === step ? "step" : undefined}
              onClick={() => setStep(index)}
            />
          </li>
        ))}
      </ol>

      <div className="wz__head">
        <span className="wz__step-count">
          Passo {step + 1} de {FACE_STEPS.length}
        </span>
        <h3 className="wz__title">{current.title}</h3>
        <p className="wz__hint">{current.hint}</p>
      </div>

      {current.kind === "palette" ? (
        <div className="wz__swatches" role="group" aria-label={current.title}>
          {current.palette.map((hex, index) => (
            <button
              key={hex}
              type="button"
              className={`wz__swatch${spec[current.key] === index ? " wz__swatch--on" : ""}`}
              style={{ background: hex }}
              aria-label={`${current.title} ${index + 1}`}
              aria-pressed={spec[current.key] === index}
              onClick={() => pick(index)}
            />
          ))}
        </div>
      ) : (
        // Painel de rolagem próprio: as galerias têm até 45 peças, e sem uma
        // altura fixa a lista empurra os botões de navegação para fora da
        // tela do telefone.
        <div className="wz__panel">
          <div className="wz__grid" role="group" aria-label={current.title}>
            {Array.from({ length: current.count }, (_, index) => (
              <Option
                key={index}
                spec={spec}
                field={current.key}
                index={index}
                selected={spec[current.key] === index}
                onPick={pick}
              />
            ))}
          </div>
          <span className="wz__count" aria-hidden="true">
            {current.count} opções
          </span>
        </div>
      )}

      <div className="wz__nav">
        <button
          type="button"
          className="btn btn--ghost"
          disabled={step === 0}
          onClick={() => setStep((s) => s - 1)}
        >
          Voltar
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => onChange(encodeFace(randomFace()))}>
          🎲
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={isLast}
          onClick={() => setStep((s) => s + 1)}
        >
          {isLast ? "Pronto" : "Próximo"}
        </button>
      </div>
    </div>
  );
}

export default FaceBuilder;
