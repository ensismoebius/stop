import { useCallback, useRef, useState } from "react";
import FaceBuilder from "./FaceBuilder.jsx";
import Avatar from "../common/Avatar.jsx";

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
 * Avatar do aluno (spec 6): montar o próprio rosto ou tirar uma foto na
 * hora. Opcional — dá para entrar sem escolher nada.
 *
 * @param {{ value: string | null, onChange: (url: string | null) => void }} props
 */
export function AvatarPicker({ value, onChange }) {
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef(null);
  const isPhoto = typeof value === "string" && value.startsWith("data:");
  // Em sala de aula o app roda por HTTP simples na rede local (o QR Code
  // aponta para http://IP:PORTA — ver README), e nesse caso o atalho de
  // camera do <input capture> e recusado pelo navegador do celular sem
  // lancar nenhum erro: o botao simplesmente nao faz nada. Sem contexto
  // seguro (HTTPS/localhost) nem tentamos — o aluno vai direto montar o
  // rosto, em vez de tocar num botao morto.
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
      ) : null}

      {error ? <p className="small" style={{ color: "var(--red)" }}>{error}</p> : null}

      {/* Foto tirada na hora continua sendo uma opção: quando existe, ela
          manda, e o montador some para não competir com ela. */}
      {isPhoto ? (
        <div className="avatar-picker__photo">
          <Avatar value={value} alt="Seu avatar" className="avatar-picker__preview" />
          <button type="button" className="btn btn--ghost btn--block" onClick={() => onChange(null)}>
            Montar um rosto no lugar da foto
          </button>
        </div>
      ) : (
        <FaceBuilder value={value} onChange={onChange} />
      )}
    </div>
  );
}

export default AvatarPicker;
