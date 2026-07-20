
import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, onSnapshot, addDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../lib/auth';
import { Siswa, Jurnal, Guru, Mitra } from '../../types';
import { Users, BookOpen, AlertCircle, Loader2, Search, UserCheck, User, Phone, Building2, X, Download } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';

export default function GuruDash({ activeTab }: { activeTab: string }) {
  const { profile } = useAuth();
  const guru = profile as Guru;
  const [siswaList, setSiswaList] = useState<Siswa[]>([]);
  const [mitras, setMitras] = useState<Mitra[]>([]);
  const [jurnals, setJurnals] = useState<Jurnal[]>([]);
  const [allAbsensi, setAllAbsensi] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const today = format(new Date(), 'yyyy-MM-dd');

  useEffect(() => {
    async function fetchMitras() {
      const snap = await getDocs(collection(db, 'mitra'));
      setMitras(snap.docs.map(d => ({ id: d.id, ...d.data() } as Mitra)));
    }
    fetchMitras();
  }, []);

  useEffect(() => {
    async function fetchData() {
      const sQ = query(collection(db, 'siswa'), where('guruId', '==', guru.id));
      const sSnap = await getDocs(sQ);
      const sData = sSnap.docs.map(d => ({ id: d.id, ...d.data() } as Siswa));
      setSiswaList(sData);

      if (sData.length > 0) {
        const studentIds = sData.map(s => s.id);
        
        let supervisedJurnals: Jurnal[] = [];
        let supervisedAbsensi: any[] = [];
        
        // Chunk studentIds into arrays of max 30 to stay within Firestore 'in' query limit
        const chunks: string[][] = [];
        for (let i = 0; i < studentIds.length; i += 30) {
          chunks.push(studentIds.slice(i, i + 30));
        }
        
        const jurnalPromises = chunks.map(chunk => 
          getDocs(query(collection(db, 'jurnal'), where('siswaId', 'in', chunk)))
        );
        const absensiPromises = chunks.map(chunk => 
          getDocs(query(collection(db, 'absensi'), where('siswaId', 'in', chunk)))
        );
        
        const [jSnaps, aSnaps] = await Promise.all([
          Promise.all(jurnalPromises),
          Promise.all(absensiPromises)
        ]);
        
        const jDocs = jSnaps.flatMap(snap => snap.docs.map(d => ({ id: d.id, ...d.data() } as Jurnal)));
        const aDocs = aSnaps.flatMap(snap => snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
        
        supervisedJurnals = jDocs.sort((a, b) => b.tanggal.localeCompare(a.tanggal));
        supervisedAbsensi = aDocs;

        setJurnals(supervisedJurnals);
        setAllAbsensi(supervisedAbsensi);
      } else {
        setJurnals([]);
        setAllAbsensi([]);
      }
      
      setIsLoading(false);
    }
    fetchData();
  }, [guru.id]);

  const daysMap: any = {
    'Sunday': 'Minggu',
    'Monday': 'Senin',
    'Tuesday': 'Selasa',
    'Wednesday': 'Rabu',
    'Thursday': 'Kamis',
    'Friday': 'Jumat',
    'Saturday': 'Sabtu'
  };

  const getDayName = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return daysMap[format(d, 'EEEE')] || format(d, 'EEEE');
    } catch {
      return '';
    }
  };

  const getStats = (siswaId: string) => {
    const sAbsen = allAbsensi.filter((a: any) => a.siswaId === siswaId);
    const student = siswaList.find((s: any) => s.id === siswaId);
    const tMulai = student?.tanggalMulai;
    const tSelesai = student?.tanggalSelesai;
    
    // Calculate Alphas by checking past 30 days
    const activeAlphas: string[] = [];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    
    const curr = new Date();
    curr.setHours(0, 0, 0, 0);

    for (let d = new Date(startDate); d < curr; d.setDate(d.getDate() + 1)) {
      const dateStr = format(d, 'yyyy-MM-dd');
      if (tMulai && dateStr < tMulai) {
        continue;
      }
      if (tSelesai && dateStr > tSelesai) {
        continue;
      }
      const found = sAbsen.find((a: any) => a.tanggal === dateStr);
      if (!found) {
        activeAlphas.push(dateStr);
      }
    }

    // Create a 14-day history for the sparkline/timeline
    const last14Days = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = format(d, 'yyyy-MM-dd');
      const found = sAbsen.find((a: any) => a.tanggal === dateStr);
      
      let status = 'none';
      if (found) {
        status = found.tipe;
      } else if (dateStr < today) {
        if (tMulai && dateStr < tMulai) {
          status = 'none';
        } else if (tSelesai && dateStr > tSelesai) {
          status = 'none';
        } else {
          status = 'alpha';
        }
      }

      last14Days.push({
        tanggal: dateStr,
        status: status,
        dayName: daysMap[format(d, 'EEEE')] || format(d, 'EEEE').substring(0, 3)
      });
    }

    const virtualAbsensi = [...sAbsen];
    activeAlphas.forEach(date => {
      if (!virtualAbsensi.find(v => v.tanggal === date)) {
        virtualAbsensi.push({ tanggal: date, tipe: 'alpha', auto: true });
      }
    });

    return {
      hadir: sAbsen.filter((a: any) => a.tipe === 'hadir').length,
      alpha: sAbsen.filter((a: any) => a.tipe === 'tidak_absen' || a.tipe === 'alpha').length + activeAlphas.length,
      ijin: sAbsen.filter((a: any) => {
        const r = (a.alasanLibur || '').toLowerCase();
        return a.tipe === 'ijin' || a.tipe === 'izin' || r.includes('izin');
      }).length,
      sakit: sAbsen.filter((a: any) => {
        const r = (a.alasanLibur || '').toLowerCase();
        return a.tipe === 'sakit' || r.includes('sakit');
      }).length,
      libur: sAbsen.filter((a: any) => {
        const r = (a.alasanLibur || '').toLowerCase();
        const isEx = a.tipe === 'libur' || a.tipe === 'ijin' || a.tipe === 'izin' || a.tipe === 'sakit';
        return isEx && !r.includes('izin') && !r.includes('sakit');
      }).length,
      history: virtualAbsensi.sort((a: any, b: any) => b.tanggal.localeCompare(a.tanggal)),
      timeline: last14Days.reverse(),
      rawAlphasList: activeAlphas
    };
  };

  const getCompleteHistoryRecords = () => {
    const list: any[] = [];
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    
    // Sort students by name
    const sortedSiswa = [...siswaList].sort((a, b) => a.nama.localeCompare(b.nama));
    
    sortedSiswa.forEach((s: any) => {
      // PKL date range for each student
      let startScanStr = s.tanggalMulai;
      let endScanStr = s.tanggalSelesai || todayStr;
      
      if (!startScanStr) {
        // If no start date, default to last 14 days
        const defaultStart = new Date();
        defaultStart.setDate(defaultStart.getDate() - 14);
        startScanStr = format(defaultStart, 'yyyy-MM-dd');
      }
      
      const startDate = new Date(startScanStr);
      let endDate = new Date(endScanStr < todayStr ? endScanStr : todayStr); // limit scan to today
      
      // Safety guards
      if (isNaN(startDate.getTime())) {
        startDate.setTime(new Date().getTime() - 14 * 24 * 60 * 60 * 1000);
      }
      if (isNaN(endDate.getTime())) {
        endDate = new Date();
      }
      
      const sAbsen = allAbsensi.filter((a: any) => a.siswaId === s.id);
      const sJurnals = jurnals.filter((j: any) => j.siswaId === s.id);
      
      // Let's loop from endDate down to startDate (newest first)
      let currDate = new Date(endDate);
      let iterations = 0;
      
      while (currDate >= startDate && iterations < 180) {
        iterations++;
        const dStr = format(currDate, 'yyyy-MM-dd');
        
        // Find if they have an attendance record for this day
        const absen = sAbsen.find((a: any) => a.tanggal === dStr);
        // Find if they have a journal record for this day
        const jurnal = sJurnals.find((j: any) => j.tanggal === dStr);
        
        let status = 'Alpha';
        let keteranganDetails = '-';
        
        if (absen) {
          if (absen.tipe === 'hadir') {
            status = 'Hadir';
          } else if (absen.tipe === 'libur' || absen.tipe === 'ijin' || absen.tipe === 'izin' || absen.tipe === 'sakit') {
            const subReason = (absen.alasanLibur || 'Libur/Izin').toUpperCase();
            if (subReason.includes('IZIN') || subReason.includes('IJIN')) {
              status = 'Izin';
            } else if (subReason.includes('SAKIT')) {
              status = 'Sakit';
            } else {
              status = 'Libur';
            }
            keteranganDetails = absen.keteranganLibur || absen.alasanLibur || '-';
          } else if (absen.tipe === 'tidak_absen' || absen.tipe === 'alpha') {
            status = 'Alpha';
          }
        }
        
        list.push({
          id: `${s.id}_${dStr}`,
          siswaId: s.id,
          siswaNama: s.nama,
          tanggal: dStr,
          jamCheckin: absen?.jamCheckin || '-',
          kegiatan: jurnal?.kegiatan || '-',
          statusAbsen: status,
          keteranganAbsen: status === 'Alpha' ? 'Belum Presensi' : (absen?.keteranganLibur || absen?.alasanLibur || '-'),
          absenData: absen,
          jurnalData: jurnal
        });
        
        // Decrement date by 1 day
        currDate.setDate(currDate.getDate() - 1);
      }
    });
    
    // Sort by date descending, then by student name
    return list.sort((a, b) => {
      const dateCompare = b.tanggal.localeCompare(a.tanggal);
      if (dateCompare !== 0) return dateCompare;
      return a.siswaNama.localeCompare(b.siswaNama);
    });
  };

  const handleDownloadRekap = () => {
    const historicalRecords = getCompleteHistoryRecords();
    
    const data = historicalRecords.map((r: any) => {
      return {
        'NAMA SISWA': r.siswaNama,
        'TANGGAL': r.tanggal ? `${getDayName(r.tanggal)}, ${format(new Date(r.tanggal), 'dd/MM/yyyy')}` : '-',
        'JAM MASUK': r.jamCheckin,
        'STATUS PRESENSI': r.statusAbsen,
        'KETERANGAN / DILUAR JAM / KETERANGAN ALPHA': r.keteranganAbsen,
        'ISI LAPORAN JURNAL': r.kegiatan || '-'
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Layanan Monitoring");
    XLSX.writeFile(wb, `Rekap_Laporan_Monitoring_${guru.nama}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const handleDownloadMitra = () => {
    const data = siswaList.map((s: any) => {
      const mitra = mitras.find(m => m.id === s.mitraId);
      return {
        'NAMA SISWA': s.nama,
        'NIS': s.nis,
        'NAMA MITRA INDUSTRI': mitra?.namaMitra || s.namaMitraManual || 'Belum Penempatan',
        'ALAMAT': mitra?.alamat || s.alamatManual || '-',
        'NAMA KEPALA BENGKEL': mitra?.kepalaMitra || s.kepalaBengkel || '-',
        'NOMOR HP KEPALA BENGKEL': mitra?.noHp || s.noHpKepalaBengkel || '-'
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data Penempatan Mitra");
    XLSX.writeFile(wb, `Rekap_Mitra_Bimbingan_${guru.nama}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  if (isLoading) return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-blue-900" /></div>;

  return (
    <div className="space-y-6">
      {activeTab === 'beranda' && <GuruBeranda guru={guru} siswaList={siswaList} jurnals={jurnals} mitras={mitras} allAbsensi={allAbsensi} getStats={getStats} getDayName={getDayName} today={today} />}
      {activeTab === 'jurnal' && <JurnalMonitor records={getCompleteHistoryRecords()} onDownload={handleDownloadRekap} />}
      {activeTab === 'siswa' && <SiswaBimbingan siswaList={siswaList} mitras={mitras} onDownload={handleDownloadMitra} />}
      {activeTab === 'profil' && <ProfilSection guru={guru} />}
    </div>
  );
}

function GuruBeranda({ guru, siswaList, jurnals, mitras, allAbsensi, getStats, getDayName, today }: any) {
  const jToday = jurnals.filter((j: any) => j.tanggal === today);
  const absensiToday = allAbsensi.filter((a: any) => a.tanggal === today);
  const [selectedSiswa, setSelectedSiswa] = useState<any>(null);

  return (
    <div className="space-y-6">
      <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-center md:text-left">
            <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Monitoring Harian Siswa</h2>
            <p className="text-sm text-slate-500 mt-1">Pantau kehadiran dan jurnal siswa bimbingan Anda secara real-time.</p>
            <div className="mt-4 flex items-center gap-2 justify-center md:justify-start">
               <div className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
               <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Update: {getDayName(today)}, {format(new Date(), 'dd/MM/yyyy')}</span>
            </div>
          </div>
        </div>
        <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
           <Users size={80} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-12 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-6 uppercase tracking-wider">
            <UserCheck size={18} className="text-blue-500" />
            Status Presensi & Aktivitas Siswa
          </h3>
          <div className="space-y-3">
            {siswaList.map((s: any) => {
              const absen = absensiToday.find((a: any) => a.siswaId === s.id);
              const jurnal = jToday.find((j: any) => j.siswaId === s.id);
              const mitra = mitras.find((m: any) => m.id === s.mitraId);
              const stats = getStats(s.id);

              let statusColor = 'bg-rose-100 text-rose-600 border-rose-200';
              let statusText = 'ALPHA';

              if (absen) {
                if (absen.tipe === 'hadir') {
                  statusColor = 'bg-emerald-100 text-emerald-600 border-emerald-200';
                  statusText = 'HADIR';
                } else if (absen.tipe === 'libur' || absen.tipe === 'ijin' || absen.tipe === 'izin' || absen.tipe === 'sakit') {
                  const subReason = (absen.alasanLibur || 'LIBUR').toUpperCase();
                  if (subReason.includes('IZIN') || subReason.includes('SAKIT')) {
                    statusColor = 'bg-amber-100 text-amber-600 border-amber-200';
                  } else {
                    statusColor = 'bg-slate-100 text-slate-500 border-slate-200';
                  }
                  statusText = subReason;
                }
              }

              return (
                <div key={s.id} className="bg-white p-4 rounded-xl flex flex-col xl:flex-row justify-between items-stretch border border-slate-100 hover:border-blue-200 transition-all gap-4">
                  <div className="flex items-center gap-4 w-full xl:w-1/4">
                    <div className="w-12 h-12 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center font-black border border-slate-100 uppercase shrink-0">
                      {s.nama.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">{s.nama}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider truncate">{s.kelas} • {s.jurusan}</p>
                      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                         <span className={cn("px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border", statusColor)}>
                            {statusText} {absen?.jamCheckin ? `• ${absen.jamCheckin}` : ''}
                         </span>
                         <span className={cn("px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border", 
                            jurnal ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-slate-50 text-slate-300 border-slate-100'
                         )}>
                            {jurnal ? 'Laporan Ada' : 'Belum Lapor'}
                         </span>
                      </div>
                      {absen?.keteranganLibur && (
                        <p className="mt-1.5 text-[10px] text-slate-500 font-medium italic bg-amber-50/50 border border-amber-100/30 rounded px-2.5 py-1 max-w-[240px] leading-relaxed">
                          Ket: "{absen.keteranganLibur}"
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col justify-center gap-2 flex-1 border-y xl:border-y-0 xl:border-x border-slate-50 py-4 xl:py-0 xl:px-4">
                    <div className="flex justify-between items-center mb-1">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Aktivitas 14 Hari Terakhir</p>
                      <span className="text-[9px] font-bold text-slate-300 italic">PKL Daily Timeline</span>
                    </div>
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-hide">
                       {stats.timeline.map((day: any, i: number) => {
                          let dotColor = 'bg-slate-100 border-slate-200';
                          if (day.status === 'hadir') dotColor = 'bg-emerald-500 border-emerald-600 shadow-sm shadow-emerald-100';
                          if (day.status === 'alpha' || day.status === 'tidak_absen') dotColor = 'bg-rose-500 border-rose-600 shadow-sm shadow-rose-100';
                          if (day.status === 'ijin' || day.status === 'izin' || day.status === 'sakit') dotColor = 'bg-amber-500 border-amber-600 shadow-sm shadow-amber-100';
                          if (day.status === 'libur') dotColor = 'bg-slate-300 border-slate-400';

                          return (
                            <div key={i} className="flex flex-col items-center gap-1 shrink-0">
                               <div 
                                 title={`${day.tanggal}: ${day.status.toUpperCase()}`}
                                 className={cn("w-3.5 h-3.5 rounded-full border-2 transition-all", dotColor)} 
                               />
                               <span className="text-[7px] font-black text-slate-300 uppercase">{day.dayName.charAt(0)}</span>
                            </div>
                          );
                       })}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-3 w-full xl:w-auto shrink-0">
                    <div className="hidden md:grid grid-cols-4 gap-1.5 mr-2">
                      <div className="bg-emerald-50 px-2 py-1.5 rounded-lg text-center min-w-[35px]">
                        <p className="text-[8px] font-black text-emerald-700 leading-none">HDR</p>
                        <p className="text-[10px] font-bold text-emerald-600 mt-0.5">{stats.hadir}</p>
                      </div>
                      <div className="bg-rose-50 px-2 py-1.5 rounded-lg text-center min-w-[35px]">
                        <p className="text-[8px] font-black text-rose-700 leading-none">ALP</p>
                        <p className="text-[10px] font-bold text-rose-600 mt-0.5">{stats.alpha}</p>
                      </div>
                      <div className="bg-amber-50 px-2 py-1.5 rounded-lg text-center min-w-[35px]">
                        <p className="text-[8px] font-black text-amber-700 leading-none">IZN</p>
                        <p className="text-[10px] font-bold text-amber-600 mt-0.5">{stats.ijin + stats.sakit}</p>
                      </div>
                      <div className="bg-slate-50 px-2 py-1.5 rounded-lg text-center min-w-[35px]">
                        <p className="text-[8px] font-black text-slate-600 leading-none">LBR</p>
                        <p className="text-[10px] font-bold text-slate-500 mt-0.5">{stats.libur}</p>
                      </div>
                    </div>

                    <button 
                      onClick={() => setSelectedSiswa({ ...s, mitra, stats })}
                      className="flex-1 md:flex-none text-[10px] font-black text-white bg-slate-900 border border-slate-900 px-6 py-2.5 rounded-xl uppercase hover:bg-slate-800 transition-all active:scale-95 whitespace-nowrap shadow-lg shadow-slate-200"
                    >
                      Lihat Monitor Harian
                    </button>
                    
                    <button 
                      onClick={() => window.open(`https://wa.me/${(mitra?.noHp || s.noHpKepalaBengkel || '').replace(/\D/g, '')}`, '_blank')}
                      className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100 hover:bg-emerald-100 transition-all active:scale-95"
                      title="Hubungi Kabeng"
                    >
                      <Phone size={18} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-4 space-y-6">
           <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Bimbingan</p>
                <p className="text-3xl font-bold text-slate-800">{siswaList.length} <span className="text-sm text-slate-400 font-medium">Siswa</span></p>
              </div>
              <div className="w-12 h-12 bg-slate-50 rounded-lg flex items-center justify-center text-slate-400">
                 <Users size={24} />
              </div>
           </div>

           <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Jurnal Masuk</p>
                <p className="text-3xl font-bold text-blue-600">{jToday.length}</p>
              </div>
              <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center text-blue-500">
                 <BookOpen size={24} />
              </div>
           </div>

           <div className="bg-amber-50 p-6 rounded-xl border border-amber-100">
             <h4 className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-3 flex items-center gap-2">
               <AlertCircle size={14} /> Belum Isi Jurnal
             </h4>
             <div className="space-y-2">
               {siswaList.filter((s: any) => !jToday.some((j: any) => j.siswaId === s.id)).slice(0, 5).map((s: any) => (
                 <div key={s.id} className="text-xs font-medium text-amber-900/70 truncate">• {s.nama}</div>
               ))}
               {siswaList.filter((s: any) => !jToday.some((j: any) => j.siswaId === s.id)).length > 5 && (
                 <div className="text-[10px] text-amber-600 font-bold italic">+{siswaList.filter((s: any) => !jToday.some((j: any) => j.siswaId === s.id)).length - 5} lainnya...</div>
               )}
             </div>
           </div>
        </div>
      </div>

      <AnimatePresence>
        {selectedSiswa && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-[2px] z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-md max-h-[90vh] rounded-3xl overflow-hidden shadow-2xl flex flex-col"
            >
              <div className="bg-blue-600 p-8 text-white relative shrink-0">
                <button 
                  onClick={() => setSelectedSiswa(null)}
                  className="absolute top-4 right-4 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors"
                >
                  <X size={20} />
                </button>
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center text-blue-600 font-black text-3xl shadow-lg shadow-blue-900/20">
                    {selectedSiswa.nama.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-xl font-black tracking-tight">{selectedSiswa.nama}</h3>
                    <p className="text-blue-100 text-sm font-bold uppercase tracking-widest">{selectedSiswa.kelas} • {selectedSiswa.nis}</p>
                  </div>
                </div>
              </div>

              <div className="p-8 space-y-6 overflow-y-auto">
                <div>
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Lokasi Praktik (Mitra)</label>
                   <div className="flex items-start gap-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <Building2 size={20} className="text-blue-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-bold text-slate-800">{selectedSiswa.mitra?.namaMitra || 'Belum Ada Penempatan'}</p>
                        <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{selectedSiswa.mitra?.alamat || '-'}</p>
                      </div>
                   </div>
                </div>

                {/* Attendance Log Section */}
                <div className="space-y-4">
                   <div className="flex items-center justify-between">
                     <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Monitor Presensi Seluruh Masa PKL</label>
                     <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded italic">Urutan Terbaru</span>
                   </div>
                   <div className="space-y-2 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                      {selectedSiswa.stats?.history?.length > 0 ? (
                        selectedSiswa.stats.history.map((h: any, idx: number) => {
                          let hColor = 'bg-slate-100 text-slate-500';
                          if (h.tipe === 'hadir') hColor = 'bg-emerald-100 text-emerald-600 border-emerald-200';
                          if (h.tipe === 'alpha' || h.tipe === 'tidak_absen') hColor = 'bg-rose-100 text-rose-600 border-rose-200';
                          if (h.tipe === 'ijin' || h.tipe === 'izin' || h.tipe === 'sakit' || h.tipe === 'libur') hColor = 'bg-amber-100 text-amber-600 border-amber-200';

                          const jurnalEntry = jurnals.find((j: any) => j.siswaId === selectedSiswa.id && j.tanggal === h.tanggal);

                          return (
                            <div key={idx} className="p-4 bg-slate-50 rounded-xl border border-slate-100 group hover:border-blue-200 transition-all">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex flex-col">
                                  <span className="text-[10px] font-black text-slate-800 uppercase tracking-tighter">{getDayName(h.tanggal)}, {format(new Date(h.tanggal), 'dd MMMM yyyy')}</span>
                                  {h.jamCheckin && <span className="text-[9px] font-extrabold text-blue-500 uppercase tracking-widest mt-0.5 transition-colors">Check-in: {h.jamCheckin}</span>}
                                </div>
                                <span className={cn("text-[8px] font-black uppercase px-2.5 py-1 rounded-md border", hColor)}>
                                   {h.tipe === 'tidak_absen' ? 'ALPHA' : (h.alasanLibur || h.tipe).toUpperCase()}
                                </span>
                              </div>
                              
                              <div className={cn("text-[10px] p-3 rounded-xl border italic", 
                                jurnalEntry ? 'bg-white border-blue-100 text-slate-700' : 
                                h.tipe === 'libur' ? 'bg-slate-50 border-slate-100 text-slate-400' :
                                'bg-slate-100/50 border-slate-100 text-slate-400'
                              )}>
                                {jurnalEntry ? (
                                  <>
                                    <span className="font-bold text-blue-600 mr-2 uppercase tracking-widest text-[8px]">Aktifitas:</span>
                                    {jurnalEntry.kegiatan}
                                  </>
                                ) : h.tipe === 'libur' || h.tipe === 'ijin' || h.tipe === 'izin' || h.tipe === 'sakit' ? (
                                   <span className="font-bold text-slate-600 uppercase tracking-widest text-[8px] flex flex-col gap-1.5 justify-start">
                                      <span className="flex items-center gap-2">
                                        <span className={cn("w-1.5 h-1.5 rounded-full", (h.alasanLibur || '').toLowerCase().includes('izin') || (h.alasanLibur || '').toLowerCase().includes('sakit') ? "bg-amber-400" : "bg-slate-400")}></span>
                                        {h.alasanLibur || (h.tipe === 'sakit' ? 'SAKIT' : h.tipe === 'libur' ? 'HARI LIBUR / OFF PKL' : 'IZIN')}
                                      </span>
                                      {h.keteranganLibur && (
                                        <span className="text-[10px] text-slate-400 font-medium normal-case block pl-3.5 leading-normal">
                                          Ket: <span className="italic">"{h.keteranganLibur}"</span>
                                        </span>
                                      )}
                                   </span>
                                ) : false ? (
                                  <span className="font-bold uppercase tracking-widest text-[8px] flex items-center gap-2">
                                     <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                                     Hari Libur / Off PKL
                                  </span>
                                ) : h.tipe === 'sakit' ? (
                                  <span className="font-bold text-amber-600/70 uppercase tracking-widest text-[8px] flex items-center gap-2">
                                     <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                                     Siswa Sakit
                                  </span>
                                ) : h.tipe === 'ijin' || h.tipe === 'izin' ? (
                                  <span className="font-bold text-amber-600/70 uppercase tracking-widest text-[8px] flex items-center gap-2">
                                     <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                                     Siswa Izin
                                  </span>
                                ) : (
                                  'Belum menginput laporan jurnal'
                                )}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-center py-10 text-slate-300 text-[10px] font-black uppercase tracking-widest border-2 border-dashed border-slate-100 rounded-2xl italic">Belum Ada Riwayat Presensi</div>
                      )}
                   </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Kepala Bengkel</label>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center gap-3">
                      <User size={18} className="text-slate-400" />
                      <p className="text-xs font-bold text-slate-800 truncate">{selectedSiswa.mitra?.kepalaMitra || selectedSiswa.kepalaBengkel || '-'}</p>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Kontak Kabeng</label>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center gap-3">
                      <Phone size={18} className="text-slate-400" />
                      <p className="text-xs font-black text-blue-600">{selectedSiswa.mitra?.noHp || selectedSiswa.noHpKepalaBengkel || '-'}</p>
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                   <button 
                     onClick={() => window.open(`https://wa.me/${(selectedSiswa.mitra?.noHp || selectedSiswa.noHpKepalaBengkel || '').replace(/\D/g, '')}`, '_blank')}
                     className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-100 transition-all active:scale-95"
                   >
                     <Phone size={20} />
                     HUBUNGI KEPALA BENGKEL
                   </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function JurnalMonitor({ records, onDownload }: any) {
  const [search, setSearch] = useState('');
  const filtered = records.filter((r: any) => {
    return (r.siswaNama || '').toLowerCase().includes(search.toLowerCase()) || 
           (r.tanggal || '').includes(search) ||
           (r.statusAbsen || '').toLowerCase().includes(search.toLowerCase()) ||
           (r.kegiatan || '').toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold text-slate-800 self-start md:self-auto">Pantau Jurnal Harian</h2>
          <button 
            onClick={onDownload}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-blue-100 transition-all active:scale-95"
          >
            <Download size={14} />
            Download Rekap
          </button>
        </div>
        <div className="relative w-full md:w-80">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            placeholder="Cari siswa, status, atau laporan..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white border border-slate-300 py-2.5 pl-10 pr-4 rounded-lg text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Siswa</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tanggal</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Jam Masuk</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status / Keterangan</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Isi Laporan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((r: any) => {
                return (
                  <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                         <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center font-bold text-xs">
                            {r.siswaNama?.charAt(0) || '?'}
                         </div>
                         <span className="text-sm font-bold text-slate-800">{r.siswaNama}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs font-medium text-slate-500 tracking-tight">{r.tanggal}</td>
                    <td className="px-6 py-4">
                       {r.jamCheckin !== '-' ? (
                         <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-md border border-blue-100">{r.jamCheckin}</span>
                       ) : (
                         <span className="text-[10px] font-bold text-slate-300 italic">-</span>
                       )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1 items-start">
                        <span className={cn(
                          "text-[9px] font-extrabold px-2.5 py-0.5 rounded border inline-block uppercase tracking-wider",
                          r.statusAbsen === 'Hadir' ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                          r.statusAbsen === 'Izin' || r.statusAbsen === 'Sakit' ? "bg-amber-50 text-amber-600 border-amber-100" :
                          r.statusAbsen === 'Libur' ? "bg-slate-50 text-slate-500 border-slate-200" :
                          "bg-red-50 text-red-600 border-red-100"
                        )}>
                          {r.statusAbsen}
                        </span>
                        {r.keteranganAbsen && r.keteranganAbsen !== '-' && (
                          <span className="text-[10px] text-slate-400 font-medium italic mt-0.5 block max-w-[200px] truncate" title={r.keteranganAbsen}>
                            {r.keteranganAbsen}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 max-w-sm">
                       {r.kegiatan && r.kegiatan !== '-' ? (
                         <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">"{r.kegiatan}"</p>
                       ) : (
                         <p className="text-xs text-slate-300 italic">Belum mengisi jurnal</p>
                       )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="py-20 text-center text-slate-400">
               <p className="text-sm italic">Tidak ada data ditemukan.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SiswaBimbingan({ siswaList, mitras, onDownload }: any) {
  return (
    <div className="space-y-6">
       <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold text-slate-800">Daftar Bimbingan & Mitra</h2>
            <button 
              onClick={onDownload}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-blue-100 transition-all active:scale-95"
            >
              <Download size={14} />
              Download Data Mitra
            </button>
          </div>
          <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-[10px] font-bold uppercase border border-slate-200">
            {siswaList.length} Total
          </span>
       </div>
       
       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
         {siswaList.map((s: any) => {
           const mitra = mitras.find((m: any) => m.id === s.mitraId);
           return (
           <div key={s.id} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center gap-5 group hover:border-blue-300 transition-all cursor-default relative overflow-hidden">
              <div className="w-16 h-16 bg-slate-50 rounded-xl flex items-center justify-center font-bold text-slate-800 text-2xl border border-slate-100 shadow-inner group-hover:bg-blue-600 group-hover:text-white transition-all shrink-0">
                {s.nama.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-bold text-slate-800 truncate leading-none mb-1.5">{s.nama}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 truncate">{s.kelas} • {s.jurusan}</p>
                <div className="mt-2 space-y-1">
                   <p className="text-[10px] font-bold text-blue-600 uppercase tracking-tighter flex items-center gap-1 truncate mb-1">
                      <Building2 size={12} /> {mitra?.namaMitra || 'Belum Penempatan'}
                   </p>
                   {mitra && (
                     <p className="text-[9px] font-medium text-slate-500 italic truncate mb-2">{mitra.alamat}</p>
                   )}
                   <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 border-t border-slate-50">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter flex items-center gap-1">
                        <User size={10} /> Kabeng: {mitra?.kepalaMitra || s.kepalaBengkel || '-'}
                      </p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter flex items-center gap-1">
                        <Phone size={10} /> HP: {mitra?.noHp || s.noHpKepalaBengkel || '-'}
                      </p>
                   </div>
                </div>
              </div>
              <div className="bg-emerald-50 text-emerald-600 text-[10px] font-bold px-3 py-1 rounded-full border border-emerald-100 uppercase shrink-0">Aktif</div>
           </div>
           );
         })}
       </div>
    </div>
  );
}

function ProfilSection({ guru }: any) {
  return (
    <div className="max-w-2xl mx-auto py-8">
       <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-900 h-24 relative"></div>
          <div className="px-10 pb-10">
             <div className="relative -mt-12 flex items-end gap-6 mb-8">
                <div className="w-24 h-24 bg-white p-1 rounded-2xl shadow-xl">
                   <div className="w-full h-full bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-3xl">
                      {guru.nama.charAt(0)}
                   </div>
                </div>
                <div className="pb-2">
                   <h2 className="text-2xl font-bold text-slate-800 leading-none">{guru.nama}</h2>
                   <p className="text-sm font-medium text-slate-400 mt-2">ID: {guru.idGuru}</p>
                </div>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ProfileTile icon={Search} label="ID Terdaftar" value={guru.idGuru} />
                <ProfileTile icon={UserCheck} label="Tugas Utama" value="Pembimbing Siswa" />
                <ProfileTile icon={BookOpen} label="Mata Pelajaran" value={guru.mapel || '-'} />
             </div>

             <div className="mt-10 pt-10 border-t border-slate-100">
                <button className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 rounded-lg text-sm shadow-lg shadow-slate-200 transition-all active:scale-95">
                   Ubah Profil & Password
                </button>
             </div>
          </div>
       </div>
    </div>
  );
}

function ProfileTile({ icon: Icon, label, value }: any) {
  return (
    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center gap-4">
       <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-slate-400 border border-slate-100 shadow-sm">
          <Icon size={18} />
       </div>
       <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 leading-none">{label}</p>
          <p className="text-sm font-bold text-slate-800 leading-none">{value}</p>
       </div>
    </div>
  );
}
