import { useSearchParams } from 'react-router-dom';

export function LoginPage() {
  const [searchParams] = useSearchParams();
  const loggedOut = searchParams.get('logged_out') === '1';

  return (
    <main className="min-h-[100dvh] flex items-center justify-center px-lg bg-soft-cloud">
      <div className="w-full max-w-sm flex flex-col items-center gap-xl text-center">
        <h1 className="font-display uppercase text-display-campaign text-ink">
          Home MCPs
        </h1>
        <p className="font-body-md text-mute">
          Gateway MCP distant personnel - connecte tes services (Garmin, ...) et
          genere une cle API pour Claude.
        </p>
        {loggedOut && (
          <p role="status" className="font-body-md text-mute">
            Vous avez été déconnecté.
          </p>
        )}
        <a
          href="/api/auth/login"
          className="bg-ink text-on-primary font-button-md px-xl py-md rounded-full h-12 flex items-center"
        >
          Se connecter avec home-auth
        </a>
      </div>
    </main>
  );
}
