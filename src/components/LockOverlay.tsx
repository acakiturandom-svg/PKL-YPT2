import React, { useState, useEffect } from 'react';
import { Lock, Clock, ArrowRight, LogOut } from 'lucide-react';
import { motion } from 'motion/react';
import { getNextOpenTime } from '../lib/utils';

interface LockOverlayProps {
  onBypass?: () => void;
  onLogout?: () => void;
  showBypassButton?: boolean;
  showLogoutButton?: boolean;
  roleContext?: string;
}

export default function LockOverlay({
  onBypass,
  onLogout,
  showBypassButton = false,
  showLogoutButton = false,
  roleContext
}: LockOverlayProps) {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const updateTimer = () => {
      const nextOpen = getNextOpenTime();
      const now = new Date();
      const diff = nextOpen.getTime() - now.getTime();
      
      if (diff <= 0) {
        window.location.reload();
        return;
      }
      
      const hrs = Math.floor(diff / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diff % (1000 * 60)) / 1000);
      
      setTimeLeft(
        `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
      );
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200 overflow-hidden"
      >
        <div className="p-10 text-center">
          <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-2xl mx-auto mb-6 flex items-center justify-center shadow-sm border border-amber-100 animate-pulse">
             <Lock size={32} />
          </div>
          
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">SiPKL Dikunci</h1>
          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.2em] mt-2 mb-6">
            {roleContext ? `Sesi ${roleContext} Dibatasi` : 'Sistem Pembatasan Waktu'}
          </p>
          
          <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-5 mb-8 text-center">
            <p className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-2 flex items-center justify-center gap-1.5">
              <Clock size={14} /> Jam Operasional Selesai
            </p>
            <p className="text-sm font-semibold text-amber-900 leading-relaxed">
              Aplikasi akan dibuka besok jam 6 pagi sampai jam 18.00 sore.
            </p>
          </div>

          {timeLeft && (
            <div className="mb-8">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Aplikasi Dibuka Dalam</p>
              <div className="flex justify-center gap-2">
                {timeLeft.split(':').map((unit, idx) => (
                  <div key={idx} className="flex items-center">
                    <div className="bg-slate-900 text-white rounded-xl px-4 py-3 font-mono text-2xl font-bold min-w-[56px] shadow-sm">
                      {unit}
                    </div>
                    {idx < 2 && <span className="text-xl font-bold text-slate-300 px-1 animate-pulse">:</span>}
                  </div>
                ))}
              </div>
              <div className="flex justify-center gap-12 mt-2 text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                <span>JAM</span>
                <span>MENIT</span>
                <span>DETIK</span>
              </div>
            </div>
          )}

          {showBypassButton && onBypass && (
            <button
              onClick={onBypass}
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3.5 px-4 rounded-xl transition-all border border-slate-200/60 flex items-center justify-center gap-2 text-xs uppercase tracking-wider hover:text-slate-900"
            >
              <span>Masuk Khusus Guru / Admin</span>
              <ArrowRight size={14} />
            </button>
          )}

          {showLogoutButton && onLogout && (
            <button
              onClick={onLogout}
              className="w-full bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold py-3.5 px-4 rounded-xl transition-all border border-rose-100/60 flex items-center justify-center gap-2 text-xs uppercase tracking-wider hover:text-rose-700"
            >
              <LogOut size={14} />
              <span>Keluar dari Aplikasi</span>
            </button>
          )}
        </div>
        
        <div className="bg-slate-50 border-t border-slate-100 p-6 flex flex-col items-center gap-2 text-center">
          <p className="text-[10px] font-bold text-slate-500">
            SMK YPT 2 PURBALINGGA
          </p>
          <p className="text-[9px] text-slate-400 font-medium leading-normal">
            Aktivitas pengisian jurnal harian, absensi kehadiran, dan pelaporan PKL hanya diizinkan pada jam operasional resmi (06.00 s/d 18.00).
          </p>
        </div>
      </motion.div>
    </div>
  );
}
