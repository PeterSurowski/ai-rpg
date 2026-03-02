import { Navigate, Route, Routes } from 'react-router-dom';
import './App.css';
import ProtectedRoute from './ProtectedRoute';
import GamePage from './pages/GamePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import StorylinePage from './pages/StorylinePage';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/storylines"
        element={
          <ProtectedRoute>
            <StorylinePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/game/city-of-doors"
        element={
          <ProtectedRoute>
            <GamePage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/storylines" replace />} />
    </Routes>
  );
}

export default App;
