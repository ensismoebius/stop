import { useEffect } from "react";

/**
 * Entra em tela cheia assim que o usuario interage com a pagina pela
 * primeira vez — o mais perto que o navegador permite de "abrir ja em
 * tela cheia" (spec 24: a Fullscreen API exige um gesto do usuario, o
 * JavaScript nao pode disparar isso sozinho no carregamento).
 *
 * Usado em todas as telas (aluno, professor, tela publica): o primeiro
 * toque em qualquer lugar da pagina expande para tela cheia, como no
 * Kahoot. Nao interfere em cliques em botoes/links — eles continuam
 * funcionando normalmente, o pedido de fullscreen apenas acontece junto.
 */
export function useAutoFullscreen({ enabled = true } = {}) {
  useEffect(() => {
    if (!enabled) return undefined;
    if (typeof document === "undefined") return undefined;

    const supported = Boolean(
      document.documentElement.requestFullscreen ??
        document.documentElement.webkitRequestFullscreen,
    );
    if (!supported) return undefined;

    let done = false;

    const tryEnter = () => {
      if (done) return;
      const alreadyFullscreen = Boolean(
        document.fullscreenElement ?? document.webkitFullscreenElement,
      );
      if (alreadyFullscreen) {
        done = true;
        return;
      }
      done = true;
      const request =
        document.documentElement.requestFullscreen ??
        document.documentElement.webkitRequestFullscreen;
      request.call(document.documentElement)?.catch?.(() => {
        // O usuario pode recusar ou o navegador pode bloquear; sem problema,
        // o layout continua ocupando 100dvh mesmo fora do fullscreen real.
        done = false;
      });
    };

    const events = ["pointerdown", "keydown"];
    for (const event of events) document.addEventListener(event, tryEnter, { once: false });
    return () => {
      for (const event of events) document.removeEventListener(event, tryEnter);
    };
  }, [enabled]);
}

export default useAutoFullscreen;
