import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { RaceControl } from './pages/RaceControl';

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<RaceControl />} />
          <Route path="/strategy" element={<div className="p-8 text-gray-400">Strategy Console (Coming Soon)</div>} />
          <Route path="/narrative" element={<div className="p-8 text-gray-400">Narrative Hub (Coming Soon)</div>} />
          <Route path="/team" element={<div className="p-8 text-gray-400">Team Management (Coming Soon)</div>} />
          <Route path="/settings" element={<div className="p-8 text-gray-400">Settings (Coming Soon)</div>} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
