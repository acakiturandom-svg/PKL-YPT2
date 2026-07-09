
import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../lib/auth';
import { Siswa, Jurnal, Mitra, Absensi } from '../../types';
import { Users, BookOpen, ClipboardCheck, Loader2, Building2, User, Phone } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../../lib/utils';

export default function MitraDash({ activeTab }: { activeTab: string }) {
  const { profile } = useAuth();
  const mitra = profile as Mitra;
  const [siswaList, setSiswaList] = useState<Siswa[]>([]);
  const [jurnals, setJurnals] = useState<Jurnal[]>([]);
  const [absensi, setAbsensi] = useState<Absensi[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const sQ = query(collection(db, 'siswa'), where('mitraId', '==', mitra.id));
      const sSnap = await getDocs(sQ);
      const sData = sSnap.docs.map(d => ({ id: d.id, ...d.data() } as Siswa));
      setSiswaList(sData);

      if (sData.length > 0) {
        const jQ = query(collection(db, 'jurnal'), where('mitraId', '==', mitra.id), orderBy('tanggal', 'desc'));
        const jSnap = await getDocs(jQ);
        setJurnals(jSnap.docs.map(d => ({ id: d.id, ...d.data() } as Jurnal)));

        const aQ = query(collection(db, 'absensi'), where('mitraId', '==', mitra.id), orderBy('tanggal', 'desc'));
        const aSnap = await getDocs(aQ);
        setAbsensi(aSnap.docs.map(d => ({ id: d.id, ...d.data() } as Absensi)));
      }
      
      setIsLoading(false);
    }
    fetchData();
  }, [mitra.id]);

  if (isLoading) return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-blue-900" /></div>;

  return (
    <div className="space-y-6">
      {activeTab === 'beranda' && <MitraBeranda siswaList={siswaList} absensi={absensi} />}
      {activeTab === 'siswa' && <SiswaTab siswaList={siswaList} />}
      {activeTab === 'jurnal' && <JurnalMonitor jurnals={jurnals} siswaList={siswaList} />}
      {activeTab === 'kehadiran' && <KehadiranMonitor absensi={absensi} siswaList={siswaList} />}
      {activeTab === 'profil' && <ProfilSection mitra={mitra} />}
    </div>
  );
}

function SiswaTab({ siswaList }: any) {
  return (
    <div className="space-y-6">
       <div className="flex justify-between items-center px-2">
          <h2 className="text-xl font-bold text-slate-800">Siswa PKL Aktif</h2>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-100 px-3 py-1 rounded-full border border-slate-200">{siswaList.length} Siswa</span>
       </div>
       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {siswaList.map((s: any) => (
            <div key={s.id} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center gap-5 group hover:border-blue-300 transition-all border-l-4 border-l-blue-600">
               <div className="w-16 h-16 bg-slate-50 rounded-xl flex items-center justify-center font-bold text-slate-800 text-2xl border border-slate-100 shadow-inner group-hover:bg-blue-600 group-hover:text-white transition-all shrink-0">
                 {s.nama.charAt(0)}
               </div>
               <div className="flex-1 min-w-0">
                 <p className="text-base font-bold text-slate-800 truncate leading-none mb-1.5 uppercase">{s.nama}</p>
                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 truncate">{s.kelas} • {s.jurusan}</p>
                 
                 {s.kepalaBengkel && (
                   <div className="mt-3 pt-3 border-t border-slate-50 space-y-1">
                      <div className="flex items-center gap-2">
                        <User size={10} className="text-blue-500" />
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">Kabeng: {s.kepalaBengkel}</span>
                      </div>
                      {s.noHpKepalaBengkel && (
                        <div className="flex items-center gap-2">
                          <Phone size={10} className="text-slate-400" />
                          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">HP: {s.noHpKepalaBengkel}</span>
                        </div>
                      )}
                   </div>
                 )}
               </div>
               <div className="hidden sm:flex flex-col gap-2">
                  <div className="bg-emerald-50 text-emerald-600 text-[8px] font-bold px-2 py-1 rounded border border-emerald-100 uppercase text-center">Aktif</div>
                  {s.noHp && <div className="bg-slate-50 text-slate-500 text-[8px] font-bold px-2 py-1 rounded border border-slate-100 uppercase text-center">WA Siswa</div>}
               </div>
            </div>
          ))}
          {siswaList.length === 0 && (
            <div className="md:col-span-2 py-12 bg-white rounded-xl border border-dashed border-slate-300 text-center text-slate-400 italic">
               Belum ada siswa yang terhubung dengan mitra Anda.
            </div>
          )}
       </div>
    </div>
  );
}

function MitraBeranda({ siswaList, absensi }: any) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const aToday = absensi.filter((a: any) => a.tanggal === today);

  return (
    <div className="space-y-6">
      <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="relative z-10">
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Status Kerjasama Industri</h2>
          <p className="text-sm text-slate-500 mt-1">Lembaga mitra PKL SMK YPT 2 Purbalingga.</p>
        </div>
        <div className="absolute top-0 right-0 p-8 opacity-5">
           <Building2 size={80} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Siswa Aktif</p>
            <p className="text-3xl font-bold text-slate-800 tracking-tighter">{siswaList.length}</p>
          </div>
          <div className="w-12 h-12 bg-blue-50 text-blue-500 rounded-lg flex items-center justify-center">
             <Users size={24} />
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Kehadiran (Hari Ini)</p>
            <p className="text-3xl font-bold text-emerald-600 tracking-tighter">{aToday.filter((a: any) => a.tipe === 'hadir').length}</p>
          </div>
          <div className="w-12 h-12 bg-emerald-50 text-emerald-500 rounded-lg flex items-center justify-center">
             <ClipboardCheck size={24} />
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
         <h3 className="text-sm font-bold text-slate-800 mb-6 flex items-center gap-2">
            <Building2 size={18} className="text-slate-400" />
            Informasi Institusi Asal
         </h3>
         <div className="flex items-center gap-4 py-4 px-6 bg-slate-50 rounded-xl border border-slate-100">
            <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center shadow-sm border border-slate-100">
               <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center text-white text-[10px] font-bold uppercase">SMK</div>
            </div>
            <div>
               <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">PROGRAM KEAHLIAN / SEKOLAH</p>
               <p className="text-base font-bold text-slate-800 leading-none">SMK YPT 2 Purbalingga</p>
            </div>
         </div>
         <div className="mt-6 pt-6 border-t border-slate-100 flex justify-between items-center px-2">
            <p className="text-xs font-bold text-slate-400">Periode Aktif:</p>
            <span className="bg-blue-50 text-blue-600 text-[10px] font-bold px-3 py-1 rounded-full border border-blue-100 uppercase">Januari - Juni 2026</span>
         </div>
      </div>
    </div>
  );
}

function JurnalMonitor({ jurnals, siswaList }: any) {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
         <h3 className="text-xl font-bold text-slate-800">Review Laporan Kerja</h3>
         <span className="text-xs font-medium text-slate-400">{jurnals.length} Laporan Terbaru</span>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Siswa</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tanggal</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Isi Jurnal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {jurnals.map((j: any) => {
                const s = siswaList.find((item: any) => item.id === j.siswaId);
                return (
                  <tr key={j.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                       <span className="text-sm font-bold text-slate-800">{s?.nama || 'Siswa'}</span>
                    </td>
                    <td className="px-6 py-4 text-xs font-medium text-slate-500">{j.tanggal}</td>
                    <td className="px-6 py-4">
                       <p className="text-sm text-slate-600 italic leading-relaxed">"{j.kegiatan}"</p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function KehadiranMonitor({ absensi, siswaList }: any) {
  return (
    <div className="space-y-6">
      <h3 className="text-xl font-bold text-slate-800">Rekap Absensi Harian</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {absensi.map((a: any) => {
          const s = siswaList.find((item: any) => item.id === a.siswaId);
          return (
            <div key={a.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center group hover:border-blue-200 transition-colors">
              <div className="flex gap-4 items-center">
                <div className={cn(
                  "w-12 h-12 rounded-lg flex items-center justify-center font-bold text-base border",
                  a.tipe === 'hadir' ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-amber-50 text-amber-600 border-amber-100"
                )}>
                  {a.tipe === 'hadir' ? 'H' : ((a.alasanLibur || '').toLowerCase().includes('sakit') ? 'S' : (a.alasanLibur || '').toLowerCase().includes('izin') ? 'I' : 'L')}
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800 leading-none mb-1.5">{s?.nama || 'Siswa'}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    {a.tanggal} {a.jamCheckin ? ` @ ${a.jamCheckin}` : ''}
                  </p>
                  {a.keteranganLibur && (
                    <p className="text-[10px] text-amber-800/80 italic mt-1 leading-normal max-w-xs shrink-0 font-medium">
                      Ket: "{a.keteranganLibur}"
                    </p>
                  )}
                </div>
              </div>
              <div className="text-right">
                <span className={cn(
                  "text-[10px] font-bold uppercase px-2.5 py-1 rounded-full border",
                  a.tipe === 'hadir' ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-amber-50 text-amber-600 border-amber-100"
                )}>
                  {a.tipe === 'hadir' ? 'Hadir' : (a.alasanLibur || 'Libur/Izin')}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProfilSection({ mitra }: any) {
  return (
    <div className="max-w-2xl mx-auto py-8">
       <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-900 h-24"></div>
          <div className="px-10 pb-10">
             <div className="relative -mt-12 flex items-end gap-6 mb-8">
                <div className="w-24 h-24 bg-white p-1 rounded-2xl shadow-xl">
                   <div className="w-full h-full bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-3xl">
                      {mitra.namaMitra.charAt(0)}
                   </div>
                </div>
                <div className="pb-2">
                   <h2 className="text-2xl font-bold text-slate-800 leading-none">{mitra.namaMitra}</h2>
                   <p className="text-sm font-medium text-slate-400 mt-2">KODE: {mitra.kodeMitra}</p>
                </div>
             </div>

             <div className="space-y-4">
                <div className="bg-slate-50 p-6 rounded-xl border border-slate-100">
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Alamat Perusahaan</p>
                   <p className="text-sm font-medium text-slate-700 leading-relaxed">{mitra.alamat}</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                   <div className="bg-slate-50 p-6 rounded-xl border border-slate-100 text-center">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Radius Absensi</p>
                      <p className="text-2xl font-bold text-slate-800">{mitra.radiusAbsensi || 100}m</p>
                   </div>
                   <div className="bg-slate-50 p-6 rounded-xl border border-slate-100 text-center">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Bidang Usaha</p>
                      <p className="text-sm font-bold text-slate-800 truncate">{mitra.bidangUsaha || 'Mitra PKL'}</p>
                   </div>
                </div>
             </div>

             <div className="mt-10 pt-10 border-t border-slate-100">
                <button className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 rounded-lg text-sm transition-all active:scale-95 shadow-lg shadow-slate-200">
                   Ubah Profil Industri
                </button>
             </div>
          </div>
       </div>
    </div>
  );
}
