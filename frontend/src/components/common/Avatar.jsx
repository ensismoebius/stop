import { decodeFace } from "../../lib/face.js";
import FaceSvg from "./FaceSvg.jsx";

/**
 * Mostra o avatar do aluno, seja ele qual for.
 *
 * `avatarUrl` guarda uma de duas coisas: o rosto montado pelo aluno
 * (`face:v1:…`) ou uma foto tirada na hora (data URL). Este componente é o
 * único lugar que precisa saber disso — o resto da interface só pede "o
 * avatar deste aluno".
 *
 * Sobre acessibilidade: numa lista o nome do aluno já está escrito ao lado,
 * então o avatar entra como decoração (`alt=""`) para o leitor de tela não
 * repetir tudo. Onde ele aparece sozinho — o retrato de quem está montando
 * o próprio rosto — passe `alt` e ele vira conteúdo de verdade.
 *
 * @param {{ value?: string|null, name?: string, alt?: string, className?: string }} props
 */
export function Avatar({ value, name, alt, className }) {
  const spec = decodeFace(value);

  if (spec) {
    return (
      <span className={className} data-avatar="face">
        <FaceSvg spec={spec} title={alt} />
      </span>
    );
  }

  if (value) {
    return <img className={className} src={value} alt={alt ?? ""} data-avatar="image" />;
  }

  // Sem avatar: a inicial do nome já diferencia os alunos numa lista.
  return (
    <span className={className} data-avatar="blank" aria-hidden={alt ? undefined : "true"}>
      {name ? name.slice(0, 1).toUpperCase() : ""}
    </span>
  );
}

export default Avatar;
