import { DragEvent, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { api } from '../api';

type GameCard = {
  id: string;
  title: string;
  description: string;
  hasPlayers: boolean;
};

export default function StorylinePage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [games, setGames] = useState<GameCard[]>([]);
  const [loadingGames, setLoadingGames] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const loadGames = async () => {
      setLoadingGames(true);
      try {
        const response = await api.get<{ items: GameCard[] }>('/games');
        setGames(response.data.items);
      } catch {
        setErrorMessage('Could not load your games right now.');
      } finally {
        setLoadingGames(false);
      }
    };

    void loadGames();
  }, []);

  const setFile = (file: File | null) => {
    if (!file) {
      setSelectedFile(null);
      return;
    }

    if (!file.name.toLowerCase().endsWith('.zip')) {
      setErrorMessage('Only .zip files can be uploaded.');
      setSelectedFile(null);
      return;
    }

    setErrorMessage('');
    setSelectedFile(file);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0] ?? null;
    setFile(file);
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const uploadGame = async () => {
    if (!selectedFile || isUploading) {
      return;
    }

    setIsUploading(true);
    setErrorMessage('');

    const formData = new FormData();
    formData.append('gameZip', selectedFile);

    try {
      const response = await api.post('/games/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const uploadedGame: GameCard = {
        id: response.data.gameId,
        title: response.data.title,
        description: response.data.description,
        hasPlayers: false
      };
      setGames((prev) => [uploadedGame, ...prev]);
      navigate(`/games/${response.data.gameId}/players`);
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message ?? 'Upload failed.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <main className="screen with-nav">
      <Navbar />
      <section className="content">
        <div className="game-cards">
          {loadingGames && <p className="status">Loading your games…</p>}
          {!loadingGames && games.length === 0 && <p className="status">No games uploaded yet.</p>}
          {games.map((game) => (
            <button
              key={game.id}
              type="button"
              className="game-card"
              onClick={() => navigate(game.hasPlayers ? `/games/${game.id}/play` : `/games/${game.id}/players`)}
            >
              <h2>{game.title}</h2>
              <p>{game.description}</p>
            </button>
          ))}
        </div>

        <h2 className="subtle-headline">Upload a new game to start playing.</h2>
        <div
          className={`dropzone ${isDragging ? 'dragging' : ''}`}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            className="hidden-input"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <p>{selectedFile ? selectedFile.name : 'Drop your .zip file here or tap to select one.'}</p>
        </div>
        <button className="primary" type="button" onClick={uploadGame} disabled={!selectedFile || isUploading}>
          {isUploading ? 'Uploading…' : 'Upload game zip'}
        </button>
        {errorMessage && <p className="error">{errorMessage}</p>}
      </section>
    </main>
  );
}