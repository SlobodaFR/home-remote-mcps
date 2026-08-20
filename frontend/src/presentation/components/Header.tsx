import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `font-body-strong text-sm pb-1 border-b-2 ${isActive ? 'border-ink text-ink' : 'border-transparent text-mute hover:text-ink'}`;

export function Header() {
  const { user, logout } = useAuth();

  return (
    <header className="flex items-center justify-between px-xl h-14 bg-canvas border-b border-hairline">
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
        <span>{user?.email}</span>
        <button onClick={() => void logout()} className="hover:text-ink">
          Deconnexion
        </button>
      </div>
    </header>
  );
}
