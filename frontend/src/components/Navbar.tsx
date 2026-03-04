import { Link, useNavigate } from 'react-router-dom';
import { clearToken } from '../auth';

type NavbarProps = {
  onRestart?: () => void;
};

export default function Navbar({ onRestart }: NavbarProps) {
  const navigate = useNavigate();

  const handleLogout = () => {
    clearToken();
    navigate('/login', { replace: true });
  };

  return (
    <header className="nav">
      <Link to="/storylines" className="brand">
        AI RPG
      </Link>
      <div className="nav-actions">
        {onRestart && (
          <button className="link-button" onClick={onRestart} type="button">
            Restart
          </button>
        )}
        <button className="link-button" onClick={handleLogout} type="button">
          Logout
        </button>
      </div>
    </header>
  );
}