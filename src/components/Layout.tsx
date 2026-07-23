
import React from 'react';
import { Home, Users, UserCheck, Building2, BookOpen, ClipboardCheck, User, LogOut, MoreHorizontal, AlertTriangle } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';
import { format } from 'date-fns';
import { subscribeToQuotaStatus } from '../lib/firebase';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export default function Layout({ children, activeTab, setActiveTab }: LayoutProps) {
  const { role, logout, profile } = useAuth();
  const [quotaExceeded, setQuotaExceeded] = React.useState(false);

  React.useEffect(() => {
    return subscribeToQuotaStatus((exceeded) => {
      setQuotaExceeded(exceeded);
    });
  }, []);

  const getNavItems = () => {
    switch (role) {
      case 'admin':
        return [
          { id: 'beranda', label: 'Overview', icon: Home },
          { id: 'siswa', label: 'Siswa', icon: Users },
          { id: 'guru', label: 'Guru', icon: UserCheck },
          { id: 'mitra', label: 'Mitra', icon: Building2 },
          { id: 'monitoring', label: 'Log Aktivitas', icon: MoreHorizontal },
        ];
      case 'siswa':
        return [
          { id: 'beranda', label: 'Home', icon: Home },
          { id: 'jurnal', label: 'Jurnal', icon: BookOpen },
          { id: 'absensi', label: 'Presensi', icon: ClipboardCheck },
          { id: 'pengaturan', label: 'Pengaturan', icon: MoreHorizontal },
          { id: 'profil', label: 'Profil', icon: User },
        ];
      case 'guru':
        return [
          { id: 'beranda', label: 'Home', icon: Home },
          { id: 'jurnal', label: 'Monitoring', icon: BookOpen },
          { id: 'siswa', label: 'Bimbingan', icon: Users },
          { id: 'profil', label: 'Akun', icon: User },
        ];
      case 'mitra':
        return [
          { id: 'beranda', label: 'Home', icon: Home },
          { id: 'siswa', label: 'Siswa', icon: Users },
          { id: 'jurnal', label: 'Laporan', icon: BookOpen },
          { id: 'kehadiran', label: 'Kehadiran', icon: ClipboardCheck },
          { id: 'profil', label: 'Mitra', icon: User },
        ];
      default:
        return [];
    }
  };

  const navItems = getNavItems();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="flex-1 flex flex-col md:flex-row">
        {/* Sidebar Desktop */}
      <aside className="hidden md:flex w-64 bg-white border-r border-slate-200 flex-col sticky top-0 h-screen z-50">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shrink-0">
              <ClipboardCheck size={24} />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-xl tracking-tight leading-none text-slate-800">SiPKL</h1>
              <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase truncate">SMK YPT 2 PBG</p>
            </div>
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-semibold",
                    isActive 
                      ? "bg-blue-600 text-white shadow-md shadow-blue-200" 
                      : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                  )}
                >
                  <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto p-6">
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-sm font-bold shadow-sm border border-slate-100">
                {profile?.nama?.charAt(0) || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold truncate text-slate-800">{profile?.nama || 'User'}</p>
                <p className="text-[10px] text-slate-400 uppercase font-bold mt-0.5">{role}</p>
              </div>
            </div>
            <button 
              onClick={() => logout()}
              className="w-full py-2.5 bg-white border border-slate-200 hover:bg-rose-50 hover:border-rose-100 hover:text-rose-600 text-slate-500 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2"
            >
              <LogOut size={14} />
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Topbar */}
      <header className="md:hidden bg-white border-b border-slate-200 p-4 flex justify-between items-center sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white">
            <ClipboardCheck size={18} />
          </div>
          <h1 className="font-bold text-xl tracking-tighter text-slate-800">SiPKL</h1>
        </div>
        <button 
          onClick={() => logout()}
          className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-500"
        >
          <LogOut size={18} />
        </button>
      </header>

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        {quotaExceeded && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-xs text-amber-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-600 shrink-0" />
              <span>
                <strong>Informasi Firebase Blaze Upgrade:</strong> Pembatasan kuota gratis Firestore masih aktif karena proses propagasi kuota Google Cloud memerlukan waktu ±15-45 menit setelah upgrade.
              </span>
            </div>
            <button 
              onClick={() => window.location.reload()} 
              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-bold shrink-0 transition-colors"
            >
              Cek Ulang Database
            </button>
          </div>
        )}
        <header className="hidden md:flex h-16 bg-white border-b border-slate-200 items-center px-8 sticky top-0 z-30">
          <h2 className="text-slate-800 font-bold text-lg">
            {navItems.find(i => i.id === activeTab)?.label || 'Dashboard'}
          </h2>
          <div className="ml-auto flex items-center gap-4 text-slate-400 text-xs font-bold uppercase tracking-wider">
             {format(new Date(), 'EEEE, d MMMM yyyy')}
          </div>
        </header>

        <main className="flex-1 p-4 md:p-8">
          <div className="mx-auto max-w-5xl">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Nav */}
      <nav className="md:hidden fixed bottom-4 left-4 right-4 bg-white border border-slate-200 h-16 rounded-2xl flex items-center justify-around px-2 shadow-xl shadow-slate-200/50 z-50">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={cn(
                "flex flex-col items-center justify-center transition-all p-2 rounded-xl flex-1",
                isActive ? "text-blue-600 bg-blue-50" : "text-slate-400"
              )}
            >
              <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[8px] font-bold mt-1 uppercase tracking-tighter">{item.label}</span>
            </button>
          );
        })}
      </nav>
      </div>
    </div>
  );
}
