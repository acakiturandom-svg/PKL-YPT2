
import React, { useState, useEffect } from 'react';
import { collection, query, where, serverTimestamp, doc, orderBy, limit } from 'firebase/firestore';
import { db, getDocs, getDoc, onSnapshot, addDoc, updateDoc, writeBatch } from '../../lib/firebase';
import { useAuth, handleFirestoreError, OperationType } from '../../lib/auth';
import { Siswa, Jurnal, Absensi, Mitra } from '../../types';
// ...

import { cn, getDistance } from '../../lib/utils';
import { MapPin, BookOpen, User, Calendar, CheckCircle2, XCircle, Clock, AlertTriangle, Loader2, Users, Building2, Plus, Settings, ChevronRight, Phone, UserCheck, Filter, QrCode as QrIcon, Camera, X, Download, Edit3, RotateCcw } from 'lucide-react';
import { Html5QrcodeScanner, Html5Qrcode } from 'html5-qrcode';
import { format, differenceInDays } from 'date-fns';
import { id } from 'date-fns/locale';
import { motion } from 'motion/react';
import * as XLSX from 'xlsx';

export default function SiswaDash({ activeTab }: { activeTab: string }) {
  const { profile } = useAuth();
  const [siswa, setSiswa] = useState<Siswa>(profile as Siswa);
  const [mitra, setMitra] = useState<Mitra | null>(null);
  const [guru, setGuru] = useState<any | null>(null);
  const [lastJurnal, setLastJurnal] = useState<Jurnal | null>(null);
  const [lastAbsen, setLastAbsen] = useState<Absensi | null>(null);
  const [allAbsensi, setAllAbsensi] = useState<Absensi[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Dynamic real-time sync for the logged-in student document
  useEffect(() => {
    if (!profile?.id) {
      setIsLoading(false);
      return;
    }

    const unsubSiswa = onSnapshot(doc(db, 'siswa', profile.id), (ds) => {
      if (ds.exists()) {
        const freshSiswa = { id: ds.id, ...ds.data() } as Siswa;
        setSiswa(freshSiswa);
        
        // Update local session to persist changes across manual reloads or different sections
        try {
          const savedSession = localStorage.getItem('sipkl_session');
          if (savedSession) {
            const session = JSON.parse(savedSession);
            session.profile = freshSiswa;
            localStorage.setItem('sipkl_session', JSON.stringify(session));
          }
        } catch (err) {
          console.error("Failed to sync updated profile to localStorage:", err);
        }
      }
    });

    return () => unsubSiswa();
  }, [profile?.id]);

  // Lazy-resolve student's workshop coordinate from Mitra database if they aren't fully registered
  useEffect(() => {
    if (!siswa?.id || !siswa.namaBengkel) return;
    if (siswa.koordinatGPS && siswa.mitraId) return; // already fully resolved

    const resolveMatchingMitra = async () => {
      try {
        const mSnap = await getDocs(collection(db, 'mitra'));
        const mList = mSnap.docs.map(d => ({ id: d.id, ...d.data() } as Mitra));
        
        const sNama = (siswa.namaBengkel || '').trim();
        const sAlamat = (siswa.alamatBengkel || '').trim();
        
        // Strict match name & address (if address given)
        let matchingMitra = mList.find(m => {
          const mNameClean = (m.namaMitra || '').trim().toLowerCase();
          const mAddressClean = (m.alamat || '').trim().toLowerCase();
          const bNameClean = sNama.toLowerCase();
          const bAddressClean = sAlamat.toLowerCase();
          if (sAlamat) {
            return mNameClean === bNameClean && mAddressClean === bAddressClean;
          } else {
            return mNameClean === bNameClean;
          }
        });

        // Fuzzy match name (contain relationship)
        if (!matchingMitra) {
          matchingMitra = mList.find(m => {
            const mNameClean = (m.namaMitra || '').trim().toLowerCase();
            const bNameClean = sNama.toLowerCase();
            if (mNameClean.length < 4 || bNameClean.length < 4) return false;
            return mNameClean.includes(bNameClean) || bNameClean.includes(mNameClean);
          });
        }

        if (matchingMitra) {
          const mCoords = matchingMitra.koordinatGPS || null;
          await updateDoc(doc(db, 'siswa', siswa.id), {
            koordinatGPS: mCoords,
            mitraId: matchingMitra.id
          });
          console.log("Successfully auto-aligned missing coordinates for logged-in student:", matchingMitra.namaMitra);
        }
      } catch (err) {
        console.error("Gagal menyelesaikan sinkronisasi mandiri koordinat siswa:", err);
      }
    };

    resolveMatchingMitra();
  }, [siswa?.id, siswa?.namaBengkel, siswa?.koordinatGPS, siswa?.mitraId]);

  // Fetch initial data & Real-time updates for Mitra/Guru
  useEffect(() => {
    if (!siswa?.id) {
      setIsLoading(false);
      return;
    }

    let unsubMitra: any;
    let unsubGuru: any;

    async function fetchNonRealtimeData() {
      try {
        const today = format(new Date(), 'yyyy-MM-dd');
        
        // Last Jurnal (keep as getDocs or make real-time?)
        const jQ = query(collection(db, 'jurnal'), where('siswaId', '==', siswa.id), orderBy('tanggal', 'desc'), limit(1));
        const jSnap = await getDocs(jQ);
        if (!jSnap.empty) setLastJurnal({ id: jSnap.docs[0].id, ...jSnap.docs[0].data() } as Jurnal);

        // Today's Absen
        const aQ = query(collection(db, 'absensi'), where('siswaId', '==', siswa.id), where('tanggal', '==', today));
        const aSnap = await getDocs(aQ);
        if (!aSnap.empty) setLastAbsen({ id: aSnap.docs[0].id, ...aSnap.docs[0].data() } as Absensi);

        // All Absen for Progress calculation
        const allAQ = query(collection(db, 'absensi'), where('siswaId', '==', siswa.id));
        const allASnap = await getDocs(allAQ);
        setAllAbsensi(allASnap.docs.map(d => ({ id: d.id, ...d.data() } as Absensi)));
      } catch (e) {
        console.error(e);
      }
    }

    fetchNonRealtimeData();

    if (siswa.mitraId && siswa.mitraId.trim() !== '') {
      unsubMitra = onSnapshot(doc(db, 'mitra', siswa.mitraId), (ds) => {
        if (ds.exists()) {
          setMitra({ id: ds.id, ...ds.data() } as Mitra);
        }
        setIsLoading(false);
      }, (e) => {
        console.error(e);
        setIsLoading(false);
      });
    } else {
      // If there's no mitraId (e.g., custom name only), set loading false
      setMitra(null);
      setIsLoading(false);
    }

    if (siswa.guruId && siswa.guruId.trim() !== '') {
      unsubGuru = onSnapshot(doc(db, 'guru', siswa.guruId), (ds) => {
        if (ds.exists()) {
          setGuru({ id: ds.id, ...ds.data() });
        }
      });
    } else {
      setGuru(null);
    }

    return () => {
      if (unsubMitra) unsubMitra();
      if (unsubGuru) unsubGuru();
    };
  }, [siswa.id, siswa.mitraId, siswa.guruId]);

  if (isLoading) return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-blue-900" /></div>;

  return (
    <div className="space-y-6">
      {activeTab === 'beranda' && <Beranda siswa={siswa} mitra={mitra} guru={guru} lastJurnal={lastJurnal} lastAbsen={lastAbsen} allAbsensi={allAbsensi} />}
      {activeTab === 'jurnal' && <JurnalSection siswa={siswa} mitra={mitra} />}
      {activeTab === 'absensi' && <AbsensiSection siswa={siswa} mitra={mitra} lastAbsen={lastAbsen} setLastAbsen={setLastAbsen} />}
      {activeTab === 'pengaturan' && <PengaturanSection siswa={siswa} onUpdate={() => window.location.reload()} />}
      {activeTab === 'profil' && <ProfilSection siswa={siswa} />}
    </div>
  );
}

function Beranda({ siswa, mitra, guru, lastJurnal, lastAbsen, allAbsensi }: any) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const hasJurnalToday = lastJurnal?.tanggal === today;
  const remainingDays = siswa.tanggalSelesai ? differenceInDays(new Date(siswa.tanggalSelesai), new Date()) : 0;

  // Progress Calculation: Based on Attendance
  const totalDays = (siswa.tanggalMulai && siswa.tanggalSelesai) 
    ? differenceInDays(new Date(siswa.tanggalSelesai), new Date(siswa.tanggalMulai)) + 1
    : 90; // Default target 90 working days

  const hadirCount = allAbsensi?.filter((a: any) => a.tipe === 'hadir').length || 0;
  // libur, ijin, sakit (recorded as 'libur') are ignored.
  // 'tidak_absen' counts as alpha (not present).
  const alphaCount = allAbsensi?.filter((a: any) => a.tipe === 'tidak_absen' || a.tipe === 'alpha').length || 0;
  
  let progress = totalDays > 0 ? Math.round(((hadirCount - alphaCount) / totalDays) * 100) : 0;
  if (progress < 0) progress = 0;
  if (progress > 100) progress = 100;

  // Google Maps link
  const mapsUrl = mitra?.koordinatGPS 
    ? `https://www.google.com/maps?q=${mitra.koordinatGPS.lat},${mitra.koordinatGPS.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(siswa.alamatBengkel || mitra?.alamat || siswa.namaBengkel || mitra?.namaMitra || '')}`;

  return (
    <div className="space-y-6">
      {/* Alert Banner */}
      {!hasJurnalToday && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-center gap-3 text-amber-800"
        >
          <AlertTriangle size={20} className="shrink-0 text-amber-500" />
          <div className="text-sm">
            <p className="font-bold">Laporan Belum Diisi</p>
            <p className="opacity-80">Segera isi jurnal harian Anda sebelum hari ini berakhir.</p>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Main Status */}
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-8">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Building2 size={16} className="text-blue-600" />
                  <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest">Penempatan PKL</h3>
                </div>
                <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight leading-none">{siswa.namaBengkel || mitra?.namaMitra || 'Belum Ditentukan'}</h2>
                
                {(siswa.alamatBengkel || mitra?.alamat) && (
                  <a 
                    href={mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-blue-600 hover:text-blue-700 transition-colors mt-3 group"
                  >
                    <MapPin size={14} className="group-hover:animate-bounce" />
                    <span className="text-xs font-bold underline decoration-blue-200 underline-offset-4">{siswa.alamatBengkel || mitra?.alamat}</span>
                  </a>
                )}
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className="bg-blue-600 text-white text-[10px] font-black px-4 py-1.5 rounded-full shadow-lg shadow-blue-100 uppercase tracking-wider">Aktif</span>
                {(siswa.jurusan || mitra?.jurusan) && <span className="bg-slate-100 text-slate-500 text-[9px] font-bold px-3 py-1 rounded-full uppercase">{siswa.jurusan || mitra?.jurusan}</span>}
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 pt-8 border-t border-slate-100">
              <div className="space-y-1">
                <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-tighter flex items-center gap-1.5">
                  <User size={12} className="text-slate-300" /> Guru Pembimbing
                </p>
                <p className="text-sm font-bold text-slate-700 leading-tight">{guru?.nama || '-'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-tighter flex items-center gap-1.5">
                  <UserCheck size={12} className="text-slate-300" /> Kepala Bengkel
                </p>
                <p className="text-sm font-bold text-slate-700 leading-tight">{mitra?.kepalaMitra || siswa.kepalaBengkel || '-'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-tighter flex items-center gap-1.5">
                  <Phone size={12} className="text-slate-300" /> Kontak Kabeng
                </p>
                <p className="text-sm font-bold text-slate-700 leading-tight">{mitra?.noHp || siswa.noHpKepalaBengkel || '-'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-tighter flex items-center gap-1.5">
                  <Calendar size={12} className="text-slate-300" /> Masa PKL
                </p>
                <p className="text-sm font-bold text-slate-700 leading-tight">
                  {siswa.tanggalMulai ? format(new Date(siswa.tanggalMulai), 'dd/MM/yyyy') : '-'} s.d. {siswa.tanggalSelesai ? format(new Date(siswa.tanggalSelesai), 'dd/MM/yyyy') : '-'}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-tighter flex items-center gap-1.5">
                  <Clock size={12} className="text-slate-300" /> Sisa Waktu
                </p>
                <p className="text-sm font-bold text-blue-600 leading-tight">{remainingDays > 0 ? `${remainingDays} Hari` : 'Selesai'}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
             <h3 className="text-sm font-bold text-slate-800 mb-4 pb-4 border-b border-slate-50 flex items-center gap-2">
                <BookOpen size={18} className="text-blue-600" />
                Jurnal Terakhir
             </h3>
             {lastJurnal ? (
               <div className="flex gap-4">
                  <div className="w-12 h-12 bg-slate-50 rounded-lg flex items-center justify-center font-bold text-slate-400 border border-slate-100 shrink-0">
                    {format(new Date(lastJurnal.tanggal), 'dd')}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase">{format(new Date(lastJurnal.tanggal), 'MMMM yyyy')}</p>
                    <p className="text-sm text-slate-600 mt-1 leading-relaxed line-clamp-2 italic">"{lastJurnal.kegiatan}"</p>
                  </div>
               </div>
             ) : (
               <p className="text-sm text-slate-400 italic text-center py-4">Belum ada catatan jurnal.</p>
             )}
          </div>
        </div>

        {/* Sidebar Status */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">Presensi</h3>
            {lastAbsen ? (
              <div className="text-center">
                 <div className={cn(
                   "inline-flex items-center justify-center px-4 py-2 rounded-lg border font-bold text-sm",
                   lastAbsen.tipe === 'hadir' ? "bg-emerald-50 text-emerald-700 border-emerald-100" : 
                   lastAbsen.tipe === 'diluar_jangkauan' ? "bg-red-50 text-red-700 border-red-100" :
                   "bg-amber-50 text-amber-700 border-amber-100"
                 )}>
                    {lastAbsen.tipe === 'hadir' ? 'HADIR' : 
                     lastAbsen.tipe === 'diluar_jangkauan' ? 'LUAR JANGKAUAN' : 
                     (lastAbsen.alasanLibur || 'LIBUR').toUpperCase()}
                    {lastAbsen.keteranganLibur && (
                       <span className="text-[10px] text-amber-800 border-t border-amber-200/50 pt-1 mt-1 font-medium normal-case block max-w-full truncate" title={lastAbsen.keteranganLibur}>
                         "{lastAbsen.keteranganLibur}"
                       </span>
                    )}
                 </div>
                 <p className="text-3xl font-bold text-slate-800 mt-4 tracking-tight">{lastAbsen.jamCheckin || '--:--'}</p>
                 <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Waktu Kedatangan</p>
              </div>
            ) : (
              <div className="text-center py-4">
                <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Clock size={24} className="text-slate-300" />
                </div>
                <p className="text-sm font-bold text-slate-400">Belum Ada Presensi</p>
              </div>
            )}
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
             <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">Progress PKL</h3>
             <div className="flex items-baseline gap-1 mt-4">
               <span className="text-4xl font-bold text-blue-600 tracking-tight">{progress}</span>
               <span className="text-lg font-bold text-slate-300">%</span>
             </div>
             <div className="h-2 w-full bg-slate-100 rounded-full mt-4 overflow-hidden">
               <div className="h-full bg-blue-600 rounded-full transition-all duration-1000 ease-out" style={{ width: `${progress}%` }} />
             </div>
             <p className="text-[10px] text-slate-400 font-bold uppercase mt-4 tracking-widest text-center">
               {hadirCount} Kehadiran / {totalDays} Hari
             </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function JurnalSection({ siswa }: any) {
  const [kegiatan, setKegiatan] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [jurnals, setJurnals] = useState<Jurnal[]>([]);
  const today = format(new Date(), 'yyyy-MM-dd');
  const [hasSubmittedToday, setHasSubmittedToday] = useState(false);

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

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const q = query(collection(db, 'jurnal'), where('siswaId', '==', siswa.id), orderBy('tanggal', 'desc'));
      const snap = await getDocs(q);
      const allJurnals = snap.docs.map(d => ({ id: d.id, ...d.data() } as Jurnal));

      const data = allJurnals.map((j) => ({
        'NAMA SISWA': siswa.nama,
        'TANGGAL': j.tanggal ? `${getDayName(j.tanggal)}, ${format(new Date(j.tanggal), 'dd/MM/yyyy')}` : '-',
        'ISI LAPORAN': j.kegiatan || '-'
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Rekap Jurnal");
      XLSX.writeFile(wb, `Rekap_Jurnal_${siswa.nama}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    } catch (error) {
      console.error(error);
      alert('Gagal mendownload rekap.');
    } finally {
      setIsDownloading(false);
    }
  };

  useEffect(() => {
    async function fetchJurnals() {
      const q = query(collection(db, 'jurnal'), where('siswaId', '==', siswa.id), orderBy('tanggal', 'desc'), limit(15));
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Jurnal));
      setJurnals(list);
      setHasSubmittedToday(list.some(j => j.tanggal === today));
    }
    fetchJurnals();
  }, [siswa.id, today]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kegiatan.trim()) {
      alert('Laporan tidak boleh kosong.');
      return;
    }
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'jurnal'), {
        siswaId: siswa.id || '',
        mitraId: siswa.mitraId || '',
        guruId: siswa.guruId || '',
        tanggal: today,
        kegiatan: kegiatan.trim(),
        tipeHari: 'masuk', 
        createdAt: serverTimestamp()
      });
      setHasSubmittedToday(true);
      setKegiatan('');
      const q = query(collection(db, 'jurnal'), where('siswaId', '==', siswa.id), orderBy('tanggal', 'desc'), limit(15));
      const snap = await getDocs(q);
      setJurnals(snap.docs.map(d => ({ id: d.id, ...d.data() } as Jurnal)));
      alert('Laporan berhasil dikirim!');
    } catch (error) {
      console.error('Gagal mengirim laporan:', error);
      alert('Gagal mengirim laporan. Pastikan koneksi internet Anda stabil dan data penempatan Anda sudah ditentukan.');
      handleFirestoreError(error, OperationType.CREATE, 'jurnal');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-1">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm sticky top-24">
          <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-6 text-lg">
            <Plus size={20} className="text-blue-600" />
            Input Jurnal
          </h3>
          
          {hasSubmittedToday ? (
            <div className="bg-emerald-50 p-6 rounded-xl text-center border border-emerald-100 flex flex-col items-center gap-3">
              <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm">
                <CheckCircle2 className="text-emerald-500" size={24} />
              </div>
              <p className="text-sm font-bold text-emerald-800">Laporan hari ini telah terkirim.</p>
              <p className="text-xs text-emerald-600 italic">Selamat beristirahat!</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tanggal</label>
                <div className="bg-slate-50 px-4 py-3 rounded-lg font-bold text-slate-700 text-sm border border-slate-100">
                  {format(new Date(), 'EEEE, d MMMM yyyy', { locale: id })}
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Isi Laporan Kegiatan</label>
                <textarea
                  value={kegiatan}
                  onChange={(e) => setKegiatan(e.target.value)}
                  placeholder="Deskripsikan kegiatan kamu hari ini secara lengkap..."
                  className="w-full p-4 bg-slate-50 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm min-h-[180px] transition-all"
                />
              </div>
              <button
                disabled={isSubmitting}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-all shadow-md active:scale-95 disabled:opacity-50 text-sm mt-2"
              >
                {isSubmitting ? 'Mengirim...' : 'Kirim Laporan'}
              </button>
            </form>
          )}
        </div>
      </div>

      <div className="lg:col-span-2 space-y-4">
        <div className="flex items-center justify-between px-1">
          <h3 className="font-bold text-slate-400 uppercase text-[10px] tracking-widest">Riwayat Laporan</h3>
          <button 
            disabled={isDownloading}
            onClick={handleDownload}
            className="flex items-center gap-1.5 text-blue-600 hover:text-blue-700 transition-colors text-[10px] font-black uppercase tracking-widest bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100 disabled:opacity-50"
          >
            {isDownloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
            Download .xlsx
          </button>
        </div>
        <div className="space-y-3">
          {jurnals.map((j) => (
            <div key={j.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex gap-6 hover:border-blue-200 transition-colors">
              <div className="w-16 h-16 bg-slate-50 rounded-lg flex flex-col items-center justify-center shrink-0 border border-slate-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase">{format(new Date(j.tanggal), 'MMM')}</span>
                <span className="text-xl font-bold text-slate-800 leading-none">{format(new Date(j.tanggal), 'dd')}</span>
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-center mb-2">
                   <p className="text-xs font-bold text-blue-600 uppercase">{format(new Date(j.tanggal), 'EEEE', { locale: id })}</p>
                   {j.tipeHari === 'libur' && <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase">Libur</span>}
                </div>
                <p className="text-sm text-slate-600 leading-relaxed font-medium">"{j.kegiatan}"</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AbsensiSection({ siswa, mitra, lastAbsen, setLastAbsen }: any) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [showLiburMenu, setShowLiburMenu] = useState(false);
  const [alasanLibur, setAlasanLibur] = useState('');
  const [keterangan, setKeterangan] = useState('');
  const today = format(new Date(), 'yyyy-MM-dd');

  // Sesi Absensi berdasarkan Jurusan (TKJ, TSM, TAV = Pagi; TKR, DKV = Sore)
  const getSessionStatus = () => {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTimeVal = currentHour * 60 + currentMinute; // minutes since midnight
    
    const morningStart = 7 * 60;       // 07:00
    const morningEnd = 13 * 60;         // 13:00
    const afternoonStart = 14 * 60 + 30; // 14:30
    const afternoonEnd = 17 * 60;       // 17:00

    const isMorningTime = currentTimeVal >= morningStart && currentTimeVal <= morningEnd;
    const isAfternoonTime = currentTimeVal >= afternoonStart && currentTimeVal <= afternoonEnd;

    const jur = (siswa.jurusan || '').trim().toUpperCase();
    const isMorningDept = ['TKJ', 'TSM', 'TAV'].includes(jur);
    const isAfternoonDept = ['TKR', 'TKRO', 'DKV'].includes(jur);

    if (isMorningDept) {
      return {
        allowed: isMorningTime,
        session: 'Pagi (07:00 - 13:00)',
        currentTimeStr: `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`,
        msg: `Jurusan Anda (${jur}) dijadwalkan absensi pada Sesi Pagi (07:00 - 13:00).`,
        expectedSlot: '07:00 - 13:00'
      };
    }

    if (isAfternoonDept) {
      return {
        allowed: isAfternoonTime,
        session: 'Sore (14:30 - 17:00)',
        currentTimeStr: `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`,
        msg: `Jurusan Anda (${jur}) dijadwalkan absensi pada Sesi Sore (14:30 - 17:00).`,
        expectedSlot: '14:30 - 17:00'
      };
    }

    // Fallback for other departments
    return {
      allowed: isMorningTime || isAfternoonTime,
      session: 'Pagi (07:00-13:00) atau Sore (14:30-17:00)',
      currentTimeStr: `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`,
      msg: 'Silakan melakukan absensi pada Sesi Pagi (07:00 - 13:00) atau Sesi Sore (14:30 - 17:00).',
      expectedSlot: 'Pagi (07:00-13:00) atau Sore (14:30-17:00)'
    };
  };

  const sessionStatus = getSessionStatus();

  // GPS tracking
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [distanceToBengkel, setDistanceToBengkel] = useState<number | null>(null);
  const [isRetrievingLocation, setIsRetrievingLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);

  const targetCoords = siswa.koordinatGPS || mitra?.koordinatGPS;
  const hasTargetCoords = !!(targetCoords && targetCoords.lat && targetCoords.lng);

  const getSiswaLocation = () => {
    if (!navigator.geolocation) {
      setLocationError("Browser ini tidak mendukung deteksi lokasi (Geolocation).");
      return;
    }

    setIsRetrievingLocation(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const uLat = position.coords.latitude;
        const uLng = position.coords.longitude;
        const accuracy = position.coords.accuracy;
        
        setUserCoords({ lat: uLat, lng: uLng });
        setGpsAccuracy(accuracy);
        setIsRetrievingLocation(false);

        if (hasTargetCoords) {
          const dist = getDistance(uLat, uLng, targetCoords.lat, targetCoords.lng);
          setDistanceToBengkel(dist);
        }
      },
      (error) => {
        console.error("Geolocation error:", error);
        setIsRetrievingLocation(false);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setLocationError("Izin lokasi ditolak/dinonaktifkan. Silakan aktifkan izin lokasi/GPS di HP untuk presensi.");
            break;
          case error.POSITION_UNAVAILABLE:
            setLocationError("Lokasi tidak dapat dideteksi oleh perangkat.");
            break;
          case error.TIMEOUT:
            setLocationError("Waktu deteksi lokasi habis. Silakan coba lagi.");
            break;
          default:
            setLocationError("Gagal mendeteksi lokasi.");
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  };

  useEffect(() => {
    getSiswaLocation();
  }, [siswa, mitra]);

  const isWithinRadius = distanceToBengkel !== null && distanceToBengkel <= 100;

  const handleHadir = () => {
    const session = getSessionStatus();
    if (!session.allowed) {
      return alert(`Waktu Presensi Ditolak!\n\n${session.msg}\nJam saat ini: ${session.currentTimeStr}`);
    }

    if (!mitra && !siswa.namaBengkel) return alert('Data penempatan mitra belum ditentukan');
    
    if (!hasTargetCoords) {
      return alert('Koordinat GPS bengkel belum didaftarkan oleh Admin. Silakan hubungi Pembimbing/Admin untuk melengkapi koordinat.');
    }

    if (locationError) {
      return alert(`Tidak dapat mengakses lokasi GPS Anda:\n${locationError}\n\nMohon pastikan GPS aktif dan berikan izin lokasi.`);
    }

    if (distanceToBengkel === null) {
      getSiswaLocation();
      return alert('Sedang mendeteksi lokasi GPS Anda... Silakan tunggu sekejap dan coba klik tombol ini kembali.');
    }

    if (!isWithinRadius) {
      return alert(`Kehadiran Ditolak!\n\nJarak Anda saat ini: ${distanceToBengkel.toFixed(1)} meter dari bengkel.\nBatas jangkauan maksimum: 100 meter.\n\nSilakan mendekati ke lokasi bengkel/PKL Anda.`);
    }

    setShowScanner(true);
  };

  const handleQrSuccess = async (decodedText: string) => {
    if (isSubmitting) return;

    // Expected format: SIPKL_PRESENSI:mitraId:namaMitra
    if (!decodedText.startsWith('SIPKL_PRESENSI:')) {
      alert('QR Code tidak valid. Pastikan Anda memindai QR resmi dari bengkel/industri.');
      return;
    }

    const parts = decodedText.split(':');
    const scannedMitraId = parts[1];
    const scannedMitraNama = parts[2];

    if (mitra) {
      if (scannedMitraId !== mitra.id) {
         alert(`QR Code Salah!\n\nAnda memindai QR untuk: ${scannedMitraNama}\nPadahal penempatan Anda di: ${mitra.namaMitra}.\n\nPastikan Anda berada di lokasi yang benar.`);
         return;
      }
    } else {
      const cleanScannedName = (scannedMitraNama || '').trim().toLowerCase();
      const cleanTargetName = (siswa.namaBengkel || '').trim().toLowerCase();
      if (cleanTargetName && cleanScannedName !== cleanTargetName) {
         alert(`QR Code Salah!\n\nAnda memindai QR untuk: ${scannedMitraNama}\nPadahal penempatan Anda di: ${siswa.namaBengkel}.\n\nPastikan Anda berada di lokasi yang benar.`);
         return;
      }
    }

    setShowScanner(false);
    setIsSubmitting(true);
    setStatus('QR Terverifikasi! Mencatat kehadiran...');

    try {
      const docData = {
        siswaId: siswa.id,
        mitraId: siswa.mitraId || '',
        tanggal: today,
        tipe: 'hadir',
        jamCheckin: format(new Date(), 'HH:mm'),
        koordinatCheckin: userCoords ? { lat: userCoords.lat, lng: userCoords.lng } : { lat: 0, lng: 0 },
        jarakCheckin: distanceToBengkel !== null ? parseFloat(distanceToBengkel.toFixed(1)) : 0,
        isRadiusMatched: isWithinRadius,
        isQrVerified: true,
        gpsAccuracy: gpsAccuracy || 0,
        createdAt: serverTimestamp()
      };
      await addDoc(collection(db, 'absensi'), docData);
      setLastAbsen(docData);
      alert(`BERHASIL:\nStatus: HADIR.\n\nKehadiran Anda telah dicatat melalui verifikasi QR Code.`);
    } catch (e) {
      console.error(e);
      handleFirestoreError(e, OperationType.WRITE, 'absensi');
    } finally {
      setIsSubmitting(false);
      setStatus(null);
    }
  };

  useEffect(() => {
    let scn: Html5Qrcode | null = null;
    if (showScanner) {
      setTimeout(async () => {
        try {
          const readerElement = document.getElementById("reader");
          if (!readerElement) return;

          scn = new Html5Qrcode("reader");
          const config = { 
            fps: 10, 
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0
          };
          
          await scn.start(
            { facingMode: "environment" },
            config,
            (decodedText: string) => {
              handleQrSuccess(decodedText);
            },
            () => {} // error callback
          );
        } catch (err) {
          console.error("Camera start error:", err);
          // If environment camera fails, try any available
          try {
             if (scn) {
                await scn.start(
                  { facingMode: "user" },
                  { fps: 10, qrbox: { width: 250, height: 250 } },
                  (decodedText: string) => handleQrSuccess(decodedText),
                  () => {}
                );
             }
          } catch (e2) {
             alert('Gagal mengakses kamera. Pastikan izin kamera diberikan dan browser mendukung.');
             setShowScanner(false);
          }
        }
      }, 300);
    }
    return () => {
      if (scn) {
        if (scn.isScanning) {
          scn.stop().then(() => {
            // Optional: any cleanup after stop
          }).catch(e => console.error("Stop error:", e));
        }
      }
    };
  }, [showScanner, mitra, siswa, userCoords]);

  const handleLibur = async () => {
    const session = getSessionStatus();
    if (!session.allowed) {
      return alert(`Pengisian Status Ditolak!\n\n${session.msg}\nJam saat ini: ${session.currentTimeStr}`);
    }

    if (!alasanLibur) return alert('Pilih alasan');
    if ((alasanLibur === 'Izin' || alasanLibur === 'Sakit') && !keterangan.trim()) {
      return alert('Harap isi keterangan tambahan untuk status ' + alasanLibur);
    }
    setIsSubmitting(true);
    try {
      const docData = {
        siswaId: siswa.id,
        mitraId: siswa.mitraId || '',
        tanggal: today,
        tipe: 'libur',
        alasanLibur,
        keteranganLibur: keterangan,
        createdAt: serverTimestamp()
      };
      await addDoc(collection(db, 'absensi'), docData);
      setLastAbsen(docData);
      setShowLiburMenu(false);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto py-8">
      <div className="bg-white p-10 rounded-xl border border-slate-200 shadow-sm text-center">
        <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner">
           <Clock size={36} strokeWidth={2.5} />
        </div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Presensi Kehadiran</h2>
        <p className="text-sm font-medium text-slate-400 uppercase tracking-widest mb-10">{format(new Date(), 'EEEE, d MMMM yyyy', { locale: id })}</p>

        {lastAbsen ? (
          <div className="space-y-8 animate-in fade-in zoom-in duration-500">
             <div className={cn(
               "p-6 rounded-xl border flex items-center justify-center gap-4",
               lastAbsen.tipe === 'hadir' ? "bg-emerald-50 border-emerald-100 text-emerald-800" :
               lastAbsen.tipe === 'diluar_jangkauan' ? "bg-red-50 border-red-100 text-red-800" :
               "bg-amber-50 border-amber-100 text-amber-800"
             )}>
                 {lastAbsen.tipe === 'hadir' ? <CheckCircle2 size={32} /> : <AlertTriangle size={32} />}
                 <div className="text-left">
                    <p className="text-[10px] font-bold uppercase tracking-widest opacity-60 leading-none mb-1">Status Anda</p>
                    <p className="text-xl font-bold uppercase tracking-tight">{lastAbsen.tipe.replace('_', ' ')}</p>
                    {lastAbsen.tipe === 'diluar_jangkauan' && (
                      <p className="text-[9px] font-bold text-red-500 uppercase mt-1">Lokasi di luar jangkauan ({lastAbsen.jarakCheckin}m)</p>
                    )}
                 </div>
             </div>
             {lastAbsen.jamCheckin && (
               <div className="border-t border-slate-100 pt-8">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Terdaftar Pada Jam</p>
                  <p className="text-4xl font-bold text-slate-800 tracking-tighter">{lastAbsen.jamCheckin}</p>
               </div>
             )}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Warning Sesi Presensi */}
            {!sessionStatus.allowed && (
              <div className="bg-amber-50 border border-amber-200/70 p-5 rounded-xl flex items-start gap-3.5 text-left animate-in fade-in duration-300">
                <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={20} />
                <div className="space-y-1">
                  <p className="text-[11px] font-black text-amber-900 uppercase tracking-wider">Sesi Absensi Belum Aktif</p>
                  <p className="text-xs text-amber-800 font-semibold leading-relaxed">
                    {sessionStatus.msg}
                  </p>
                  <p className="text-[10px] text-amber-600 font-bold uppercase mt-1">
                    Jam Sekarang: <span className="bg-amber-100/80 px-2 py-0.5 rounded font-mono text-[11px] text-amber-700">{sessionStatus.currentTimeStr}</span>
                  </p>
                </div>
              </div>
            )}

            {/* Live GPS Verification Panel */}
            <div className="bg-slate-50 border border-slate-250/60 p-5 rounded-xl text-left space-y-3.5 transition-all">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-slate-550 uppercase tracking-widest flex items-center gap-1.5">
                  <MapPin size={13} className="text-blue-600" />
                  VERIFIKASI RADIUS GPS
                </span>
                <button
                  onClick={getSiswaLocation}
                  disabled={isRetrievingLocation || !sessionStatus.allowed}
                  className="text-[10px] bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 font-bold px-2 py-1 rounded flex items-center gap-1 transition-all disabled:opacity-50"
                >
                  <RotateCcw size={10} className={cn(isRetrievingLocation && "animate-spin")} />
                  Refresh
                </button>
              </div>

              {!hasTargetCoords ? (
                <div className="bg-amber-50 border border-amber-100 p-3.5 rounded-lg flex items-start gap-2.5">
                  <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={17} />
                  <div className="space-y-0.5">
                    <p className="text-[11px] font-bold text-amber-900 uppercase">Koordinat Belum Terdaftar</p>
                    <p className="text-[11px] text-amber-700 font-medium leading-relaxed">
                      Titik koordinat GPS workshop/bengkel belum didaftarkan di sistem oleh Admin. Hubungi pembimbing agar didaftarkan.
                    </p>
                  </div>
                </div>
              ) : !sessionStatus.allowed ? (
                <div className="bg-slate-100/80 border border-slate-200/60 p-4 rounded-lg flex items-center gap-2.5 text-slate-500 font-semibold text-xs">
                  <Clock size={16} />
                  <span>Radius GPS dikunci di luar jam sesi absensi Anda.</span>
                </div>
              ) : isRetrievingLocation ? (
                <div className="bg-blue-50/50 border border-blue-100 p-4 rounded-lg flex items-center justify-center gap-3">
                  <Loader2 className="animate-spin text-blue-600" size={18} />
                  <span className="text-xs font-bold text-blue-700">Mendeteksi lokasi HP Anda...</span>
                </div>
              ) : locationError ? (
                <div className="bg-red-50 border border-red-100 p-3.5 rounded-lg flex items-start gap-2.5">
                  <AlertTriangle className="text-red-500 shrink-0 mt-0.5" size={17} />
                  <div className="space-y-1">
                    <p className="text-[11px] font-bold text-red-800 uppercase">Gagal Mendapatkan Lokasi</p>
                    <p className="text-[11px] text-red-600 font-medium leading-relaxed">{locationError}</p>
                  </div>
                </div>
              ) : distanceToBengkel !== null ? (
                <div className="space-y-3">
                  {isWithinRadius ? (
                    <div className="bg-emerald-50 border border-emerald-100 p-3.5 rounded-lg flex items-center gap-3 animate-in fade-in duration-300">
                      <div className="w-6 h-6 bg-emerald-500 text-white rounded-full flex items-center justify-center shrink-0">
                        <span className="text-xs font-black">✓</span>
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-[11px] font-black text-emerald-800 uppercase tracking-tight">Dalam Jangkauan (Aman)</p>
                        <p className="text-[11px] text-emerald-700 font-bold">
                          Jarak Anda: {distanceToBengkel.toFixed(1)} meter dari Bengkel (Max 100m)
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-rose-50 border border-rose-100/80 p-3.5 rounded-lg flex items-start gap-3 animate-in fade-in duration-300">
                      <AlertTriangle className="text-rose-500 shrink-0 mt-0.5" size={17} />
                      <div className="space-y-0.5">
                        <p className="text-[11px] font-black text-rose-800 uppercase tracking-tight">Di Luar Jangkauan</p>
                        <p className="text-[11px] text-rose-600 font-semibold leading-normal">
                          Jarak Anda: {distanceToBengkel.toFixed(1)} meter dari Bengkel (Batas radius 100m)
                        </p>
                        <p className="text-[10px] text-rose-500 font-bold mt-1 uppercase">
                          *Silakan mendekati Bengkel agar tombol scan terbuka
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-slate-100 p-3.5 rounded-lg text-center">
                  <p className="text-xs text-slate-500 font-bold">Menunggu deteksi lokasi gawai...</p>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <button
                onClick={handleHadir}
                disabled={isSubmitting || !isWithinRadius || !sessionStatus.allowed}
                className={cn(
                  "w-full font-bold py-4 rounded-lg shadow-lg transition-all flex items-center justify-center gap-3 disabled:opacity-50 relative overflow-hidden group text-white",
                  isWithinRadius && sessionStatus.allowed ? "bg-blue-600 hover:bg-blue-700 shadow-blue-100" : "bg-slate-300 shadow-none cursor-not-allowed"
                )}
              >
                {isSubmitting ? <Loader2 size={24} className="animate-spin" /> : <QrIcon size={24} />}
                {isSubmitting ? 'Memproses...' : 'Scan QR Code Presensi'}
                {!isSubmitting && isWithinRadius && sessionStatus.allowed && <div className="absolute inset-0 bg-white/20 animate-pulse opacity-0 group-hover:opacity-100 transition-opacity" />}
              </button>
              
              <button
                onClick={() => setShowLiburMenu(true)}
                disabled={isSubmitting || !sessionStatus.allowed}
                className={cn(
                  "w-full border font-bold py-4 rounded-lg transition-all flex items-center justify-center gap-3 disabled:opacity-50",
                  sessionStatus.allowed ? "bg-white border-slate-300 text-slate-600 hover:bg-slate-50" : "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed"
                )}
              >
                <XCircle size={24} />
                Status Libur / Izin
              </button>
            </div>
            {status && <p className="text-blue-500 font-bold text-xs animate-pulse tracking-wide uppercase mt-4">{status}</p>}
          </div>
        )}
      </div>

      {showScanner && (
        <div className="fixed inset-0 bg-slate-900/90 z-[100] flex flex-col items-center justify-center p-6 backdrop-blur-md">
          <div className="w-full max-w-md bg-white rounded-3xl overflow-hidden shadow-2xl relative">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="font-black text-slate-800 text-lg uppercase leading-none">Scanner QR</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Arahkan ke QR di Bengkel</p>
              </div>
              <button 
                onClick={() => setShowScanner(false)}
                className="p-2 bg-white rounded-full text-slate-400 hover:text-slate-600 shadow-sm border border-slate-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-4 bg-slate-900 aspect-square flex items-center justify-center">
              <div id="reader" className="w-full rounded-2xl overflow-hidden border-2 border-white/20 shadow-inner"></div>
            </div>

            <div className="p-6 bg-slate-50 text-center">
               <div className="flex items-center justify-center gap-2 mb-2">
                  <Camera size={16} className="text-blue-500 animate-pulse" />
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Kamera Aktif</span>
               </div>
               <p className="text-xs text-slate-400 font-medium">Pastikan QR terlihat jelas dalam kotak focus</p>
            </div>
          </div>
          <p className="mt-8 text-white/60 text-xs font-bold uppercase tracking-widest animate-pulse">Menunggu Scan...</p>
        </div>
      )}

      {showLiburMenu && (
        <div className="fixed inset-0 bg-slate-900/60 z-[60] flex items-center justify-center p-4 backdrop-blur-[2px]">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }} 
            animate={{ scale: 1, opacity: 1 }} 
            className="bg-white w-full max-w-md rounded-xl p-8 shadow-2xl"
          >
            <h4 className="font-bold text-xl text-slate-800 mb-6">Status Libur / Izin</h4>
            <div className="space-y-4">
              <select 
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20"
                value={alasanLibur}
                onChange={(e) => setAlasanLibur(e.target.value)}
              >
                <option value="">Pilih Kategori...</option>
                <option value="Izin">Izin (dengan keterangan)</option>
                <option value="Sakit">Sakit (dengan keterangan)</option>
                <option value="Libur Mitra/dudi">Libur Mitra/dudi</option>
                <option value="Shift Mitra/dudi">Shift Mitra/dudi</option>
                <option value="Kegiatan sekolah">Kegiatan sekolah</option>
                <option value="libur Nasional">Libur Nasional</option>
              </select>
              {(alasanLibur === 'Sakit' || alasanLibur === 'Izin') && (
                <textarea
                  placeholder="Keterangan tambahan..."
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500/20 min-h-[100px]"
                  value={keterangan}
                  onChange={(e) => setKeterangan(e.target.value)}
                />
              )}
              <div className="flex gap-4 pt-6">
                 <button onClick={() => setShowLiburMenu(false)} className="flex-1 btn-secondary text-sm">Batal</button>
                 <button
                   onClick={handleLibur}
                   className="flex-[2] btn-primary text-sm"
                 >
                   Konfirmasi Status
                 </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function ProfilSection({ siswa }: any) {
  const { logout } = useAuth();
  return (
    <div className="max-w-2xl mx-auto py-8">
       <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-900 h-32 relative">
             <div className="absolute -bottom-12 left-10">
                <div className="w-24 h-24 bg-white p-1 rounded-2xl shadow-xl">
                   <div className="w-full h-full bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-3xl">
                      {siswa.nama.charAt(0)}
                   </div>
                </div>
             </div>
          </div>
          <div className="pt-16 pb-8 px-10">
             <h2 className="text-2xl font-bold text-slate-800">{siswa.nama}</h2>
             <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-1">{siswa.nis}</p>
             
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-10">
                <ProfileTile icon={Users} label="Kelas / Jurusan" value={`${siswa.kelas} / ${siswa.jurusan}`} />
                <ProfileTile icon={User} label="No. Handphone" value={siswa.noHp} />
                <ProfileTile icon={Building2} label="Status Program" value="Magang / PKL Aktif" />
                <ProfileTile icon={Calendar} label="Tanggal Mulai" value={siswa.tanggalMulai || '-'} />
                <ProfileTile icon={Calendar} label="Tanggal Selesai" value={siswa.tanggalSelesai || '-'} />
             </div>

             <div className="mt-12 flex flex-col sm:flex-row gap-4">
                <button className="flex-1 btn-secondary text-sm">
                   Ganti Password
                </button>
                <button 
                  onClick={() => logout()}
                  className="flex-1 bg-rose-50 text-rose-600 border border-rose-100 font-bold py-3 px-6 rounded-lg text-sm transition-all hover:bg-rose-100"
                >
                   Keluar Akun
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
       <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-slate-400 shadow-sm border border-slate-100">
          <Icon size={18} />
       </div>
       <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-none mb-1.5">{label}</p>
          <p className="text-sm font-bold text-slate-800 leading-none">{value}</p>
       </div>
    </div>
  );
}

function PengaturanSection({ siswa, onUpdate }: { siswa: any, onUpdate: () => void }) {
  const [mitra, setMitra] = useState<any>(null);
  const [gurus, setGurus] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const [formData, setFormData] = useState({
    guruId: '',
    kepalaBengkel: '',
    noHpKepalaBengkel: '',
    tanggalMulai: '',
    tanggalSelesai: '',
  });

  // Automatically check config presence on mount/siswa ID changes
  useEffect(() => {
    const hasConfig = !!(siswa.guruId || siswa.kepalaBengkel || siswa.tanggalMulai || siswa.tanggalSelesai);
    setIsEditing(!hasConfig);
    if (hasConfig) {
      // Clear input boxes when already configured (as requested)
      setFormData({
        guruId: '',
        kepalaBengkel: '',
        noHpKepalaBengkel: '',
        tanggalMulai: '',
        tanggalSelesai: '',
      });
    } else {
      setFormData({
        guruId: siswa.guruId || '',
        kepalaBengkel: siswa.kepalaBengkel || '',
        noHpKepalaBengkel: siswa.noHpKepalaBengkel || '',
        tanggalMulai: siswa.tanggalMulai || '',
        tanggalSelesai: siswa.tanggalSelesai || '',
      });
    }
  }, [siswa.id]);

  useEffect(() => {
    async function fetchMasters() {
      try {
        if (siswa.mitraId && siswa.mitraId.trim() !== '') {
          const mDoc = await getDoc(doc(db, 'mitra', siswa.mitraId));
          if (mDoc.exists()) {
            setMitra({ id: mDoc.id, ...mDoc.data() });
          }
        }
        const gSnap = await getDocs(collection(db, 'guru'));
        setGurus(gSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error("Error in fetchMasters:", error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchMasters();
  }, [siswa.mitraId]);

  const handleStartEdit = () => {
    setIsEditing(true);
    setFormData({
      guruId: siswa.guruId || '',
      kepalaBengkel: siswa.kepalaBengkel || '',
      noHpKepalaBengkel: siswa.noHpKepalaBengkel || '',
      tanggalMulai: siswa.tanggalMulai || '',
      tanggalSelesai: siswa.tanggalSelesai || '',
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEditing) return;
    setIsSaving(true);
    try {
      // 1. Update Siswa Document
      await updateDoc(doc(db, 'siswa', siswa.id), {
        guruId: formData.guruId,
        kepalaBengkel: formData.kepalaBengkel,
        noHpKepalaBengkel: formData.noHpKepalaBengkel,
        tanggalMulai: formData.tanggalMulai,
        tanggalSelesai: formData.tanggalSelesai,
        updatedAt: serverTimestamp(),
        placementEditedAt: new Date().toISOString()
      });

      // 2. Migrate existing Jurnals to new Guru
      try {
        const jQ = query(collection(db, 'jurnal'), where('siswaId', '==', siswa.id));
        const jSnap = await getDocs(jQ);
        
        if (!jSnap.empty) {
          const batch = writeBatch(db);
          jSnap.docs.forEach((d) => {
            batch.update(d.ref, {
              guruId: formData.guruId
            });
          });
          await batch.commit();
        }
      } catch (err) {
        console.error("Migration error:", err);
      }

      // 3. Update existing Mitra Document if mitraId is present
      if (siswa.mitraId) {
        await updateDoc(doc(db, 'mitra', siswa.mitraId), {
          kepalaMitra: formData.kepalaBengkel,
          noHp: formData.noHpKepalaBengkel,
          updatedAt: serverTimestamp()
        });
      }
      
      alert('Pengaturan berhasil disimpan. Data telah disinkronkan ke database Mitra pusat.');
      
      // Clear inputs and shut down edit mode (automatically disables save button)
      setIsEditing(false);
      setFormData({
        guruId: '',
        kepalaBengkel: '',
        noHpKepalaBengkel: '',
        tanggalMulai: '',
        tanggalSelesai: '',
      });

      onUpdate();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `siswa/${siswa.id}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin text-blue-600" /></div>;

  return (
    <div className="max-w-xl mx-auto py-6">
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
      >
        <div className="p-8 border-b border-slate-100 bg-slate-50/50">
          <div className="flex justify-between items-start">
            <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-white mb-4 shadow-lg">
              <Settings size={24} />
            </div>
            {!isEditing && (siswa.guruId || siswa.kepalaBengkel || siswa.tanggalMulai || siswa.tanggalSelesai) && (
              <button
                type="button"
                onClick={handleStartEdit}
                className="bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-lg flex items-center gap-2 hover:bg-blue-100 transition-all group shadow-sm"
              >
                <Edit3 size={14} className="text-blue-600 group-hover:rotate-12 transition-transform" />
                <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Edit Pengaturan</span>
              </button>
            )}
          </div>
          <h2 className="text-xl font-bold text-slate-800">Pengaturan Penempatan PKL</h2>
          <p className="text-xs text-slate-500 mt-1 font-medium italic">
            Silakan lengkapi guru pembimbing, tanggal mulai, tanggal berakhir, nama kepala bengkel, dan nomor HP kepala bengkel penempatan Anda.
          </p>
        </div>

        <div className="px-8 pt-8 space-y-4">
          {/* Tempat PKL (Ditentukan oleh Admin) */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-3">
            <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 leading-none">
              <Building2 size={12} className="text-slate-400" /> Tempat PKL (Ditentukan oleh Admin)
            </p>
            <div>
              <p className="text-base font-bold text-slate-800 uppercase">{siswa.namaBengkel || mitra?.namaMitra || 'Belum Ditentukan'}</p>
              <p className="text-xs font-bold text-slate-400 mt-1 leading-relaxed capitalize">{siswa.alamatBengkel || mitra?.alamat || '-'}</p>
            </div>
          </div>

          {/* Konfigurasi Aktif */}
          {(siswa.guruId || siswa.kepalaBengkel || siswa.tanggalMulai || siswa.tanggalSelesai) && (
            <div className="bg-blue-50/40 border border-blue-100 rounded-xl p-5 space-y-4">
              <p className="text-[10px] font-extrabold text-blue-500 uppercase tracking-widest flex items-center gap-1.5 leading-none">
                <CheckCircle2 size={12} className="text-blue-500" /> Konfigurasi Aktif Anda
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-medium text-slate-705">
                <div className="space-y-1">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Guru Pembimbing:</span>
                  <span className="text-sm font-extrabold text-slate-800 uppercase">
                    {gurus.find(g => g.id === siswa.guruId)?.nama || 'Belum dipilih'}
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Kepala Bengkel:</span>
                  <span className="text-sm font-extrabold text-slate-805 uppercase">
                    {siswa.kepalaBengkel || '-'}
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Tanggal Mulai PKL:</span>
                  <span className="text-sm font-extrabold text-slate-805">
                    {siswa.tanggalMulai || '-'}
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Tanggal Berakhir PKL:</span>
                  <span className="text-sm font-extrabold text-slate-805">
                    {siswa.tanggalSelesai || '-'}
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">No. HP Kepala Bengkel:</span>
                  <span className="text-sm font-extrabold text-slate-805">
                    {siswa.noHpKepalaBengkel || '-'}
                  </span>
                </div>
                <div className="space-y-1 md:col-span-2 bg-blue-50 p-3 rounded-xl border border-blue-100/50">
                  <span className="text-[9px] font-extrabold text-blue-500 uppercase tracking-wider block mb-1">Durasi Hari PKL:</span>
                  <span className="text-sm font-black text-blue-800">
                    {(() => {
                      if (!siswa.tanggalMulai || !siswa.tanggalSelesai) return 'Tanggal belum diatur lengkap';
                      try {
                        const start = new Date(siswa.tanggalMulai);
                        const end = new Date(siswa.tanggalSelesai);
                        if (isNaN(start.getTime()) || isNaN(end.getTime())) return '-';
                        const days = differenceInDays(end, start) + 1;
                        if (days > 0) {
                          return `${days} Hari Kerja / Kalender`;
                        }
                        return 'Kesalahan: Tanggal berakhir mendahului tanggal mulai';
                      } catch (e) {
                        return '-';
                      }
                    })()}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        <form onSubmit={handleSave} className="p-8 space-y-6">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-[0.1em] ml-1">Pilih Guru Pembimbing PKL</label>
              <div className="relative group">
                <UserCheck size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors" />
                <select 
                  required={isEditing}
                  disabled={!isEditing || isSaving}
                  value={formData.guruId}
                  onChange={(e) => setFormData({...formData, guruId: e.target.value})}
                  className={cn(
                    "w-full pl-11 pr-10 py-3.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold text-slate-700 outline-none transition-all appearance-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 disabled:opacity-50",
                    !isEditing && "bg-slate-100 border-slate-200 cursor-not-allowed text-slate-400"
                  )}
                >
                  <option value="">{isEditing ? "-- Klik untuk Pilih Guru --" : "(Edit untuk memilih)"}</option>
                  {gurus.map(g => <option key={g.id} value={g.id}>{g.nama}</option>)}
                </select>
                <ChevronRight size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none rotate-90" />
              </div>
            </div>

            <div className="pt-2">
              <div className="h-px bg-slate-100 w-full mb-6" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-[0.1em] ml-1">Nama Kepala Bengkel</label>
                  <div className="relative">
                    <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input 
                      type="text"
                      required={isEditing}
                      disabled={!isEditing || isSaving}
                      placeholder={isEditing ? "Input nama kabeng..." : "(Edit untuk mengisi)"}
                      value={formData.kepalaBengkel}
                      onChange={(e) => setFormData({...formData, kepalaBengkel: e.target.value})}
                      className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold text-slate-700 outline-none transition-all focus:border-blue-500 disabled:opacity-50 disabled:bg-slate-100 disabled:border-slate-200 disabled:text-slate-400"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-[0.1em] ml-1">No. HP Kepala Bengkel</label>
                  <div className="relative">
                    <Phone size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input 
                      type="text"
                      required={isEditing}
                      disabled={!isEditing || isSaving}
                      placeholder={isEditing ? "Input No HP Kabeng..." : "(Edit untuk mengisi)"}
                      value={formData.noHpKepalaBengkel}
                      onChange={(e) => setFormData({...formData, noHpKepalaBengkel: e.target.value})}
                      className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold text-slate-700 outline-none transition-all focus:border-blue-500 disabled:opacity-50 disabled:bg-slate-100 disabled:border-slate-200 disabled:text-slate-400"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="space-y-1.5">
                <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-[0.1em] ml-1">Tanggal Mulai PKL</label>
                <div className="relative">
                  <Calendar size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input 
                    type="date"
                    required={isEditing}
                    disabled={!isEditing || isSaving}
                    value={formData.tanggalMulai}
                    onChange={(e) => setFormData({...formData, tanggalMulai: e.target.value})}
                    className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold text-slate-700 outline-none transition-all focus:border-blue-500 disabled:opacity-50 disabled:bg-slate-100 disabled:border-slate-200 disabled:text-slate-400"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-[0.1em] ml-1">Tanggal Berakhir PKL</label>
                <div className="relative">
                  <Calendar size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input 
                    type="date"
                    required={isEditing}
                    disabled={!isEditing || isSaving}
                    value={formData.tanggalSelesai}
                    onChange={(e) => setFormData({...formData, tanggalSelesai: e.target.value})}
                    className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold text-slate-700 outline-none transition-all focus:border-blue-500 disabled:opacity-50 disabled:bg-slate-100 disabled:border-slate-200 disabled:text-slate-400"
                  />
                </div>
              </div>
            </div>

            {isEditing && formData.tanggalMulai && formData.tanggalSelesai && (() => {
              try {
                const start = new Date(formData.tanggalMulai);
                const end = new Date(formData.tanggalSelesai);
                if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                  const days = differenceInDays(end, start) + 1;
                  if (days > 0) {
                    return (
                      <div className="bg-emerald-50 border border-emerald-100 text-emerald-800 p-3 rounded-xl text-xs font-bold">
                        ✓ Total PKL yang dipilih: {days} Hari Kerja / Kalender
                      </div>
                    );
                  } else {
                    return (
                      <div className="bg-rose-50 border border-rose-100 text-rose-800 p-3 rounded-xl text-xs font-bold">
                        ⚠️ Kesalahan: Tanggal berakhir harus setelah tanggal mulai.
                      </div>
                    );
                  }
                }
              } catch (e) {}
              return null;
            })()}
          </div>

          <button 
            disabled={!isEditing || isSaving}
            className={cn(
              "w-full font-bold py-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 group mt-4 outline-none border",
              (!isEditing || isSaving)
                ? "bg-slate-100 text-slate-400 border-slate-250 cursor-not-allowed shadow-none"
                : "bg-blue-600 hover:bg-blue-700 text-white border-transparent shadow-blue-100 focus:ring-4 focus:ring-blue-500/30 active:scale-95"
            )}
          >
            {isSaving ? (
              <Loader2 className="animate-spin" size={18} />
            ) : (
              <>
                Simpan Pengaturan
                <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
