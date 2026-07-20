import React, { useState, useEffect } from 'react';
import { collection } from 'firebase/firestore';
import { db, getDocs, subscribeToQuotaStatus } from '../lib/firebase';
import { Siswa, Mitra, Guru, Absensi, Jurnal } from '../types';
import { 
  Users, 
  MapPin, 
  UserCheck, 
  User,
  Phone, 
  AlertCircle, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Calendar,
  Building2,
  TrendingUp,
  FileText,
  Search,
  ExternalLink,
  Info,
  AlertTriangle
} from 'lucide-react';
import { format } from 'date-fns';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Legend,
  LineChart,
  Line
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';

export default function MonitoringDashboard() {
  const [data, setData] = useState<{
    siswas: Siswa[];
    mitras: Mitra[];
    gurus: Guru[];
    absensi: Absensi[];
    jurnals: Jurnal[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const today = format(new Date(), 'yyyy-MM-dd');

  useEffect(() => {
    return subscribeToQuotaStatus((exceeded) => {
      setQuotaExceeded(exceeded);
    });
  }, []);

  useEffect(() => {
    async function fetchAllData() {
      try {
        const [sSnap, mSnap, gSnap, aSnap, jSnap] = await Promise.all([
          getDocs(collection(db, 'siswa')),
          getDocs(collection(db, 'mitra')),
          getDocs(collection(db, 'guru')),
          getDocs(collection(db, 'absensi')),
          getDocs(collection(db, 'jurnal'))
        ]);

        setData({
          siswas: sSnap.docs.map(d => ({ id: d.id, ...d.data() } as Siswa)),
          mitras: mSnap.docs.map(d => ({ id: d.id, ...d.data() } as Mitra)),
          gurus: gSnap.docs.map(d => ({ id: d.id, ...d.data() } as Guru)),
          absensi: aSnap.docs.map(d => ({ id: d.id, ...d.data() } as Absensi)),
          jurnals: jSnap.docs.map(d => ({ id: d.id, ...d.data() } as Jurnal))
        });
      } catch (error) {
        console.error("Error monitoring data:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchAllData();
  }, []);

  if (loading || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">Memuat Dashboard Monitoring...</p>
        </div>
      </div>
    );
  }

  // Analytics Calculations
  const todayAbsensi = data.absensi.filter(a => a.tanggal === today);
  const absensiMap = new Map<string, Absensi>(todayAbsensi.map(a => [a.siswaId, a]));
  
  const mSiswa = data.siswas.map(s => {
    const absen = absensiMap.get(s.id);
    const statusLabel = absen 
      ? (absen.tipe === 'hadir' ? 'Hadir' : (absen.tipe === 'diluar_jangkauan' ? 'Luar Jangkauan' : (absen.alasanLibur || absen.tipe)))
      : 'Alpha (Belum Presensi)';
    
    const mitra = data.mitras.find(m => m.id === s.mitraId);
    const guru = data.gurus.find(g => g.id === s.guruId);
    const hasJurnal = data.jurnals.some(j => j.siswaId === s.id && j.tanggal === today);
    
    return {
      ...s,
      statusToday: statusLabel,
      absenData: absen,
      mitraData: mitra,
      guruData: guru,
      hasJurnalToday: hasJurnal
    };
  });

  const belumPresensi = mSiswa.filter(s => !s.absenData || s.absenData.tipe === 'diluar_jangkauan');
  const khusus = mSiswa.filter(s => {
    const st = s.statusToday.toLowerCase();
    return ['izin', 'sakit', 'libur', 'shift', 'kegiatan'].some(k => st.includes(k));
  });
  const hadir = mSiswa.filter(s => s.statusToday === 'Hadir');

  const journalRate = (mSiswa.filter(s => s.hasJurnalToday).length / mSiswa.length) * 100;
  const attendanceRate = (hadir.length / mSiswa.length) * 100;

  const chartData = [
    { name: 'Hadir', value: hadir.length, color: '#10b981' },
    { name: 'Belum Presensi', value: belumPresensi.length, color: '#ef4444' },
    { name: 'Izin/Sakit/Libur', value: khusus.length, color: '#f59e0b' },
  ];

  const filteredBelum = belumPresensi.filter(s => s.nama.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="min-h-screen bg-[#f8fafc] pb-20">
      {/* Header section with Stats */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-blue-100">
                <TrendingUp size={28} />
              </div>
              <div>
                <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">Monitoring Real-Time PKL</h1>
                <div className="mt-1">
                  <p className="text-sm font-bold text-blue-600 uppercase tracking-tight">SMK YPT 2 PURBALINGGA</p>
                  <p className="text-[10px] font-medium text-slate-500 uppercase tracking-widest mt-0.5">
                    Jl. Mayjend. Soengkono Km 3, Kalimanah, Purbalingga
                  </p>
                </div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-3 flex items-center gap-2">
                  <Calendar size={12} /> {format(new Date(), 'EEEE, d MMMM yyyy')}
                </p>
              </div>
            </div>

            <div className="flex gap-4 w-full md:w-auto">
                <div className="flex-1 md:w-64 relative group">
                  <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors" />
                  <input 
                    type="text" 
                    placeholder="Cari nama siswa..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                  />
                </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-8">
             <StatCard label="Total Siswa" value={mSiswa.length} icon={Users} color="blue" />
             <StatCard label="Hadir Hari Ini" value={hadir.length} icon={CheckCircle2} color="emerald" sub={`${attendanceRate.toFixed(1)}% Present`} />
             <StatCard label="Jurnal Terisi" value={mSiswa.filter(s => s.hasJurnalToday).length} icon={FileText} color="indigo" sub={`${journalRate.toFixed(1)}% Progress`} />
             <StatCard label="Belum Absen" value={belumPresensi.length} icon={AlertCircle} color="red" />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main List: Belum Presensi */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between px-2">
               <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                 <XCircle className="text-red-500" size={20} /> Siswa Belum Presensi
               </h2>
               <span className="text-[10px] font-bold text-red-500 bg-red-50 px-3 py-1 rounded-full border border-red-100">{filteredBelum.length} Orang</span>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {filteredBelum.map((s) => (
                <StudentMonitorCard key={s.id} student={s} color="red" />
              ))}
              {filteredBelum.length === 0 && (
                <div className="bg-white p-10 rounded-2xl border border-dashed border-slate-300 text-center">
                   <CheckCircle2 className="mx-auto text-emerald-400 mb-3" size={40} />
                   <p className="text-sm font-bold text-slate-400 uppercase tracking-widest italic">Semua siswa sudah melakukan presensi hari ini!</p>
                </div>
              )}
            </div>

            {/* Special Status List */}
            <div className="mt-12 space-y-6">
              <div className="flex items-center justify-between px-2">
                 <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                   <Info className="text-amber-500" size={20} /> Izin / Sakit / Libur
                 </h2>
                 <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-3 py-1 rounded-full border border-amber-100">{khusus.length} Orang</span>
              </div>
              <div className="grid grid-cols-1 gap-4">
                {khusus.map((s) => (
                  <StudentMonitorCard key={s.id} student={s} color="amber" />
                ))}
              </div>
            </div>
          </div>

          {/* Side Analytics */}
          <div className="space-y-8">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
               <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-6">Distribusi Kehadiran</h3>
               <div className="h-64">
                 <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={chartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                 </ResponsiveContainer>
               </div>
            </div>

            <div className="bg-blue-600 p-8 rounded-2xl shadow-xl shadow-blue-100 text-white relative overflow-hidden">
               <div className="relative z-10">
                 <p className="text-xs font-bold text-blue-200 uppercase tracking-widest mb-1">Total Journal Rate</p>
                 <div className="text-4xl font-black mb-4">{journalRate.toFixed(1)}%</div>
                 <div className="w-full bg-blue-500/30 h-2 rounded-full overflow-hidden">
                    <div className="bg-white h-full" style={{ width: `${journalRate}%` }} />
                 </div>
                 <p className="text-[10px] font-bold text-blue-100 mt-4 uppercase">Target PKL Mandiri: 100% Tiap Hari</p>
               </div>
               <FileText className="absolute -right-6 -bottom-6 text-white/10" size={120} />
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
               <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-2">
                 <Building2 size={16} className="text-slate-400" /> Kontak Kabeng Pantauan
               </h3>
               <div className="space-y-4">
                 {mSiswa.filter(s => s.noHpKepalaBengkel).slice(0, 5).map(s => (
                    <div key={s.id} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                       <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0">
                         <Phone size={14} className="text-indigo-500" />
                       </div>
                       <div className="min-w-0">
                          <p className="text-[11px] font-black text-slate-800 truncate uppercase tracking-tight">{s.kepalaBengkel}</p>
                          <p className="text-[9px] font-bold text-slate-400 truncate">{s.noHpKepalaBengkel} • {s.namaBengkel || s.mitraData?.namaMitra || 'Belum Ditentukan'}</p>
                       </div>
                    </div>
                 ))}
               </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color, sub }: any) {
  const colors: any = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    red: 'bg-red-50 text-red-600 border-red-100',
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
  };

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-5">
      <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${colors[color]} border shrink-0`}>
        <Icon size={24} />
      </div>
      <div>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</p>
        <p className="text-2xl font-black text-slate-800 leading-none">{value}</p>
        {sub && <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase">{sub}</p>}
      </div>
    </div>
  );
}

function StudentMonitorCard({ student, color }: any) {
  const mapsUrl = student.mitraData?.koordinatGPS 
    ? `https://www.google.com/maps?q=${student.mitraData.koordinatGPS.lat},${student.mitraData.koordinatGPS.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(student.alamatBengkel || student.mitraData?.alamat || student.namaBengkel || student.mitraData?.namaMitra || '')}`;

  return (
    <div className={`bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group hover:border-blue-300 transition-all border-l-4 ${color === 'red' ? 'border-l-red-500' : 'border-l-amber-500'}`}>
       <div className="flex flex-col sm:flex-row justify-between items-start gap-6 relative z-10">
          <div className="flex items-start gap-4 flex-1">
             <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg shrink-0 ${color === 'red' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
                {student.nama.charAt(0)}
             </div>
             <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1 border-b border-dashed border-slate-50 pb-1">
                  <h3 className="text-base font-black text-slate-800 uppercase tracking-tight truncate">{student.nama}</h3>
                  <span className={`text-[8px] font-bold px-2 py-0.5 rounded-full border tracking-widest uppercase shrink-0 ${color === 'red' ? 'bg-red-50 text-red-500 border-red-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                    {student.statusToday}
                  </span>
                </div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{student.kelas} • {student.jurusan}</p>
                {student.absenData?.keteranganLibur && (
                  <p className="text-[11px] text-slate-500 italic mt-1.5 bg-amber-50/50 border border-amber-100/30 rounded px-2.5 py-1.5 leading-relaxed max-w-sm">
                    Ket: "{student.absenData.keteranganLibur}"
                  </p>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 mt-4 pt-4 border-t border-slate-50">
                   <div className="flex items-center gap-2">
                     <Building2 size={12} className="text-blue-500" />
                     <span className="text-[10px] font-black text-slate-600 uppercase tracking-tighter truncate">{student.namaBengkel || student.mitraData?.namaMitra || 'BELUM TERDAFTAR'}</span>
                   </div>
                   <div className="flex items-center gap-2">
                     <UserCheck size={12} className="text-emerald-500" />
                     <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter truncate">Pbg: {student.guruData?.nama || '-'}</span>
                   </div>
                   <div className="flex items-center gap-2">
                     <User size={12} className="text-indigo-400" />
                     <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter truncate">Kabeng: {student.mitraData?.kepalaMitra || student.kepalaBengkel || '-'}</span>
                   </div>
                   {(student.mitraData?.noHp || student.noHpKepalaBengkel) && (
                     <div className="flex items-center gap-2">
                       <Phone size={12} className="text-slate-400" />
                       <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter truncate">HP: {student.mitraData?.noHp || student.noHpKepalaBengkel}</span>
                     </div>
                   )}
                </div>
             </div>
          </div>

          <div className="w-full sm:w-auto shrink-0 flex flex-col gap-2">
             <a 
              href={mapsUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 px-4 py-2 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 rounded-xl transition-all group/btn"
             >
               <MapPin size={14} className="text-blue-600 group-hover/btn:animate-bounce" />
               <span className="text-[10px] font-bold text-slate-700 uppercase tracking-widest">Lokasi Bengkel</span>
               <ExternalLink size={12} className="text-slate-300" />
             </a>
             {student.mitraData?.alamat && (
               <p className="text-[8px] font-bold text-slate-400 uppercase leading-relaxed max-w-[180px] text-center italic">
                 {student.mitraData.alamat}
               </p>
             )}
          </div>
       </div>
    </div>
  );
}
