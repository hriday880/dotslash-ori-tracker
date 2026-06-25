import { HashRouter, Routes, Route } from 'react-router-dom';
import PasswordGate from './components/PasswordGate';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import Members from './pages/Members';
import ClubFund from './pages/ClubFund';

function App() {
  return (
    <PasswordGate>
      <HashRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="projects" element={<Projects />} />
            <Route path="projects/:id" element={<ProjectDetail />} />
            <Route path="members" element={<Members />} />
            <Route path="fund" element={<ClubFund />} />
          </Route>
        </Routes>
      </HashRouter>
    </PasswordGate>
  );
}

export default App;
