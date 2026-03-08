import { CSSProperties, FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { api } from '../api';
import { HistoryMessage } from '../types';

type PlayResponse = {
  sceneId: string;
  sceneTitle: string;
  text: string;
  history: HistoryMessage[];
  backgroundImageUrl: string | null;
  ended: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
};

export default function GamePage() {
  const { gameId } = useParams<{ gameId: string }>();
  const [history, setHistory] = useState<HistoryMessage[]>([]);
  const [sceneId, setSceneId] = useState('');
  const [sceneTitle, setSceneTitle] = useState('');
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string | null>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [ended, setEnded] = useState(false);
  const [action, setAction] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showRestartModal, setShowRestartModal] = useState(false);
  const [imageOnlyView, setImageOnlyView] = useState(false);
  const [revealStage, setRevealStage] = useState<'hidden' | 'image' | 'content'>('content');
  const [sceneSwitching, setSceneSwitching] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const scrollAnimationRef = useRef<number | null>(null);
  const lastScrolledSceneIdRef = useRef<string>('');

  const sceneFadeDurationMs = 220;

  const applySceneResponse = async (
    data: PlayResponse,
    options?: {
      resetAction?: boolean;
      resetImageOnlyView?: boolean;
      forceSceneFade?: boolean;
    }
  ) => {
    const shouldFade =
      options?.forceSceneFade ?? (sceneId.length > 0 && data.sceneId.length > 0 && data.sceneId !== sceneId);

    if (shouldFade) {
      setSceneSwitching(true);
      await new Promise((resolve) => window.setTimeout(resolve, sceneFadeDurationMs));
    }

    setSceneId(data.sceneId);
    setSceneTitle(data.sceneTitle);
    setBackgroundImageUrl(data.backgroundImageUrl);
    setCanGoBack(data.canGoBack);
    setCanGoForward(data.canGoForward);
    setEnded(data.ended);
    setHistory(data.history.length > 0 ? data.history : [{ role: 'assistant', content: data.text }]);

    if (options?.resetAction) {
      setAction('');
    }

    if (options?.resetImageOnlyView) {
      setImageOnlyView(false);
    }

    if (shouldFade) {
      requestAnimationFrame(() => setSceneSwitching(false));
    }
  };

  if (!gameId) {
    return <Navigate to="/storylines" replace />;
  }

  useEffect(() => {
    const start = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await api.post<PlayResponse>(`/games/${gameId}/play/start`, {});
        await applySceneResponse(response.data);
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

    if (sceneId && lastScrolledSceneIdRef.current !== sceneId) {
      logElement.scrollTop = 0;
      lastScrolledSceneIdRef.current = sceneId;
      return;
    }

    if (scrollAnimationRef.current !== null) {
      cancelAnimationFrame(scrollAnimationRef.current);
      scrollAnimationRef.current = null;
    }

    const startTop = logElement.scrollTop;
    const userBubbles = logElement.querySelectorAll<HTMLElement>('article.bubble.user');
    const lastUserBubble = userBubbles[userBubbles.length - 1];

    let targetTop = logElement.scrollHeight - logElement.clientHeight;
    if (lastUserBubble) {
      const logRect = logElement.getBoundingClientRect();
      const userRect = lastUserBubble.getBoundingClientRect();
      targetTop = logElement.scrollTop + (userRect.top - logRect.top);
    }

    const maxScrollTop = Math.max(0, logElement.scrollHeight - logElement.clientHeight);
    targetTop = Math.min(Math.max(targetTop, 0), maxScrollTop);

    const distance = targetTop - startTop;

    if (Math.abs(distance) < 1) {
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
    imageFrameId = requestAnimationFrame(() => {
      setRevealStage('image');
      contentTimerId = window.setTimeout(() => setRevealStage('content'), 1000);
    });

    return () => {
      if (imageFrameId !== null) {
        cancelAnimationFrame(imageFrameId);
      }
      if (contentTimerId !== null) {
        window.clearTimeout(contentTimerId);
      }
    };
  }, [backgroundImageUrl, sceneId]);

  useEffect(() => {
    if (!backgroundImageUrl) {
      setImageOnlyView(false);
    }
  }, [backgroundImageUrl]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!action.trim() || loading || !sceneId || ended) {
      return;
    }

    const userAction = action.trim();
    const previousHistory = history;
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

      await applySceneResponse(response.data);
    } catch {
      setHistory(previousHistory);
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

      await applySceneResponse(response.data);
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
      await applySceneResponse(response.data, { resetAction: true, resetImageOnlyView: true, forceSceneFade: true });
      setShowRestartModal(false);
    } catch {
      setError('Could not restart this game.');
    } finally {
      setLoading(false);
    }
  };

  const onBack = async () => {
    if (loading || !canGoBack) {
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await api.post<PlayResponse>(`/games/${gameId}/play/back`, {});
      await applySceneResponse(response.data, { resetAction: true, resetImageOnlyView: true, forceSceneFade: true });
    } catch {
      setError('Could not go back to the previous scene.');
    } finally {
      setLoading(false);
    }
  };

  const onForward = async () => {
    if (loading || !canGoForward) {
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await api.post<PlayResponse>(`/games/${gameId}/play/forward`, {});
      await applySceneResponse(response.data, { resetAction: true, resetImageOnlyView: true, forceSceneFade: true });
    } catch {
      setError('Could not go forward to the next scene.');
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

  const displayClass = [revealClass, imageOnlyView ? 'image-only-view' : '', sceneSwitching ? 'scene-switching' : '']
    .filter(Boolean)
    .join(' ');

  const sectionStyle = backgroundImageUrl
    ? ({ '--scene-bg-image': `url(${backgroundImageUrl})` } as CSSProperties)
    : undefined;

  return (
    <main className="screen with-nav game-screen">
      <Navbar
        onBack={onBack}
        canGoBack={canGoBack}
        onForward={onForward}
        canGoForward={canGoForward}
        onRestart={() => setShowRestartModal(true)}
        onToggleImageView={() => setImageOnlyView((prev) => !prev)}
        imageOnlyView={imageOnlyView}
        canToggleImageView={Boolean(backgroundImageUrl)}
      />
      <section className={`content game-layout ${displayClass}`} style={sectionStyle}>
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