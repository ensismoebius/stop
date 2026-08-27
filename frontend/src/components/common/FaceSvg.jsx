import { useMemo } from "react";
import { faceSvg } from "../../lib/face.js";

/**
 * Desenha o rosto montado.
 *
 * A marcação vem inteira do arquivo de peças gerado no build e das paletas
 * fixas — o aluno escolhe só índices —, então não há conteúdo de origem
 * externa aqui, apesar do `dangerouslySetInnerHTML`.
 *
 * @param {{ spec: object, title?: string, className?: string }} props
 */
export function FaceSvg({ spec, title, className }) {
  const markup = useMemo(() => faceSvg(spec), [spec]);

  return (
    <span
      // `face` garante o box do desenho (display block, 100%×100%). Sem ela
      // o wrapper é inline, ganha altura de linha e corta o rosto.
      className={className ? `face ${className}` : "face"}
      // Sem `title` o rosto é decoração: quem lê a tela não ganha nada
      // ouvindo "avatar" ao lado de um nome que já está escrito.
      {...(title ? { role: "img", "aria-label": title } : { "aria-hidden": "true" })}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}

export default FaceSvg;
