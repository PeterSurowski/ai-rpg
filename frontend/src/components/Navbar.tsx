import { Link, useNavigate } from 'react-router-dom';
import { clearToken } from '../auth';

type NavbarProps = {
  onRestart?: () => void;
  onToggleImageView?: () => void;
  imageOnlyView?: boolean;
  canToggleImageView?: boolean;
};

export default function Navbar({ onRestart, onToggleImageView, imageOnlyView = false, canToggleImageView = true }: NavbarProps) {
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
        {onToggleImageView && (
          <button className="link-button" onClick={onToggleImageView} type="button" disabled={!canToggleImageView}>
            {imageOnlyView ? 'Hide image' : 'See image'}
          </button>
        )}
        <button className="link-button" onClick={handleLogout} type="button">
          Logout
        </button>
      </div>
    </header>
  );
}