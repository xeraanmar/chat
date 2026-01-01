import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Login from './pages/Login';
import Chat from './pages/Chat';
import DbConfig from './pages/DbConfig';

function App() {
  return (
    <Router>
      <div className="h-screen w-screen bg-gray-950 text-white overflow-hidden font-sans">
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/db-config" element={<DbConfig />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
