import { CSSProperties, FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { api } from '../api';
import { HistoryMessage } from '../types';

type PlayResponse = {
  sceneId: string;
  sceneTitle: string;
  text: string;
  backgroundImageUrl: string | null;
  ended: boolean;
};

export default function GamePage() {
  const { gameId } = useParams<{ gameId: string }>();
  const [history, setHistory] = useState<HistoryMessage[]>([]);
  const [sceneId, setSceneId] = useState('');
  const [sceneTitle, setSceneTitle] = useState('');
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const [action, setAction] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showRestartModal, setShowRestartModal] = useState(false);
  const [revealStage, setRevealStage] = useState<'hidden' | 'image' | 'content'>('content');
  const logRef = useRef<HTMLDivElement>(null);
  const scrollAnimationRef = useRef<number | null>(null);

  if (!gameId) {
    return <Navigate to="/storylines" replace />;
  }

  useEffect(() => {
    const start = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await api.post<PlayResponse>(`/games/${gameId}/play/start`, {});
        setSceneId(response.data.sceneId);
        setSceneTitle(response.data.sceneTitle);
        setBackgroundImageUrl(response.data.backgroundImageUrl);
        setEnded(response.data.ended);
        setHistory([{ role: 'assistant', content: response.data.text }]);
      } catch {
        setError('Could not start this game.');
      } finally {
        setLoading(false);
      }
    };

    void start();
  }, [gameId]);

  useEffect(() => {
    const logElement = logRef.current;
    if (!logElement) {
      return;
    }

    if (scrollAnimationRef.current !== null) {
      cancelAnimationFrame(scrollAnimationRef.current);
      scrollAnimationRef.current = null;
    }

    const startTop = logElement.scrollTop;
    const targetTop = logElement.scrollHeight - logElement.clientHeight;
    const distance = targetTop - startTop;

    if (distance <= 0) {
      return;
    }

    const durationMs = 650;
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      const easedProgress = 1 - Math.pow(1 - progress, 3);

      logElement.scrollTop = startTop + distance * easedProgress;

      if (progress < 1) {
        scrollAnimationRef.current = requestAnimationFrame(animate);
      } else {
        scrollAnimationRef.current = null;
      }
    };

    scrollAnimationRef.current = requestAnimationFrame(animate);

    return () => {
      if (scrollAnimationRef.current !== null) {
        cancelAnimationFrame(scrollAnimationRef.current);
        scrollAnimationRef.current = null;
      }
    };
  }, [history, loading]);

  useEffect(() => {
    let imageFrameId: number | null = null;
    let contentTimerId: number | null = null;

    if (!backgroundImageUrl) {
      setRevealStage('content');
      return;
    }

    setRevealStage('hidden');
    imageFrameId = requestAnimationFrame(() => setRevealStage('image'));
    contentTimerId = window.setTimeout(() => setRevealStage('content'), 750);

    return () => {
      if (imageFrameId !== null) {
        cancelAnimationFrame(imageFrameId);
      }
      if (contentTimerId !== null) {
        window.clearTimeout(contentTimerId);
      }
    };
  }, [backgroundImageUrl, sceneId]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!action.trim() || loading || !sceneId || ended) {
      return;
    }

    const userAction = action.trim();
    const nextHistory: HistoryMessage[] = [...history, { role: 'user', content: userAction }];
    setHistory(nextHistory);
    setAction('');
    setLoading(true);
    setError('');

    try {
      const response = await api.post<PlayResponse>(`/games/${gameId}/play/action`, {
        sceneId,
        input: userAction
      });

      setSceneId(response.data.sceneId);
      setSceneTitle(response.data.sceneTitle);
      setBackgroundImageUrl(response.data.backgroundImageUrl);
      setEnded(response.data.ended);
      setHistory((prev) => [...prev, { role: 'assistant', content: response.data.text }]);
    } catch {
      setError('Could not process your action.');
    } finally {
      setLoading(false);
    }
  };

  const onActionKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  const onHint = async () => {
    if (loading || !sceneId || ended) {
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await api.post<PlayResponse>(`/games/${gameId}/play/action`, {
        sceneId,
        input: 'HINT'
      });

      setHistory((prev) => [...prev, { role: 'assistant', content: response.data.text }]);
    } catch {
      setError('Could not fetch a hint right now.');
    } finally {
      setLoading(false);
    }
  };

  const onConfirmRestart = async () => {
    if (loading) {
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await api.post<PlayResponse>(`/games/${gameId}/play/restart`, {});
      setSceneId(response.data.sceneId);
      setSceneTitle(response.data.sceneTitle);
      setBackgroundImageUrl(response.data.backgroundImageUrl);
      setEnded(response.data.ended);
      setHistory([{ role: 'assistant', content: response.data.text }]);
      setAction('');
      setShowRestartModal(false);
    } catch {
      setError('Could not restart this game.');
    } finally {
      setLoading(false);
    }
  };

  const revealClass = backgroundImageUrl
    ? revealStage === 'content'
      ? 'has-bg-image bg-visible content-visible'
      : revealStage === 'image'
        ? 'has-bg-image bg-visible'
        : 'has-bg-image'
    : 'content-visible';

  const sectionStyle = backgroundImageUrl
    ? ({ '--scene-bg-image': `url(${backgroundImageUrl})` } as CSSProperties)
    : undefined;

  return (
    <main className="screen with-nav game-screen">
      <Navbar onRestart={() => setShowRestartModal(true)} />
      <section className={`content game-layout ${revealClass}`} style={sectionStyle}>
        <div className="scene-bg-layer" aria-hidden="true" />
        <div className="scene-ui">
          <h1>{sceneTitle || 'Game'}</h1>
          <div className="log" ref={logRef}>
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
                onKeyDown={onActionKeyDown}
                rows={3}
                placeholder="Type your action, or tap Hint."
                disabled={ended}
              />
            </label>
            {error && <p className="error">{error}</p>}
            {ended && <p className="status">This path has reached an ending.</p>}
            <div className="action-row">
              <button className="ghost" type="button" onClick={onHint} disabled={loading || ended}>
                Hint
              </button>
              <button className="primary" type="submit" disabled={loading || ended}>
              Send action
              </button>
            </div>
          </form>
        </div>
      </section>

      {showRestartModal && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="restart-title">
            <h2 id="restart-title">Restart game?</h2>
            <p>Are you sure you want to restart the game? This action is irreversible and all progress will be lost.</p>
            <div className="modal-actions">
              <button className="primary" type="button" onClick={onConfirmRestart} disabled={loading}>
                Yes, I&apos;m sure.
              </button>
              <button className="ghost" type="button" onClick={() => setShowRestartModal(false)} disabled={loading}>
                Cancel
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}