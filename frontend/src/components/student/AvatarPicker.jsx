import { useCallback, useRef, useState } from "react";

const PRESET_COUNT = 12;
const PRESET_AVATARS = Array.from(
  { length: PRESET_COUNT },
  (_, i) => `/avatars/avatar-${String(i + 1).padStart(2, "0")}.svg`,
);

const PHOTO_SIZE = 256;
const PHOTO_QUALITY = 0.7;

/** Redimensiona a foto (recorte central quadrado) para nao pesar no banco. */
function resizePhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler a foto"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Não foi possível carregar a foto"));
      img.onload = () => {
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        const canvas = document.createElement("canvas");
        canvas.width = PHOTO_SIZE;
        canvas.height = PHOTO_SIZE;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, sx, sy, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
        resolve(canvas.toDataURL("image/jpeg", PHOTO_QUALITY));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Escolha de avatar do aluno (spec 6): uma foto tirada na hora ou um dos
 * avatares prontos. Opcional — o aluno pode seguir sem escolher nada.
 */
export function AvatarPicker({ value, onChange }) {
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef(null);

  const handleFile = useCallback(
    async (event) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      setError(null);
      setBusy(true);
      try {
        const dataUrl = await resizePhoto(file);
        onChange(dataUrl);
      } catch (photoError) {
        setError(photoError.message ?? "Falha ao processar a foto");
      } finally {
        setBusy(false);
      }
    },
    [onChange],
  );

  return (
    <div className="avatar-picker stack">
      <div className="avatar-picker__preview">
        {value ? (
          <img src={value} alt="Seu avatar" />
        ) : (
          <span className="avatar-picker__placeholder">?</span>
        )}
      </div>

      <button
        type="button"
        className="btn btn--ghost btn--block"
        onClick={() => fileInputRef.current?.click()}
        disabled={busy}
      >
        {busy ? "Processando..." : "📷 Tirar foto"}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="user"
        className="avatar-picker__file-input"
        onChange={handleFile}
      />

      {error ? <p className="small" style={{ color: "var(--red)" }}>{error}</p> : null}

      <span className="small muted">Ou escolha um avatar:</span>
      <div className="avatar-picker__grid">
        {PRESET_AVATARS.map((preset) => (
          <button
            key={preset}
            type="button"
            className={`avatar-picker__option${value === preset ? " avatar-picker__option--selected" : ""}`}
            onClick={() => onChange(preset)}
          >
            <img src={preset} alt="" />
          </button>
        ))}
      </div>
    </div>
  );
}

export default AvatarPicker;
