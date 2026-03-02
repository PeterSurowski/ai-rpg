import { FormEvent, useEffect, useState } from 'react';
import Navbar from '../components/Navbar';
import { api } from '../api';
import { HistoryMessage } from '../types';

export default function GamePage() {
  const [history, setHistory] = useState<HistoryMessage[]>([]);
  const [action, setAction] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const start = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await api.post('/game/start', { storyline: 'City of Doors' });
        setHistory([{ role: 'assistant', content: response.data.text }]);
      } catch {
        setError('Could not start the storyline.');
      } finally {
        setLoading(false);
      }
    };

    void start();
  }, []);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!action.trim() || loading) {
      return;
    }

    const userAction = action.trim();
    const nextHistory: HistoryMessage[] = [...history, { role: 'user', content: userAction }];
    setHistory(nextHistory);
    setAction('');
    setLoading(true);
    setError('');

    try {
      const response = await api.post('/game/continue', {
        storyline: 'City of Doors',
        action: userAction,
        history: nextHistory
      });
      setHistory((prev) => [...prev, { role: 'assistant', content: response.data.text }]);
    } catch {
      setError('Could not continue the adventure.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="screen with-nav">
      <Navbar />
      <section className="content game-layout">
        <h1>City of Doors</h1>
        <div className="log">
          {history.map((item, index) => (
            <article key={`${item.role}-${index}`} className={`bubble ${item.role}`}>
              <p>{item.content}</p>
            </article>
          ))}
          {loading && <p className="status">Thinking…</p>}
        </div>

        <form className="action-form" onSubmit={onSubmit}>
          <label className="field">
            <span>What do you do?</span>
            <textarea
              value={action}
              onChange={(event) => setAction(event.target.value)}
              rows={3}
              placeholder="Ex: Open the brass door and listen first."
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="primary" type="submit" disabled={loading}>
            Send action
          </button>
        </form>
      </section>
    </main>
  );
}