import { useCallback, useRef, useState } from "react";

const PRESET_COUNT = 24;
const PRESET_AVATARS = Array.from(
  { length: PRESET_COUNT },
  (_, idx) => `/avatars/avatar-${String(idx + 1).padStart(2, "0")}.svg`,
);

const PHOTO_SIZE = 256;
const PHOTO_QUALITY = 0.7;

/**
 * Resize a captured photo (centre-crop to square) so it does not bloat
 * the database. Returns a base-64 JPEG data URL.
 *
 * @param {File} file
 * @returns {Promise<string>}
 */
function resizePhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler a foto"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Não foi possível carregar a foto"));
      img.onload = () => {
        const side = Math.min(img.width, img.height);
        const sourceX = (img.width - side) / 2;
        const sourceY = (img.height - side) / 2;
        const canvas = document.createElement("canvas");
        canvas.width = PHOTO_SIZE;
        canvas.height = PHOTO_SIZE;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, sourceX, sourceY, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
        resolve(canvas.toDataURL("image/jpeg", PHOTO_QUALITY));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Avatar picker for the student (spec 6): take a photo on the spot or
 * choose one of the preset avatars. Optional — the student can proceed
 * without picking anything.
 *
 * @param {{ value: string | null, onChange: (url: string | null) => void }} props
 */
export function AvatarPicker({ value, onChange }) {
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef(null);
  // Em sala de aula o app roda por HTTP simples na rede local (o QR Code
  // aponta para http://IP:PORTA — ver README), e nesse caso o atalho de
  // camera do <input capture> e recusado pelo navegador do celular sem
  // lancar nenhum erro: o botao simplesmente nao faz nada. Sem contexto
  // seguro (HTTPS/localhost) nem tentamos — o aluno vai direto pros
  // avatares prontos, em vez de tocar num botao morto.
  const cameraAvailable = typeof window !== "undefined" && window.isSecureContext;

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

      {cameraAvailable ? (
        <>
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
        </>
      ) : (
        <p className="small muted">A câmera precisa de HTTPS — escolha um avatar abaixo.</p>
      )}

      {error ? <p className="small" style={{ color: "var(--red)" }}>{error}</p> : null}

      <span className="small muted">Ou escolha um avatar:</span>
      <AvatarGrid avatars={PRESET_AVATARS} selected={value} onSelect={onChange} />
    </div>
  );
}

/**
 * Grid of preset avatar buttons. Extracted to keep AvatarPicker under
 * the function-length threshold.
 *
 * @param {{ avatars: string[], selected: string | null, onSelect: (url: string) => void }} props
 */
function AvatarGrid({ avatars, selected, onSelect }) {
  return (
    <div className="avatar-picker__grid">
      {avatars.map((preset) => (
        <button
          key={preset}
          type="button"
          className={`avatar-picker__option${selected === preset ? " avatar-picker__option--selected" : ""}`}
          onClick={() => onSelect(preset)}
        >
          <img src={preset} alt="" />
        </button>
      ))}
    </div>
  );
}

export default AvatarPicker;
