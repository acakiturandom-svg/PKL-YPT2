
import React, { useState } from 'react';
import { AuthProvider, useAuth } from './lib/auth';
import Login from './components/Login';
import Layout from './components/Layout';
import MonitoringDashboard from './components/MonitoringDashboard';
import AdminDash from './components/dashboards/AdminDash';
import SiswaDash from './components/dashboards/SiswaDash';
import GuruDash from './components/dashboards/GuruDash';
import MitraDash from './components/dashboards/MitraDash';
import { Loader2 } from 'lucide-react';

function AppContent() {
  const { role, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState('beranda');
  const [showMonitor, setShowMonitor] = useState(window.location.hash === '#monitor');

  // Sync hash with state
  React.useEffect(() => {
    const handleHashChange = () => setShowMonitor(window.location.hash === '#monitor');
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-600" size={40} />
      </div>
    );
  }

  if (showMonitor) {
    return (
      <>
        <div className="fixed top-4 right-4 z-50">
          <button 
            onClick={() => { window.location.hash = ''; setShowMonitor(false); }}
            className="bg-white/80 backdrop-blur border border-slate-200 px-4 py-2 rounded-xl text-xs font-black text-slate-800 shadow-sm uppercase tracking-widest hover:bg-white transition-all"
          >
            Kembali ke Login
          </button>
        </div>
        <MonitoringDashboard />
      </>
    );
  }

  if (!role) {
    return <Login />;
  }

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
      {role === 'admin' && <AdminDash activeTab={activeTab} />}
      {role === 'siswa' && <SiswaDash activeTab={activeTab} />}
      {role === 'guru' && <GuruDash activeTab={activeTab} />}
      {role === 'mitra' && <MitraDash activeTab={activeTab} />}
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
