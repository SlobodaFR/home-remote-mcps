import { useEffect, useState } from 'react';
import { apiClient, Credential } from '../../infrastructure/api-client';

type Step = 'form' | 'mfa';
interface Message {
  kind: 'success' | 'error';
  text: string;
}

const STATUS_LABEL: Record<Credential['status'], string> = {
  ok: 'Connecte',
  failed: 'Echec',
  pending_mfa: 'En attente',
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
  const [message, setMessage] = useState<Message | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [haBaseUrl, setHaBaseUrl] = useState('');
  const [haToken, setHaToken] = useState('');
  const [haMessage, setHaMessage] = useState<Message | null>(null);
  const [haSubmitting, setHaSubmitting] = useState(false);

  const [ytClientId, setYtClientId] = useState('');
  const [ytClientSecret, setYtClientSecret] = useState('');
  const [ytMessage, setYtMessage] = useState<Message | null>(null);
  const [ytSubmitting, setYtSubmitting] = useState(false);

  const garmin = credentials.find((c) => c.service === 'garmin') ?? null;
  const homeAssistant =
    credentials.find((c) => c.service === 'home_assistant') ?? null;
  const youtube = credentials.find((c) => c.service === 'youtube') ?? null;

  function reload() {
    apiClient.fetchCredentials().then(setCredentials).catch(console.error);
  }

  useEffect(reload, []);

  // Google redirects back here after the consent screen (see
  // CompleteYoutubeConnectionUseCase) - surface the result once, then strip
  // the query string so a page refresh doesn't re-show it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const youtubeResult = params.get('youtube');
    if (!youtubeResult) return;
    setYtMessage(
      youtubeResult === 'ok'
        ? { kind: 'success', text: 'Connexion YouTube validee et stockee.' }
        : {
            kind: 'error',
            text: params.get('message') ?? 'Erreur de connexion YouTube',
          },
    );
    window.history.replaceState(null, '', window.location.pathname);
    reload();
  }, []);

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

  async function handleConnectHomeAssistant() {
    setHaSubmitting(true);
    setHaMessage(null);
    try {
      const result = await apiClient.saveHomeAssistantConnection(
        haBaseUrl,
        haToken,
      );
      if (result.status === 'ok') {
        setHaMessage({
          kind: 'success',
          text: 'Connexion Home Assistant validee et stockee.',
        });
        setHaBaseUrl('');
        setHaToken('');
        reload();
      } else {
        setHaMessage({ kind: 'error', text: result.message });
      }
    } catch (error) {
      setHaMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Erreur inconnue',
      });
    } finally {
      setHaSubmitting(false);
    }
  }

  async function handleConnectYoutube() {
    setYtSubmitting(true);
    setYtMessage(null);
    try {
      const result = await apiClient.startYoutubeConnection(
        ytClientId,
        ytClientSecret,
      );
      window.location.href = result.authorizeUrl;
    } catch (error) {
      setYtMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Erreur inconnue',
      });
      setYtSubmitting(false);
    }
  }

  function renderConnectedCard(label: string, credential: Credential | null) {
    if (!credential) return null;
    return (
      <div
        key={credential.id}
        className="bg-canvas border border-hairline p-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-md"
      >
        <div>
          <div className="font-body-strong">{label}</div>
          <div className={`font-caption-md ${STATUS_CLASS[credential.status]}`}>
            {STATUS_LABEL[credential.status]}
          </div>
          {credential.lastError && (
            <div className="font-caption-sm text-error mt-xs">
              {credential.lastError}
            </div>
          )}
          {credential.lastTestedAt && (
            <div className="font-caption-sm text-mute mt-xs">
              Dernier test:{' '}
              {new Date(credential.lastTestedAt).toLocaleString('fr-FR')}
            </div>
          )}
        </div>
        <button
          onClick={() => void handleDelete(credential.id)}
          className="self-start font-caption-md text-error hover:underline rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-error"
        >
          Supprimer
        </button>
      </div>
    );
  }

  return (
    <main className="max-w-xl mx-auto px-lg sm:px-xl py-xl sm:py-section flex flex-col gap-xl sm:gap-section">
      <section className="flex flex-col gap-md">
        <h2 className="font-heading-lg mb-md">Services connectes</h2>
        {garmin || homeAssistant || youtube ? (
          <>
            {renderConnectedCard('Garmin Connect', garmin)}
            {renderConnectedCard('Home Assistant', homeAssistant)}
            {renderConnectedCard('YouTube', youtube)}
          </>
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

      <section className="bg-canvas border border-hairline p-xl">
        <h2 className="font-heading-lg mb-xs">
          {homeAssistant
            ? 'Mettre a jour Home Assistant'
            : 'Connecter Home Assistant'}
        </h2>
        <p className="font-body-md text-mute mb-lg">
          URL de base de ton instance HAOS (ex:
          https://mon-domicile.duckdns.org:8123 ou l&apos;URL distante Nabu
          Casa) et un jeton d&apos;acces longue duree (Profil &gt; Securite &gt;
          Jetons d&apos;acces de longue duree, dans Home Assistant).
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleConnectHomeAssistant();
          }}
          className="flex flex-col gap-md"
        >
          <input
            type="url"
            required
            placeholder="URL Home Assistant (ex: https://mon-domicile.duckdns.org:8123)"
            value={haBaseUrl}
            onChange={(e) => setHaBaseUrl(e.target.value)}
            className={inputClass}
          />
          <input
            type="password"
            required
            placeholder="Jeton d'acces longue duree"
            value={haToken}
            onChange={(e) => setHaToken(e.target.value)}
            className={inputClass}
          />
          <button
            type="submit"
            disabled={haSubmitting}
            className={primaryButtonClass}
          >
            {haSubmitting ? 'Test en cours...' : 'Tester la connexion'}
          </button>
        </form>

        {haMessage && (
          <p
            className={`font-caption-md mt-md ${haMessage.kind === 'success' ? 'text-success' : 'text-error'}`}
          >
            {haMessage.text}
          </p>
        )}
      </section>

      <section className="bg-canvas border border-hairline p-xl">
        <h2 className="font-heading-lg mb-xs">
          {youtube ? 'Mettre a jour YouTube' : 'Connecter YouTube'}
        </h2>
        <p className="font-body-md text-mute mb-md">
          Cree un client OAuth 2.0 (type &quot;Application Web&quot;) sur la{' '}
          <a
            href="https://console.cloud.google.com/apis/credentials"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Google Cloud Console
          </a>
          , active les APIs &quot;YouTube Data API v3&quot; et &quot;YouTube
          Analytics API&quot;, puis ajoute cette URI de redirection autorisee:
        </p>
        <code className="block bg-soft-cloud p-md mb-lg font-caption-sm break-all">
          {window.location.origin}/api/credentials/youtube/callback
        </code>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleConnectYoutube();
          }}
          className="flex flex-col gap-md"
        >
          <input
            type="text"
            required
            placeholder="Client ID"
            value={ytClientId}
            onChange={(e) => setYtClientId(e.target.value)}
            className={inputClass}
          />
          <input
            type="password"
            required
            placeholder="Client Secret"
            value={ytClientSecret}
            onChange={(e) => setYtClientSecret(e.target.value)}
            className={inputClass}
          />
          <button
            type="submit"
            disabled={ytSubmitting}
            className={primaryButtonClass}
          >
            {ytSubmitting ? 'Redirection...' : 'Continuer avec Google'}
          </button>
        </form>

        {ytMessage && (
          <p
            className={`font-caption-md mt-md ${ytMessage.kind === 'success' ? 'text-success' : 'text-error'}`}
          >
            {ytMessage.text}
          </p>
        )}
      </section>
    </main>
  );
}
