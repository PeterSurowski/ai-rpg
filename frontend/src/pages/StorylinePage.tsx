import { DragEvent, useRef, useState } from 'react';
import Navbar from '../components/Navbar';
import { api } from '../api';

export default function StorylinePage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

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
    setStatusMessage('');
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
    setStatusMessage('');

    const formData = new FormData();
    formData.append('gameZip', selectedFile);

    try {
      const response = await api.post('/games/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setStatusMessage(
        `Upload complete. JSON files: ${response.data.jsonFiles}. WEBP files: ${response.data.webpFiles}.`
      );
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
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
        <h1>Upload a new game to start playing.</h1>
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
        {statusMessage && <p className="status">{statusMessage}</p>}
        {errorMessage && <p className="error">{errorMessage}</p>}
      </section>
    </main>
  );
}