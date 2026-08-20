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
    <main className="max-w-xl mx-auto px-xl py-section flex flex-col gap-section">
      <section className="bg-canvas border border-hairline p-xl">
        <h2 className="font-heading-lg mb-xs">Nouvelle cle API</h2>
        <p className="font-body-md text-mute mb-lg">
          Colle l&apos;URL generee dans Claude (Parametres &gt; Connecteurs &gt;
          Ajouter un connecteur personnalise).
        </p>
        <form onSubmit={(e) => void handleCreate(e)} className="flex gap-md">
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
          <div className="mt-lg bg-soft-cloud p-lg font-caption-md break-all">
            <p className="text-warning font-body-strong mb-sm">
              Cette URL ne sera plus jamais affichee. Copie-la maintenant.
            </p>
            <code className="block bg-canvas border border-hairline p-md">
              {created.mcpUrl}
            </code>
          </div>
        )}
      </section>

      <section>
        <h2 className="font-heading-lg mb-md">Cles existantes</h2>
        <ul className="flex flex-col gap-sm">
          {keys.map((key) => (
            <li
              key={key.id}
              className="bg-canvas border border-hairline p-md flex items-center justify-between font-caption-md"
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
                  className="text-error hover:underline"
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
