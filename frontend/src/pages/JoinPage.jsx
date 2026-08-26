import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../services/api.js";
import { usePlayer } from "../state/PlayerContext.jsx";
import Field from "../components/common/Field.jsx";
import Alert from "../components/common/Alert.jsx";
import AvatarPicker from "../components/student/AvatarPicker.jsx";

/** Passo 1: formulário de matrícula. */
function RegistrationForm({ registration, setRegistration, loading, onSubmit }) {
  return (
    <form className="stack" onSubmit={onSubmit}>
      <Field id="registration" label="Matrícula" hint="Informe o número da sua matrícula.">
        <input
          id="registration"
          className="input"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={registration}
          maxLength={40}
          onChange={(event) => setRegistration(event.target.value)}
          required
        />
      </Field>
      <button
        type="submit"
        className="btn btn--primary btn--block"
        disabled={loading || registration.trim().length === 0}
      >
        {loading ? "Verificando..." : "CONTINUAR"}
      </button>
    </form>
  );
}

/** Passo 2: confirmação de identidade ("Você é: <nome>"). */
function CandidateConfirm({ candidate, loading, onConfirm, onReject }) {
  return (
    <div className="confirm stack">
      <span className="muted">Você é:</span>
      <div className="confirm__name">{candidate.name}</div>
      <span className="muted small">Matrícula: {candidate.registrationNumber}</span>
      <button type="button" className="btn btn--primary btn--block" onClick={onConfirm} disabled={loading}>
        SIM, SOU EU
      </button>
      <button type="button" className="btn btn--block" onClick={onReject} disabled={loading}>
        NÃO
      </button>
    </div>
  );
}

/** Passo 3: escolha opcional de avatar antes de entrar na sala. */
function AvatarStep({ avatarUrl, setAvatarUrl, loading, onContinue, onSkip }) {
  return (
    <div className="confirm stack">
      <span className="muted">Escolha como quer aparecer no jogo:</span>
      <AvatarPicker value={avatarUrl} onChange={setAvatarUrl} />
      <button type="button" className="btn btn--primary btn--block" onClick={onContinue} disabled={loading}>
        {loading ? "Entrando..." : "CONTINUAR"}
      </button>
      <button type="button" className="btn btn--ghost btn--block" onClick={onSkip} disabled={loading}>
        Pular
      </button>
    </div>
  );
}

/**
 * Confirma a entrada na sala, com avatar opcional. `skip` ignora o estado
 * atual de avatarUrl (em vez de depender de um setAvatarUrl(null) anterior,
 * que so aplicaria no proximo render — tarde demais para este mesmo clique).
 */
function useFinalizeJoin({ code, candidate, avatarUrl, navigate, save, setError, setLoading }) {
  return useCallback(
    async (skip = false) => {
      setError(null);
      setLoading(true);
      try {
        const chosen = skip ? null : avatarUrl;
        if (chosen && chosen !== candidate.avatarUrl) {
          await api.setAvatar(code, candidate.registrationNumber, chosen);
        }
        const session = await api.join(code, candidate.registrationNumber);
        save({
          ...session,
          student: { ...session.student, avatarUrl: chosen ?? session.student.avatarUrl },
        });
        navigate("/play", { replace: true });
      } catch (apiError) {
        setError(apiError.message);
      } finally {
        setLoading(false);
      }
    },
    [code, candidate, avatarUrl, navigate, save, setError, setLoading],
  );
}

/** Estado + ações de entrada: busca da sala, identificação por matrícula e finalização (com avatar opcional). */
function useJoinFlow(code) {
  const navigate = useNavigate();
  const { save } = usePlayer();

  const [room, setRoom] = useState(null);
  const [registration, setRegistration] = useState("");
  const [candidate, setCandidate] = useState(null);
  const [avatarStep, setAvatarStep] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getRoom(code)
      .then((data) => {
        if (!cancelled) setRoom(data);
      })
      .catch((apiError) => {
        if (!cancelled) setError(apiError.message);
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  const identify = useCallback(
    async (event) => {
      event.preventDefault();
      setError(null);
      setLoading(true);
      try {
        const result = await api.identify(code, registration.trim());
        setCandidate(result.student);
        setAvatarUrl(result.student.avatarUrl ?? null);
      } catch (apiError) {
        setError(apiError.message);
      } finally {
        setLoading(false);
      }
    },
    [code, registration],
  );

  const finalize = useFinalizeJoin({ code, candidate, avatarUrl, navigate, save, setError, setLoading });

  return {
    room,
    registration,
    setRegistration,
    candidate,
    setCandidate,
    avatarStep,
    setAvatarStep,
    avatarUrl,
    setAvatarUrl,
    error,
    loading,
    identify,
    finalize,
  };
}

/**
 * Entrada do aluno (spec 6).
 *
 * O aluno informa somente a matricula. O nome vem exclusivamente do banco
 * e serve para confirmacao: o cliente nunca envia o proprio nome como
 * mecanismo de identificacao.
 */
export function JoinPage() {
  const { code } = useParams();
  const {
    room,
    registration,
    setRegistration,
    candidate,
    setCandidate,
    avatarStep,
    setAvatarStep,
    avatarUrl,
    setAvatarUrl,
    error,
    loading,
    identify,
    finalize,
  } = useJoinFlow(code);

  return (
    <div className="join">
      <div>
        <h1>STOP</h1>
        <p className="muted">Revisão de conteúdo</p>
      </div>

      <div className="card stack">
        <div>
          <span className="small muted">Sala</span>
          <div className="join__code">{code}</div>
          {room ? (
            <p className="small muted">
              {room.game?.name}
              {room.className ? ` · ${room.className}` : ""}
            </p>
          ) : null}
        </div>

        <Alert kind="error">{error}</Alert>

        {candidate && avatarStep ? (
          <AvatarStep
            avatarUrl={avatarUrl}
            setAvatarUrl={setAvatarUrl}
            loading={loading}
            onContinue={() => finalize(false)}
            onSkip={() => finalize(true)}
          />
        ) : candidate ? (
          <CandidateConfirm
            candidate={candidate}
            loading={loading}
            onConfirm={() => setAvatarStep(true)}
            onReject={() => {
              setCandidate(null);
              setRegistration("");
              setAvatarStep(false);
              setAvatarUrl(null);
            }}
          />
        ) : (
          <RegistrationForm
            registration={registration}
            setRegistration={setRegistration}
            loading={loading}
            onSubmit={identify}
          />
        )}
      </div>
    </div>
  );
}

export default JoinPage;
