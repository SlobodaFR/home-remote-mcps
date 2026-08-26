import { useEffect, useMemo, useState } from 'react';
import {
  apiClient,
  Credential,
  CookidooLocalization,
} from '../../infrastructure/api-client';

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

  const [cookidooLocalizations, setCookidooLocalizations] = useState<
    CookidooLocalization[]
  >([]);
  const [cookidooEmail, setCookidooEmail] = useState('');
  const [cookidooPassword, setCookidooPassword] = useState('');
  const [cookidooCountry, setCookidooCountry] = useState('');
  const [cookidooLanguage, setCookidooLanguage] = useState('');
  const [cookidooMessage, setCookidooMessage] = useState<Message | null>(null);
  const [cookidooSubmitting, setCookidooSubmitting] = useState(false);

  const [haBaseUrl, setHaBaseUrl] = useState('');
  const [haToken, setHaToken] = useState('');
  const [haMessage, setHaMessage] = useState<Message | null>(null);
  const [haSubmitting, setHaSubmitting] = useState(false);

  const [logsBasePath, setLogsBasePath] = useState('logs/');
  const [logsMessage, setLogsMessage] = useState<Message | null>(null);
  const [logsSubmitting, setLogsSubmitting] = useState(false);

  const [healthApiKey, setHealthApiKey] = useState('');
  const [healthMessage, setHealthMessage] = useState<Message | null>(null);
  const [healthSubmitting, setHealthSubmitting] = useState(false);

  const [ytClientId, setYtClientId] = useState('');
  const [ytClientSecret, setYtClientSecret] = useState('');
  const [ytMessage, setYtMessage] = useState<Message | null>(null);
  const [ytSubmitting, setYtSubmitting] = useState(false);

  const garmin = credentials.find((c) => c.service === 'garmin') ?? null;
  const homeAssistant =
    credentials.find((c) => c.service === 'home_assistant') ?? null;
  const logs = credentials.find((c) => c.service === 'logs') ?? null;
  const personalHealth =
    credentials.find((c) => c.service === 'personal_health') ?? null;
  const youtube = credentials.find((c) => c.service === 'youtube') ?? null;
  const cookidoo = credentials.find((c) => c.service === 'cookidoo') ?? null;

  const cookidooCountries = useMemo(
    () => [...new Set(cookidooLocalizations.map((l) => l.countryCode))].sort(),
    [cookidooLocalizations],
  );
  const cookidooLanguages = useMemo(
    () =>
      cookidooLocalizations
        .filter((l) => l.countryCode === cookidooCountry)
        .map((l) => l.language),
    [cookidooLocalizations, cookidooCountry],
  );

  function reload() {
    apiClient.fetchCredentials().then(setCredentials).catch(console.error);
  }

  useEffect(reload, []);

  useEffect(() => {
    apiClient
      .fetchCookidooLocalizations()
      .then((options) => {
        setCookidooLocalizations(options);
        if (options[0]) {
          setCookidooCountry(options[0].countryCode);
          setCookidooLanguage(options[0].language);
        }
      })
      .catch(console.error);
  }, []);

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

  async function handleConnectCookidoo() {
    setCookidooSubmitting(true);
    setCookidooMessage(null);
    try {
      const result = await apiClient.saveCookidooConnection(
        cookidooEmail,
        cookidooPassword,
        cookidooCountry,
        cookidooLanguage,
      );
      if (result.status === 'ok') {
        setCookidooMessage({
          kind: 'success',
          text: 'Connexion Cookidoo validee et stockee.',
        });
        setCookidooEmail('');
        setCookidooPassword('');
        reload();
      } else {
        setCookidooMessage({ kind: 'error', text: result.message });
      }
    } catch (error) {
      setCookidooMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Erreur inconnue',
      });
    } finally {
      setCookidooSubmitting(false);
    }
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

  async function handleConnectLogs() {
    setLogsSubmitting(true);
    setLogsMessage(null);
    try {
      const result = await apiClient.saveLogsConnection(logsBasePath);
      if (result.status === 'ok') {
        setLogsMessage({
          kind: 'success',
          text: 'Connexion logs validee et stockee.',
        });
        reload();
      } else {
        setLogsMessage({ kind: 'error', text: result.message });
      }
    } catch (error) {
      setLogsMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Erreur inconnue',
      });
    } finally {
      setLogsSubmitting(false);
    }
  }

  async function handleConnectPersonalHealth() {
    setHealthSubmitting(true);
    setHealthMessage(null);
    try {
      const result = await apiClient.savePersonalHealthConnection(healthApiKey);
      if (result.status === 'ok') {
        setHealthMessage({
          kind: 'success',
          text: 'Connexion Donnees de sante validee et stockee.',
        });
        setHealthApiKey('');
        reload();
      } else {
        setHealthMessage({ kind: 'error', text: result.message });
      }
    } catch (error) {
      setHealthMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Erreur inconnue',
      });
    } finally {
      setHealthSubmitting(false);
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
        {garmin ||
        cookidoo ||
        homeAssistant ||
        logs ||
        personalHealth ||
        youtube ? (
          <>
            {renderConnectedCard('Garmin Connect', garmin)}
            {renderConnectedCard('Cookidoo', cookidoo)}
            {renderConnectedCard('Home Assistant', homeAssistant)}
            {renderConnectedCard('Logs Docker', logs)}
            {renderConnectedCard('Donnees de sante', personalHealth)}
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
          {cookidoo ? 'Mettre a jour Cookidoo' : 'Connecter Cookidoo'}
        </h2>
        <p className="font-body-md text-mute mb-lg">
          Identifiants du compte Cookidoo (Thermomix). Ils ne sont pas stockes:
          seule la session obtenue apres connexion l&apos;est, chiffree.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleConnectCookidoo();
          }}
          className="flex flex-col gap-md"
        >
          <input
            type="email"
            required
            placeholder="Email Cookidoo"
            value={cookidooEmail}
            onChange={(e) => setCookidooEmail(e.target.value)}
            className={inputClass}
          />
          <input
            type="password"
            required
            placeholder="Mot de passe Cookidoo"
            value={cookidooPassword}
            onChange={(e) => setCookidooPassword(e.target.value)}
            className={inputClass}
          />
          <select
            required
            value={cookidooCountry}
            onChange={(e) => {
              const country = e.target.value;
              setCookidooCountry(country);
              const firstLanguage = cookidooLocalizations.find(
                (l) => l.countryCode === country,
              )?.language;
              if (firstLanguage) setCookidooLanguage(firstLanguage);
            }}
            className={inputClass}
          >
            {cookidooCountries.map((country) => (
              <option key={country} value={country}>
                {country.toUpperCase()}
              </option>
            ))}
          </select>
          <select
            required
            value={cookidooLanguage}
            onChange={(e) => setCookidooLanguage(e.target.value)}
            className={inputClass}
          >
            {cookidooLanguages.map((language) => (
              <option key={language} value={language}>
                {language}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={cookidooSubmitting}
            className={primaryButtonClass}
          >
            {cookidooSubmitting ? 'Test en cours...' : 'Tester la connexion'}
          </button>
        </form>

        {cookidooMessage && (
          <p
            className={`font-caption-md mt-md ${cookidooMessage.kind === 'success' ? 'text-success' : 'text-error'}`}
          >
            {cookidooMessage.text}
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
          {logs ? 'Mettre a jour Logs Docker' : 'Connecter Logs Docker'}
        </h2>
        <p className="font-body-md text-mute mb-lg">
          Prefixe (base path) dans le bucket MinIO partage ou Vector depose les
          logs Docker (voir le repo home-monitoring). Le reste (hosts, dates)
          est decouvert automatiquement en parcourant les dossiers - aucun
          identifiant a saisir ici, le bucket est deja configure cote serveur.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleConnectLogs();
          }}
          className="flex flex-col gap-md"
        >
          <input
            type="text"
            required
            placeholder="Base path (ex: logs/)"
            value={logsBasePath}
            onChange={(e) => setLogsBasePath(e.target.value)}
            className={inputClass}
          />
          <button
            type="submit"
            disabled={logsSubmitting}
            className={primaryButtonClass}
          >
            {logsSubmitting ? 'Test en cours...' : 'Tester la connexion'}
          </button>
        </form>

        {logsMessage && (
          <p
            className={`font-caption-md mt-md ${logsMessage.kind === 'success' ? 'text-success' : 'text-error'}`}
          >
            {logsMessage.text}
          </p>
        )}
      </section>

      <section className="bg-canvas border border-hairline p-xl">
        <h2 className="font-heading-lg mb-xs">
          {personalHealth
            ? 'Mettre a jour Donnees de sante'
            : 'Connecter Donnees de sante'}
        </h2>
        <p className="font-body-md text-mute mb-lg">
          Cle API issue de{' '}
          <a
            href="https://health.sloboda.fr"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            health.sloboda.fr
          </a>{' '}
          (genere-la depuis ton compte sur ce service, section cles API), pour
          relier ton compte remote-mcps a tes donnees Apple Health.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleConnectPersonalHealth();
          }}
          className="flex flex-col gap-md"
        >
          <input
            type="password"
            required
            placeholder="Cle API health.sloboda.fr"
            value={healthApiKey}
            onChange={(e) => setHealthApiKey(e.target.value)}
            className={inputClass}
          />
          <button
            type="submit"
            disabled={healthSubmitting}
            className={primaryButtonClass}
          >
            {healthSubmitting ? 'Test en cours...' : 'Tester la connexion'}
          </button>
        </form>

        {healthMessage && (
          <p
            className={`font-caption-md mt-md ${healthMessage.kind === 'success' ? 'text-success' : 'text-error'}`}
          >
            {healthMessage.text}
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
