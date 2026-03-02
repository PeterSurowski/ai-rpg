import { Link, useNavigate } from 'react-router-dom';
import { clearToken } from '../auth';

export default function Navbar() {
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
      <button className="link-button" onClick={handleLogout} type="button">
        Logout
      </button>
    </header>
  );
}