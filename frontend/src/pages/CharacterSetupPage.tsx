import { FormEvent, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { api } from '../api';
import { StoryCharacters } from '../types';

const MIN_PARAGRAPH_LENGTH = 120;

const emptyCharacters: StoryCharacters = {
  player: {
    name: '',
    gender: '',
    background: ''
  },
  support: {
    name: '',
    gender: '',
    background: ''
  }
};

export default function CharacterSetupPage() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const [characters, setCharacters] = useState<StoryCharacters>(emptyCharacters);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!gameId) {
    return <Navigate to="/storylines" replace />;
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (loading) {
      return;
    }

    setError('');

    const playerBackground = characters.player.background.trim();
    const supportBackground = characters.support.background.trim();

    if (playerBackground.length < MIN_PARAGRAPH_LENGTH || supportBackground.length < MIN_PARAGRAPH_LENGTH) {
      setError('Please provide at least one paragraph of background for each character (120+ characters each).');
      return;
    }

    if (!characters.player.name.trim() || !characters.player.gender.trim()) {
      setError('Please complete name and gender for your character.');
      return;
    }

    if (!characters.support.name.trim() || !characters.support.gender.trim()) {
      setError('Please complete name and gender for your supporting character.');
      return;
    }

    const payload: StoryCharacters = {
      player: {
        name: characters.player.name.trim(),
        gender: characters.player.gender.trim(),
        background: playerBackground
      },
      support: {
        name: characters.support.name.trim(),
        gender: characters.support.gender.trim(),
        background: supportBackground
      }
    };

    setLoading(true);
    try {
      await api.post(`/games/${gameId}/players`, payload);
      navigate(`/games/${gameId}/play`, { replace: true });
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message ?? 'Could not save player information.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="screen with-nav">
      <Navbar />
      <section className="content">
        <h1>Character setup</h1>
        <form className="stack" onSubmit={onSubmit}>
          <section className="character-block">
            <h2>Your character</h2>
            <label className="field">
              <span>Name</span>
              <input
                type="text"
                value={characters.player.name}
                onChange={(event) =>
                  setCharacters((prev) => ({ ...prev, player: { ...prev.player, name: event.target.value } }))
                }
                required
              />
            </label>
            <label className="field">
              <span>Gender</span>
              <input
                type="text"
                value={characters.player.gender}
                onChange={(event) =>
                  setCharacters((prev) => ({ ...prev, player: { ...prev.player, gender: event.target.value } }))
                }
                required
              />
            </label>
            <label className="field">
              <span>Background (at least one paragraph)</span>
              <textarea
                rows={6}
                value={characters.player.background}
                onChange={(event) =>
                  setCharacters((prev) => ({ ...prev, player: { ...prev.player, background: event.target.value } }))
                }
                required
              />
            </label>
          </section>

          <section className="character-block">
            <h2>Main supporting character</h2>
            <label className="field">
              <span>Name</span>
              <input
                type="text"
                value={characters.support.name}
                onChange={(event) =>
                  setCharacters((prev) => ({ ...prev, support: { ...prev.support, name: event.target.value } }))
                }
                required
              />
            </label>
            <label className="field">
              <span>Gender</span>
              <input
                type="text"
                value={characters.support.gender}
                onChange={(event) =>
                  setCharacters((prev) => ({ ...prev, support: { ...prev.support, gender: event.target.value } }))
                }
                required
              />
            </label>
            <label className="field">
              <span>Background (at least one paragraph)</span>
              <textarea
                rows={6}
                value={characters.support.background}
                onChange={(event) =>
                  setCharacters((prev) => ({ ...prev, support: { ...prev.support, background: event.target.value } }))
                }
                required
              />
            </label>
          </section>

          {error && <p className="error">{error}</p>}
          <button className="primary" type="submit" disabled={loading}>
            {loading ? 'Saving…' : 'Save player information'}
          </button>
        </form>
      </section>
    </main>
  );
}