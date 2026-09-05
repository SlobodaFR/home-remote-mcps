import { useEffect, useState } from 'react';
import {
  apiClient,
  ApiKeySummary,
  CreatedApiKey,
} from '../../infrastructure/api-client';

const inputClass =
  'bg-soft-cloud rounded px-md py-sm font-body-md text-ink placeholder:text-mute outline-none focus:ring-2 focus:ring-ink flex-1';
const primaryButtonClass =
  'bg-ink text-on-primary font-button-md rounded-full h-12 px-xl disabled:opacity-50';

function CopyableUrl({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mb-md">
      <p className="font-caption-sm text-mute mb-xs">{label}</p>
      <div className="flex items-stretch gap-sm">
        <code className="block flex-1 bg-canvas border border-hairline p-md break-all">
          {url}
        </code>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="shrink-0 bg-ink text-on-primary font-button-md rounded px-md"
        >
          {copied ? 'Copie !' : 'Copier'}
        </button>
      </div>
    </div>
  );
}

export function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeySummary[]>([]);
  const [label, setLabel] = useState('');
  const [created, setCreated] = useState<CreatedApiKey | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reload() {
    apiClient.fetchApiKeys().then(setKeys).catch(console.error);
  }

  useEffect(reload, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const result = await apiClient.createApiKey(label || 'Claude');
      setCreated(result);
      setLabel('');
      reload();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke(id: string) {
    await apiClient.revokeApiKey(id);
    reload();
  }

  return (
    <main className="max-w-xl mx-auto px-lg sm:px-xl py-xl sm:py-section flex flex-col gap-xl sm:gap-section">
      <section className="bg-canvas border border-hairline p-xl">
        <h2 className="font-heading-lg mb-xs">Nouvelle cle API</h2>
        <p className="font-body-md text-mute mb-lg">
          Colle l&apos;URL generee dans Claude (Parametres &gt; Connecteurs &gt;
          Ajouter un connecteur personnalise).
        </p>
        <form
          onSubmit={(e) => void handleCreate(e)}
          className="flex flex-col sm:flex-row gap-md"
        >
          <input
            type="text"
            placeholder="Nom (ex: Claude mobile)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className={inputClass}
          />
          <button
            type="submit"
            disabled={submitting}
            className={primaryButtonClass}
          >
            Generer
          </button>
        </form>

        {created && (
          <div className="mt-lg bg-soft-cloud p-lg font-caption-md">
            <p className="text-warning font-body-strong mb-sm">
              Ces URLs ne seront plus jamais affichees. Copie-les maintenant.
            </p>
            <CopyableUrl label="Garmin" url={created.mcpUrl} />
            <CopyableUrl
              label="Home Assistant"
              url={created.homeAssistantMcpUrl}
            />
            <CopyableUrl label="Cookidoo" url={created.cookidooMcpUrl} />
            <CopyableUrl label="Logs Docker" url={created.logsMcpUrl} />
            <CopyableUrl
              label="Donnees de sante"
              url={created.personalHealthMcpUrl}
            />
            <CopyableUrl label="YouTube" url={created.youtubeMcpUrl} />
            <CopyableUrl
              label="Instagram (remplace <account-name> par le nom choisi pour chaque compte connecte sur la page Identifiants)"
              url={created.instagramMcpUrlTemplate}
            />
          </div>
        )}
      </section>

      <section>
        <h2 className="font-heading-lg mb-md">Cles existantes</h2>
        <ul className="flex flex-col gap-sm">
          {keys.map((key) => (
            <li
              key={key.id}
              className="bg-canvas border border-hairline p-md flex flex-col sm:flex-row sm:items-center sm:justify-between gap-sm font-caption-md"
            >
              <div>
                <div className="font-body-strong">{key.label}</div>
                <div className="text-mute font-caption-sm">
                  {key.revokedAt
                    ? `Revoquee le ${new Date(key.revokedAt).toLocaleDateString('fr-FR')}`
                    : key.lastUsedAt
                      ? `Derniere utilisation: ${new Date(key.lastUsedAt).toLocaleString('fr-FR')}`
                      : 'Jamais utilisee'}
                </div>
              </div>
              {!key.revokedAt && (
                <button
                  onClick={() => void handleRevoke(key.id)}
                  className="self-start text-error hover:underline rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-error"
                >
                  Revoquer
                </button>
              )}
            </li>
          ))}
          {keys.length === 0 && (
            <p className="font-body-md text-mute">Aucune cle pour le moment.</p>
          )}
        </ul>
      </section>
    </main>
  );
}
