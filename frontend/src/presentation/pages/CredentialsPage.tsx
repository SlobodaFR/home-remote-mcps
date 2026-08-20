import { useEffect, useState } from 'react';
import { apiClient, Credential } from '../../infrastructure/api-client';

type Step = 'form' | 'mfa';

const STATUS_LABEL: Record<Credential['status'], string> = {
  ok: 'Connecte',
  failed: 'Echec',
  pending_mfa: 'MFA en attente',
};

const STATUS_CLASS: Record<Credential['status'], string> = {
  ok: 'text-success',
  failed: 'text-error',
  pending_mfa: 'text-warning',
};

const inputClass =
  'bg-soft-cloud rounded px-md py-sm font-body-md text-ink placeholder:text-mute outline-none focus:ring-2 focus:ring-ink';
const primaryButtonClass =
  'bg-ink text-on-primary font-button-md rounded-full h-12 disabled:opacity-50';

export function CredentialsPage() {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [step, setStep] = useState<Step>('form');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    kind: 'success' | 'error';
    text: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const garmin = credentials.find((c) => c.service === 'garmin') ?? null;

  function reload() {
    apiClient.fetchCredentials().then(setCredentials).catch(console.error);
  }

  useEffect(reload, []);

  async function handleLogin() {
    setSubmitting(true);
    setMessage(null);
    try {
      const result = await apiClient.startGarminLogin(email, password);
      if (result.status === 'ok') {
        setMessage({
          kind: 'success',
          text: 'Connexion Garmin validee et stockee.',
        });
        setStep('form');
        setEmail('');
        setPassword('');
        reload();
      } else if (result.status === 'mfa_required') {
        setPendingId(result.pendingId);
        setStep('mfa');
      } else {
        setMessage({ kind: 'error', text: result.message });
      }
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Erreur inconnue',
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMfa() {
    if (!pendingId) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const result = await apiClient.submitGarminMfa(pendingId, mfaCode);
      if (result.status === 'ok') {
        setMessage({
          kind: 'success',
          text: 'Connexion Garmin validee et stockee.',
        });
        setStep('form');
        setEmail('');
        setPassword('');
        setMfaCode('');
        setPendingId(null);
        reload();
      } else {
        setMessage({
          kind: 'error',
          text:
            result.status === 'error' ? result.message : 'Code MFA invalide',
        });
      }
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Erreur inconnue',
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    await apiClient.deleteCredential(id);
    reload();
  }

  return (
    <main className="max-w-xl mx-auto px-xl py-section flex flex-col gap-section">
      <section>
        <h2 className="font-heading-lg mb-md">Services connectes</h2>
        {garmin ? (
          <div className="bg-canvas border border-hairline p-xl flex items-center justify-between">
            <div>
              <div className="font-body-strong">Garmin Connect</div>
              <div className={`font-caption-md ${STATUS_CLASS[garmin.status]}`}>
                {STATUS_LABEL[garmin.status]}
              </div>
              {garmin.lastError && (
                <div className="font-caption-sm text-error mt-xs">
                  {garmin.lastError}
                </div>
              )}
              {garmin.lastTestedAt && (
                <div className="font-caption-sm text-mute mt-xs">
                  Dernier test:{' '}
                  {new Date(garmin.lastTestedAt).toLocaleString('fr-FR')}
                </div>
              )}
            </div>
            <button
              onClick={() => void handleDelete(garmin.id)}
              className="font-caption-md text-error hover:underline"
            >
              Supprimer
            </button>
          </div>
        ) : (
          <p className="font-body-md text-mute">
            Aucun service connecte pour le moment.
          </p>
        )}
      </section>

      <section className="bg-canvas border border-hairline p-xl">
        <h2 className="font-heading-lg mb-lg">
          {garmin ? 'Mettre a jour Garmin' : 'Connecter Garmin'}
        </h2>

        {step === 'form' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleLogin();
            }}
            className="flex flex-col gap-md"
          >
            <input
              type="email"
              required
              placeholder="Email Garmin"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
            <input
              type="password"
              required
              placeholder="Mot de passe Garmin"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
            <button
              type="submit"
              disabled={submitting}
              className={primaryButtonClass}
            >
              {submitting ? 'Test en cours...' : 'Tester la connexion'}
            </button>
          </form>
        )}

        {step === 'mfa' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleMfa();
            }}
            className="flex flex-col gap-md"
          >
            <p className="font-body-md text-mute">
              Garmin demande un code de verification (MFA).
            </p>
            <input
              type="text"
              required
              placeholder="Code MFA"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              className={inputClass}
            />
            <button
              type="submit"
              disabled={submitting}
              className={primaryButtonClass}
            >
              {submitting ? 'Validation...' : 'Valider le code'}
            </button>
          </form>
        )}

        {message && (
          <p
            className={`font-caption-md mt-md ${message.kind === 'success' ? 'text-success' : 'text-error'}`}
          >
            {message.text}
          </p>
        )}
      </section>
    </main>
  );
}
