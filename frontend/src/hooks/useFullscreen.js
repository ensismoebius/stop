import { useCallback, useEffect, useState } from "react";

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

  useEffect(() => {
    const handleChange = () => {
      const active = Boolean(currentElement());
      setIsFullscreen((previous) => {
        // Transicao de "dentro" para "fora" e o que importa (spec 24).
        if (previous && !active && typeof onExit === "function") onExit();
        return active;
      });
    };

    const events = ["fullscreenchange", "webkitfullscreenchange", "mozfullscreenchange"];
    for (const event of events) document.addEventListener(event, handleChange);
    return () => {
      for (const event of events) document.removeEventListener(event, handleChange);
    };
  }, [onExit]);

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
