import { useCallback, useEffect, useRef, useState } from "react";

function currentElement() {
  return (
    document.fullscreenElement ??
    document.webkitFullscreenElement ??
    document.mozFullScreenElement ??
    null
  );
}

async function requestOn(element) {
  const node = element ?? document.documentElement;
  const request =
    node.requestFullscreen ?? node.webkitRequestFullscreen ?? node.mozRequestFullScreen;
  if (!request) return false;
  try {
    await request.call(node);
    return true;
  } catch {
    // O navegador pode recusar sem um gesto do usuario. Nao e erro fatal.
    return false;
  }
}

/**
 * Controle de tela cheia (spec 24).
 *
 * O JavaScript nao consegue manter o dispositivo em fullscreen a forca:
 * detectamos a saida e avisamos o servidor, que decide a eliminacao.
 */
export function useFullscreen({ onExit } = {}) {
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(currentElement()));
  const [supported] = useState(
    () =>
      typeof document !== "undefined" &&
      Boolean(
        document.documentElement.requestFullscreen ??
          document.documentElement.webkitRequestFullscreen,
      ),
  );

  // `onExit` costuma ser um novo `useCallback` a cada mudanca de estado da
  // rodada no chamador; guardar em ref evita reassinar os listeners do
  // documento (e recriar a closure de `handleChange`) a cada uma dessas
  // mudancas — o efeito abaixo so precisa rodar uma vez.
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  useEffect(() => {
    const handleChange = () => {
      const active = Boolean(currentElement());
      setIsFullscreen((previous) => {
        // Transicao de "dentro" para "fora" e o que importa (spec 24).
        if (previous && !active && typeof onExitRef.current === "function") onExitRef.current();
        return active;
      });
    };

    const events = ["fullscreenchange", "webkitfullscreenchange", "mozfullscreenchange"];
    for (const event of events) document.addEventListener(event, handleChange);
    return () => {
      for (const event of events) document.removeEventListener(event, handleChange);
    };
  }, []);

  const enter = useCallback((element) => requestOn(element), []);

  const exit = useCallback(async () => {
    const close = document.exitFullscreen ?? document.webkitExitFullscreen;
    if (close && currentElement()) {
      try {
        await close.call(document);
      } catch {
        /* ignorado */
      }
    }
  }, []);

  return { isFullscreen, supported, enter, exit };
}

export default useFullscreen;
