import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Championships } from './pages/Championships';
import { ChampionshipDetails } from './pages/ChampionshipDetails';
import { WeekendDetails } from './pages/WeekendDetails';
import { RaceControl } from './pages/RaceControl';
import { TeamHub } from './pages/TeamHub';
import { ResearchDevelopment } from './pages/ResearchDevelopment';
import { Facilities } from './pages/Facilities';
import { Settings } from './pages/Settings';
import { TeamSelection } from './pages/TeamSelection';
import { OfflineChampionship } from './pages/OfflineChampionship';
import { OfflineWeekend } from './pages/OfflineWeekend';
import { PracticeQualiDev } from './pages/PracticeQualiDev';
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return <div className="flex h-screen items-center justify-center bg-[#111] text-white">Loading...</div>;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/race-dev" element={<RaceControl devMode />} />
        <Route path="/practice-quali-dev" element={<PracticeQualiDev />} />
        <Route path="/offline" element={<OfflineChampionship />} />
        <Route path="/offline/weekend" element={<OfflineWeekend />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <Layout>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/championships" element={<Championships />} />
                  <Route path="/championships/:id/select-team" element={<TeamSelection />} />
                  <Route path="/championships/:id" element={<ChampionshipDetails />} />
                  <Route path="/weekends/:id" element={<WeekendDetails />} />
                  <Route path="/race/:weekendId" element={<RaceControl />} />
                  <Route path="/team-hub" element={<TeamHub />} />
                  <Route path="/research" element={<ResearchDevelopment />} />
                  <Route path="/facilities" element={<Facilities />} />
                  <Route path="/settings" element={<Settings />} />
                </Routes>
              </Layout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
