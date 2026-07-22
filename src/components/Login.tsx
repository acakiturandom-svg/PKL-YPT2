
import React, { useState } from 'react';
import { useAuth } from '../lib/auth';
import { UserRole } from '../types';
import { Shield, User, UserCheck, Building2, Loader2, AlertCircle } from 'lucide-react';
import { cn, isAppLocked } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import LockOverlay from './LockOverlay';

export default function Login() {
  const [activeRole, setActiveRole] = useState<UserRole>('siswa');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isBypassed, setIsBypassed] = useState(false);
  const { loginAdmin, loginOthers } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const trimmedUsername = username.trim();

      // Lockout verification at login submission level
      if (isAppLocked() && (activeRole === 'siswa' || activeRole === 'mitra')) {
        throw new Error('Maaf, login untuk Siswa dan Mitra PKL dikunci antara jam 18.00 sore s/d 06.00 pagi.');
      }

      if (activeRole === 'admin') {
        await loginAdmin(trimmedUsername, password);
      } else {
        await loginOthers(activeRole, trimmedUsername, password);
      }
    } catch (err: any) {
      setError(err.message || 'Login gagal. Periksa kembali kredensial Anda.');
    } finally {
      setIsLoading(false);
    }
  };

  const roles = [
    { id: 'siswa', label: 'SISWA', icon: User },
    { id: 'guru', label: 'GURU', icon: UserCheck },
    { id: 'mitra', label: 'MITRA', icon: Building2 },
    { id: 'admin', label: 'ADMIN', icon: Shield },
  ];

  const isLocked = isAppLocked();

  if (isLocked && !isBypassed) {
    return (
      <LockOverlay 
        showBypassButton={true}
        onBypass={() => setIsBypassed(true)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200 overflow-hidden"
      >
        <div className="p-10">
          <div className="text-center mb-10">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-lg shadow-blue-200">
               <Shield className="text-white" size={32} />
            </div>
            <h1 className="text-3xl font-bold text-slate-800 tracking-tight">SiPKL</h1>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.2em] mt-2">SMK YPT 2 PURBALINGGA</p>
          </div>

          <div className="grid grid-cols-4 bg-slate-50 p-1 rounded-xl mb-8 border border-slate-200">
            {roles.map((role) => {
              const isActive = activeRole === role.id;
              const Icon = role.icon;
              return (
                <button
                  key={role.id}
                  onClick={() => {
                    setActiveRole(role.id as UserRole);
                    setUsername('');
                    setPassword('');
                    setError('');
                  }}
                  className={cn(
                    "flex flex-col items-center py-2.5 rounded-lg transition-all",
                    isActive ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
                  )}
                >
                  <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                  <span className="text-[9px] mt-1.5 font-bold tracking-tight">{role.label}</span>
                </button>
              );
            })}
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                IDENTITAS PENGGUNA ({activeRole})
              </label>
              <input
                type={activeRole === 'admin' ? 'email' : 'text'}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={activeRole === 'admin' ? 'Email Admin' : 'NIS / ID Pengguna'}
                className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all placeholder:text-slate-300 font-semibold text-slate-700"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                KATA SANDI
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all placeholder:text-slate-300 font-semibold text-slate-700"
                required
              />
            </div>

            <AnimatePresence>
              {error && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="flex items-center gap-3 p-4 bg-rose-50 text-rose-600 rounded-xl text-xs font-semibold border border-rose-100"
                >
                  <AlertCircle size={18} className="shrink-0" />
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-slate-200 flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-70 mt-4"
            >
              {isLoading ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                <span className="text-sm tracking-wide">MASUK KE DASHBOARD</span>
              )}
            </button>
          </form>
        </div>
        <div className="bg-slate-50 border-t border-slate-100 p-6 flex flex-col items-center gap-4">
            <button 
              onClick={() => window.location.hash = 'monitor'}
              className="text-[10px] text-blue-600 font-black uppercase tracking-[0.2em] hover:text-blue-700 transition-colors bg-blue-50 px-4 py-2 rounded-lg border border-blue-100"
            >
              Monitor Real-Time PKL
            </button>
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.3em]">Build with Precision</p>
        </div>
      </motion.div>
    </div>
  );
}
