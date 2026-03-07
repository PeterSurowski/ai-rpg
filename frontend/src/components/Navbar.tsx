import { Link, useNavigate } from 'react-router-dom';
import { clearToken } from '../auth';

type NavbarProps = {
  onBack?: () => void;
  canGoBack?: boolean;
  onForward?: () => void;
  canGoForward?: boolean;
  onRestart?: () => void;
  onToggleImageView?: () => void;
  imageOnlyView?: boolean;
  canToggleImageView?: boolean;
};

export default function Navbar({
  onBack,
  canGoBack = false,
  onForward,
  canGoForward = false,
  onRestart,
  onToggleImageView,
  imageOnlyView = false,
  canToggleImageView = true
}: NavbarProps) {
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
        {onBack && (
          <button className="link-button" onClick={onBack} type="button" disabled={!canGoBack} aria-label="Back">
            &lt;
          </button>
        )}
        {onForward && (
          <button
            className="link-button"
            onClick={onForward}
            type="button"
            disabled={!canGoForward}
            aria-label="Forward"
          >
            &gt;
          </button>
        )}
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