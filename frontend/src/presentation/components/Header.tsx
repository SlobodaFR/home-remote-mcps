import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `font-body-strong text-sm pb-1 border-b-2 ${isActive ? 'border-ink text-ink' : 'border-transparent text-mute hover:text-ink'}`;

const logoutButtonClass =
  'font-caption-md text-mute hover:text-ink rounded px-sm py-xs -mx-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';

export function Header() {
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-10 bg-canvas border-b border-hairline">
      {/* Mobile (<sm): brand + logout on one line, nav as a second full-width
          row below it. Squeezing brand + nav + email + logout into a single
          row (the sm+ layout) overflows well before a 375px viewport. */}
      <div className="flex sm:hidden items-center justify-between px-lg h-12">
        <span className="font-display uppercase tracking-tight text-base truncate">
          Home Remote MCPs
        </span>
        <button onClick={() => void logout()} className={logoutButtonClass}>
          Deconnexion
        </button>
      </div>
      <nav className="flex sm:hidden gap-lg px-lg h-11 items-center border-t border-hairline overflow-x-auto">
        <NavLink to="/" className={linkClass} end>
          Credentials
        </NavLink>
        <NavLink to="/api-keys" className={linkClass}>
          Cles API
        </NavLink>
      </nav>

      <div className="hidden sm:flex items-center justify-between px-xl h-14">
        <div className="flex items-center gap-xl">
          <span className="font-display uppercase tracking-tight text-lg">
            Home Remote MCPs
          </span>
          <nav className="flex gap-lg">
            <NavLink to="/" className={linkClass} end>
              Credentials
            </NavLink>
            <NavLink to="/api-keys" className={linkClass}>
              Cles API
            </NavLink>
          </nav>
        </div>
        <div className="flex items-center gap-md font-caption-md text-mute">
          <span className="truncate max-w-[240px]">{user?.email}</span>
          <button onClick={() => void logout()} className={logoutButtonClass}>
            Deconnexion
          </button>
        </div>
      </div>
    </header>
  );
}
