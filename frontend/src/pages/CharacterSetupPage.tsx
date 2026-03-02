import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { saveCharacterSetup } from '../characterSetup';
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
  const navigate = useNavigate();
  const [characters, setCharacters] = useState<StoryCharacters>(emptyCharacters);
  const [error, setError] = useState('');

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
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

    saveCharacterSetup(payload);
    navigate('/game/city-of-doors');
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
          <button className="primary" type="submit">
            Begin City of Doors
          </button>
        </form>
      </section>
    </main>
  );
}