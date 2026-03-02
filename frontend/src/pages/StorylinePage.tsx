import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';

export default function StorylinePage() {
  const navigate = useNavigate();

  const startGame = () => {
    navigate('/game/city-of-doors');
  };

  return (
    <main className="screen with-nav">
      <Navbar />
      <section className="content">
        <h1>Choose your storyline</h1>
        <div className="storyline-column">
          <button className="story-card" type="button" onClick={startGame}>
            <h2>City of Doors</h2>
            <p>A sprawling city where every door might lead to another world.</p>
          </button>
        </div>
      </section>
    </main>
  );
}