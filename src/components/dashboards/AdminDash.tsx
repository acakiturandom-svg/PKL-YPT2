
import React, { useState, useEffect } from 'react';
import { collection, query, doc, where, orderBy, limit, getCountFromServer } from 'firebase/firestore';
import { db, getDocs, getDoc, addDoc, updateDoc, deleteDoc } from '../../lib/firebase';
import { Siswa, Guru, Mitra, Jurnal, Absensi } from '../../types';
import { hashPassword, cn, extractCoordinates } from '../../lib/utils';
import { Users, UserCheck, Building2, Plus, Search, Trash2, Edit2, RotateCcw, Loader2, Filter, Download, Upload, AlertCircle, User, FileSpreadsheet, QrCode as QrIcon, MapPin } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import InteractiveOSMMap from '../InteractiveOSMMap';

export default function AdminDash({ activeTab }: { activeTab: string }) {
  const [data, setData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<any | null>(null);
  
  const [mitras, setMitras] = useState<Mitra[]>([]);
  const [gurus, setGurus] = useState<Guru[]>([]);
  const [recentUpdates, setRecentUpdates] = useState<any[]>([]);

  // Stats for Beranda
  const [stats, setStats] = useState({ siswa: 0, guru: 0, mitra: 0, absenToday: 0 });

  useEffect(() => {
    async function fetchAll() {
      setIsLoading(true);
      try {
        // 1. Get stats counts via server-side getCountFromServer (practically 0 reads!)
        let mCount = 0;
        let gCount = 0;
        let sCount = 0;
        try {
          const mColl = collection(db, 'mitra');
          const gColl = collection(db, 'guru');
          const sColl = collection(db, 'siswa');
          const [mCountSnap, gCountSnap, sCountSnap] = await Promise.all([
            getCountFromServer(mColl),
            getCountFromServer(gColl),
            getCountFromServer(sColl)
          ]);
          mCount = mCountSnap.data().count;
          gCount = gCountSnap.data().count;
          sCount = sCountSnap.data().count;
        } catch (countErr) {
          console.warn("Failed to retrieve server counts:", countErr);
        }

        setStats({
          siswa: sCount,
          guru: gCount,
          mitra: mCount,
          absenToday: 0
        });

        // 2. Fetch Masters for drop-downs lazily ONLY ONCE per session to avoid redundant reads
        let mList = mitras;
        if (mitras.length === 0) {
          const mSnap = await getDocs(query(collection(db, 'mitra'), limit(150)));
          mList = mSnap.docs.map(d => ({ id: d.id, ...d.data() } as Mitra));
          setMitras(mList);
        }

        let gList = gurus;
        if (gurus.length === 0) {
          const gSnap = await getDocs(query(collection(db, 'guru'), limit(150)));
          gList = gSnap.docs.map(d => ({ id: d.id, ...d.data() } as Guru));
          setGurus(gList);
        }

        // 3. Fetch specific activeTab lists with safe limit(150)
        if (activeTab === 'beranda') {
          const now = new Date();
          const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

          const sSnap = await getDocs(query(collection(db, 'siswa'), limit(100)));
          const sList = sSnap.docs.map(d => ({ id: d.id, ...d.data() }));

          const filteredRecent = sList.filter((s: any) => {
            if (!s.placementEditedAt) return false;
            try {
              const editTime = new Date(s.placementEditedAt);
              return editTime >= oneDayAgo && editTime <= now;
            } catch (e) {
              return false;
            }
          });

          setRecentUpdates(filteredRecent);
        } else if (['siswa', 'guru', 'mitra', 'monitoring'].includes(activeTab)) {
          if (activeTab === 'siswa') {
            const sSnap = await getDocs(query(collection(db, 'siswa'), limit(150)));
            setData(sSnap.docs.map(d => ({ id: d.id, ...d.data() })));
          } else {
            const col = activeTab === 'monitoring' ? 'jurnal' : activeTab;
            const q = activeTab === 'monitoring' 
              ? query(collection(db, col), orderBy('tanggal', 'desc'), limit(150)) 
              : query(collection(db, col), limit(150));
            const snap = await getDocs(q);
            setData(snap.docs.map(d => ({ id: d.id, ...d.data() })));
          }
        }
      } catch (err) {
        console.error("Error in fetchAll AdminDash:", err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchAll();
  }, [activeTab]);

  if (isLoading) return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-blue-900" /></div>;

  return (
    <div className="space-y-6">
      {activeTab === 'beranda' && <AdminBeranda stats={stats} recentUpdates={recentUpdates} mitras={mitras} />}
      {activeTab === 'siswa' && <EntityManager type="siswa" data={data} setData={setData} mitras={mitras} gurus={gurus} stats={stats} />}
      {activeTab === 'guru' && <EntityManager type="guru" data={data} setData={setData} mitras={mitras} gurus={gurus} stats={stats} />}
      {activeTab === 'mitra' && <EntityManager type="mitra" data={data} setData={setData} mitras={mitras} gurus={gurus} stats={stats} />}
      {activeTab === 'monitoring' && <MonitoringSection data={data} />}
    </div>
  );
}

function AdminBeranda({ stats, recentUpdates = [], mitras = [] }: any) {

  return (
    <div className="space-y-6">
      <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="relative z-10">
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Panel Administrasi</h2>
          <p className="text-sm text-slate-500 mt-1">Kelola data master dan pantau seluruh kegiatan PKL.</p>
        </div>
        <div className="absolute top-0 right-0 p-8 opacity-5">
           <UserCheck size={80} />
        </div>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsTile label="Mahasiswa / Siswa" value={stats.siswa} icon={Users} color="blue" />
        <StatsTile label="Guru Pembimbing" value={stats.guru} icon={UserCheck} color="indigo" />
        <StatsTile label="Mitra Industri" value={stats.mitra} icon={Building2} color="amber" />
        <StatsTile label="Laporan Harian" value={stats.absenToday} icon={Search} color="emerald" />
      </div>

      <div className="space-y-2">
        <div className="flex flex-col">
          <h3 className="text-lg font-extrabold text-slate-800 tracking-tight">Peta Lokasi Mitra & Bengkel PKL</h3>
          <p className="text-xs text-slate-500 mt-0.5">Integrasi OpenStreetMap & Leaflet riil bebas dari konfigurasi Google API key.</p>
        </div>
        <InteractiveOSMMap mitras={mitras} />
      </div>

      {recentUpdates.length > 0 && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-sm text-slate-400 uppercase mb-6 tracking-wider flex items-center gap-2">
            <AlertCircle size={16} className="text-amber-500" />
            Notifikasi Sistem
          </h3>
          <div className="space-y-3">
            {recentUpdates.map((student: any) => {
              const formattedTime = student.placementEditedAt 
                ? format(new Date(student.placementEditedAt), 'dd MMM yyyy, HH:mm') 
                : 'Baru saja';
              return (
                <div key={student.id} className="bg-amber-50 p-4 rounded-xl border border-amber-200 flex items-center gap-4">
                  <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-amber-500 shadow-sm shrink-0 border border-amber-100">
                    <AlertCircle size={20} />
                  </div>
                  <div className="text-sm">
                    <p className="font-bold text-amber-800">Perubahan Penempatan PKL Siswa</p>
                    <p className="text-amber-700/80 mt-0.5">
                      Siswa <span className="font-extrabold text-slate-800">{student.nama}</span> ({student.kelas}) telah melakukan perubahan dengan mengedit pengaturan penempatan PKL pada {formattedTime}.
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function StatsTile({ label, value, icon: Icon, color }: any) {
  const colors: any = {
    blue: "text-blue-600 bg-blue-50 border-blue-100",
    indigo: "text-indigo-600 bg-indigo-50 border-indigo-100",
    amber: "text-amber-600 bg-amber-50 border-amber-100",
    emerald: "text-emerald-600 bg-emerald-50 border-emerald-100"
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm group hover:border-blue-300 transition-all">
      <div className={cn("w-12 h-12 rounded-lg flex items-center justify-center mb-4 border", colors[color])}>
        <Icon size={24} />
      </div>
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-3xl font-bold text-slate-800 tracking-tight">{value}</p>
    </div>
  );
}

function EntityManager({ type, data, setData, mitras, gurus, stats }: any) {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<any>({});
  const [isSaving, setIsSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [showQrModal, setShowQrModal] = useState<any>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [search, setSearch] = useState('');
  const [jurusanFilter, setJurusanFilter] = useState('');

  const [isResolvingLink, setIsResolvingLink] = useState(false);
  const [resolvingError, setResolvingError] = useState<string | null>(null);
  const [isSyncingGps, setIsSyncingGps] = useState(false);

  // Silent automatic sync to align any new or modified data
  useEffect(() => {
    if (type === 'siswa' && mitras.length > 0 && data.length > 0) {
      const silentSync = async () => {
        try {
          const updatedSiswaList: any[] = [];
          for (const s of data) {
            const sNama = (s.namaBengkel || '').trim();
            const sAlamat = (s.alamatBengkel || '').trim();
            if (!sNama) continue;

            let matchingMitra = null;
            // 1. Exact match name & address (if address given)
            matchingMitra = mitras.find((m: any) => {
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

            // 2. Fuzzy match name (contain relationship)
            if (!matchingMitra) {
              matchingMitra = mitras.find((m: any) => {
                const mNameClean = (m.namaMitra || '').trim().toLowerCase();
                const bNameClean = sNama.toLowerCase();
                if (mNameClean.length < 4 || bNameClean.length < 4) return false;
                return mNameClean.includes(bNameClean) || bNameClean.includes(mNameClean);
              });
            }

            if (matchingMitra) {
              const mCoords = matchingMitra.koordinatGPS || null;
              const currentCoords = s.koordinatGPS || null;
              const currentMitraId = s.mitraId || '';

              const isCoordsDifferent = !currentCoords || 
                currentCoords.lat !== mCoords?.lat || 
                currentCoords.lng !== mCoords?.lng;
              
              const isIdDifferent = currentMitraId !== matchingMitra.id;

              if (isCoordsDifferent || isIdDifferent) {
                await updateDoc(doc(db, 'siswa', s.id), {
                  koordinatGPS: mCoords,
                  mitraId: matchingMitra.id
                });
                updatedSiswaList.push({
                  ...s,
                  koordinatGPS: mCoords,
                  mitraId: matchingMitra.id
                });
              }
            }
          }
          if (updatedSiswaList.length > 0) {
            setData(prev => 
              prev.map(item => {
                const up = updatedSiswaList.find(u => u.id === item.id);
                return up ? { ...item, ...up } : item;
              })
            );
            console.log("Silent global sync completed. Aligned GPS for", updatedSiswaList.length, "siswa.");
          }
        } catch (e) {
          console.error("Gagal silent sync GPS:", e);
        }
      };
      silentSync();
    }
  }, [type, mitras, data.length]);

  const syncSiswaGpsWithMitra = async () => {
    setIsSyncingGps(true);
    let matchedCount = 0;
    let totalChecked = 0;
    try {
      const mSnap = await getDocs(collection(db, 'mitra'));
      const mList = mSnap.docs.map(d => ({ id: d.id, ...d.data() } as Mitra));
      
      const sSnap = await getDocs(collection(db, 'siswa'));
      const sList = sSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

      const updatedSiswaList: any[] = [];

      for (const s of sList) {
        totalChecked++;
        const sNama = (s.namaBengkel || '').trim();
        const sAlamat = (s.alamatBengkel || '').trim();

        if (!sNama) continue;

        let matchingMitra = null;
        
        // A. Primary Exact match
        matchingMitra = mList.find(m => {
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

        // B. Secondary Fuzzy substring match
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
          const currentCoords = s.koordinatGPS || null;
          const currentMitraId = s.mitraId || '';

          const isCoordsDifferent = !currentCoords || 
            currentCoords.lat !== mCoords?.lat || 
            currentCoords.lng !== mCoords?.lng;
          
          const isIdDifferent = currentMitraId !== matchingMitra.id;

          if (isCoordsDifferent || isIdDifferent) {
            await updateDoc(doc(db, 'siswa', s.id), {
              koordinatGPS: mCoords,
              mitraId: matchingMitra.id
            });
            matchedCount++;
            
            updatedSiswaList.push({
              ...s,
              koordinatGPS: mCoords,
              mitraId: matchingMitra.id
            });
          }
        }
      }

      if (updatedSiswaList.length > 0) {
        setData(prev => 
          prev.map(item => {
            const up = updatedSiswaList.find(u => u.id === item.id);
            return up ? { ...item, ...up } : item;
          })
        );
      }

      alert(`Sinkronisasi Koordinat Sukses!\n\n${totalChecked} siswa diperiksa.\n${matchedCount} siswa berhasil disinkronkan dengan koordinat GPS Mitra Industri.`);
    } catch (e) {
      console.error("Gagal sinkronisasi data GPS:", e);
      alert("Gagal melakukan sinkronisasi: " + (e as Error).message);
    } finally {
      setIsSyncingGps(false);
    }
  };

  const resolveGoogleMapsLink = async (urlStr: string) => {
    if (!urlStr || typeof urlStr !== 'string') return;
    const trimmed = urlStr.trim();
    if (!trimmed.startsWith('http')) return;

    setIsResolvingLink(true);
    setResolvingError(null);
    try {
      const response = await fetch(`/api/resolve-maps?url=${encodeURIComponent(trimmed)}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      if (result.success && result.coords) {
        setFormData((prev: any) => ({
          ...prev,
          googleMapsLink: trimmed,
          koordinatGPS: result.coords
        }));
      } else {
        setResolvingError("Link valid tapi koordinat GPS tidak berhasil diekstrak.");
      }
    } catch (error: any) {
      console.error("Error resolving maps link:", error);
      setResolvingError("Gagal menghubungi server untuk mengurai link Maps.");
    } finally {
      setIsResolvingLink(false);
    }
  };

  const downloadData = () => {
    let exportData = [];
    if (type === 'siswa') {
      const gMap = gurus.reduce((acc: any, g: any) => ({ ...acc, [g.id]: g.nama }), {});
      const mMap = mitras.reduce((acc: any, m: any) => ({ ...acc, [m.id]: m.namaMitra }), {});
      exportData = data.map((d: any) => ({
        'Nama': d.nama,
        'NIS': d.nis,
        'Kelas': d.kelas,
        'Jurusan': d.jurusan,
        'Guru Pembimbing': gMap[d.guruId] || '-',
        'Tempat PKL': d.namaBengkel || mMap[d.mitraId] || '-',
        'Nama Bengkel': d.namaBengkel || d.nama_bengkel || '-',
        'Alamat Bengkel': d.alamatBengkel || d.alamat_bengkel || '-',
        'No HP': d.noHp,
        'Kepala Bengkel': d.kepalaBengkel || '-',
        'Kontak Kabeng': d.noHpKepalaBengkel || '-'
      }));
    } else if (type === 'guru') {
      exportData = data.map((d: any) => ({
        'Nama': d.nama,
        'ID Guru': d.idGuru,
        'Mapel': d.mapel,
        'No HP': d.noHp,
        'Username': d.username
      }));
    } else if (type === 'mitra') {
      exportData = data.map((d: any) => ({
        'Nama Mitra': d.namaMitra,
        'Kepala Bengkel': d.kepalaMitra || '-',
        'Alamat': d.alamat,
        'Jurusan': d.jurusan,
        'No HP': d.noHp,
        'Username': d.username
      }));
    }

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Data ${type}`);
    XLSX.writeFile(wb, `Data_${type}_SIPKL_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const downloadQR = () => {
    const canvas = document.getElementById("qr-gen") as HTMLCanvasElement;
    if (canvas && showQrModal) {
      const pngUrl = canvas
        .toDataURL("image/png")
        .replace("image/png", "image/octet-stream");
      let downloadLink = document.createElement("a");
      downloadLink.href = pngUrl;
      downloadLink.download = `QR_SIPKL_${showQrModal.namaMitra.replace(/\s+/g, '_')}.png`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    }
  };

  const downloadAllMitraQRs = async () => {
    const list = data.filter((item: any) => item.id && item.namaMitra);
    if (list.length === 0) {
      alert("Tidak ada data mitra untuk didownload QR Code-nya.");
      return;
    }

    try {
      const zip = new JSZip();
      let count = 0;
      for (const item of list) {
        const canvas = document.getElementById(`qr-hidden-${item.id}`) as HTMLCanvasElement;
        if (canvas) {
          const dataUrl = canvas.toDataURL("image/png");
          const base64Data = dataUrl.split(',')[1];
          const filename = `QR_SIPKL_${item.namaMitra.replace(/[^a-zA-Z0-9_\-]/g, '_')}.png`;
          zip.file(filename, base64Data, { base64: true });
          count++;
        }
      }

      if (count === 0) {
        alert("Gagal menemukan canvas QR Code di halaman. Silakan coba lagi.");
        return;
      }

      const content = await zip.generateAsync({ type: "blob" });
      const downloadLink = document.createElement("a");
      downloadLink.href = URL.createObjectURL(content);
      downloadLink.download = `Seluruh_QR_Mitra_SIPKL_${format(new Date(), 'yyyy-MM-dd')}.zip`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    } catch (err) {
      console.error(err);
      alert("Terjadi kesalahan saat memproses ZIP QR Code.");
    }
  };

  const handleResetAll = async () => {
    setIsSaving(true);
    try {
      const snap = await getDocs(collection(db, type));
      const deletePromises = snap.docs.map(d => deleteDoc(doc(db, type, d.id)));
      await Promise.all(deletePromises);
      setData([]);
      setShowResetConfirm(false);
      alert(`Berhasil menghapus seluruh data ${type} secara permanen.`);
    } catch (e) {
      console.error(e);
      alert('Gagal meriset data. Pastikan Anda memiliki akses dan koneksi internet stabil.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const payload = { ...formData, role: type };
      
      if (type === 'siswa') {
        const rawNamaBengkel = (payload.namaBengkel || '').trim();
        const rawAlamatBengkel = (payload.alamatBengkel || '').trim();
        
        let matchingMitra = null;
        if (rawNamaBengkel) {
          matchingMitra = mitras?.find((m: any) => {
            const mNameClean = (m.namaMitra || '').trim().toLowerCase();
            const mAddressClean = (m.alamat || '').trim().toLowerCase();
            const bNameClean = rawNamaBengkel.toLowerCase();
            const bAddressClean = rawAlamatBengkel.toLowerCase();
            
            if (rawAlamatBengkel) {
              return mNameClean === bNameClean && mAddressClean === bAddressClean;
            } else {
              return mNameClean === bNameClean;
            }
          });
        }
        
        if (matchingMitra) {
          payload.mitraId = matchingMitra.id;
          if (matchingMitra.koordinatGPS) {
            payload.koordinatGPS = matchingMitra.koordinatGPS;
          }
        } else if (payload.mitraId) {
          const matchingById = mitras?.find((m: any) => m.id === payload.mitraId);
          if (matchingById && matchingById.koordinatGPS) {
            payload.koordinatGPS = matchingById.koordinatGPS;
          }
        }
      }
      
      // Handle password hashing if changed or new
      if (payload.password && payload.password !== '********' && payload.password.trim() !== '') {
        payload.passwordOri = payload.password;
        payload.password = await hashPassword(payload.password);
      } else if (!editId) {
        // Default password for NEW record if empty
        const defaultPass = '123456';
        payload.passwordOri = defaultPass;
        payload.password = await hashPassword(defaultPass);
      } else if (editId) {
        // If editing and password is not touched or empty string, remove it from payload to avoid overwriting with '********'
        delete payload.password;
      }

      if (payload.username) {
        payload.username = payload.username.trim();
      }
      if (payload.nis) {
        payload.nis = payload.nis.trim();
      }
      if (payload.idGuru) {
        payload.idGuru = payload.idGuru.trim();
      }

      if (editId) {
        const itemRef = doc(db, type, editId);
        await updateDoc(itemRef, payload);
        setData(data.map((item: any) => item.id === editId ? { ...item, ...payload } : item));

        // Sync coordinates recursively from Mitra to Siswa when Mitra is updated
        if (type === 'mitra') {
          try {
            const siswaSnap = await getDocs(collection(db, 'siswa'));
            for (const sDoc of siswaSnap.docs) {
              const sData = sDoc.data();
              const sNamaBengkel = (sData.namaBengkel || '').trim();
              const sAlamatBengkel = (sData.alamatBengkel || '').trim();

              const isIdMatch = sData.mitraId === editId;
              const isNameAddrMatch = sNamaBengkel.toLowerCase() === payload.namaMitra.trim().toLowerCase() &&
                (!sAlamatBengkel || sAlamatBengkel.toLowerCase() === (payload.alamat || '').trim().toLowerCase());

              if (isIdMatch || isNameAddrMatch) {
                await updateDoc(doc(db, 'siswa', sDoc.id), {
                  koordinatGPS: payload.koordinatGPS || null,
                  mitraId: editId
                });
              }
            }
          } catch (syncErr) {
            console.error("Gagal sinkronisasi koordinat mitra ke data siswa:", syncErr);
          }
        }
      } else {
        // Default username to nis or idGuru if empty
        if (!payload.username) {
          payload.username = (payload.nis || payload.idGuru || '').trim();
        }
        const docRef = await addDoc(collection(db, type), payload);
        setData([{ id: docRef.id, ...payload }, ...data]);

        // Sync coordinates recursively from newly registered Mitra to existing matching Siswa
        if (type === 'mitra') {
          try {
            const siswaSnap = await getDocs(collection(db, 'siswa'));
            for (const sDoc of siswaSnap.docs) {
              const sData = sDoc.data();
              const sNamaBengkel = (sData.namaBengkel || '').trim();
              const sAlamatBengkel = (sData.alamatBengkel || '').trim();

              const isNameAddrMatch = sNamaBengkel.toLowerCase() === payload.namaMitra.trim().toLowerCase() &&
                (!sAlamatBengkel || sAlamatBengkel.toLowerCase() === (payload.alamat || '').trim().toLowerCase());

              if (isNameAddrMatch) {
                await updateDoc(doc(db, 'siswa', sDoc.id), {
                  koordinatGPS: payload.koordinatGPS || null,
                  mitraId: docRef.id
                });
              }
            }
          } catch (syncErr) {
            console.error("Gagal sinkronisasi koordinat mitra baru ke data siswa:", syncErr);
          }
        }
      }
      
      setShowForm(false);
      setEditId(null);
      setFormData({});
    } catch (e) {
      console.error(e);
      alert('Gagal menyimpan data');
    } finally {
      setIsSaving(false);
    }
  };

  const downloadTemplate = () => {
    let headers = [];
    let filename = "";
    let sheetName = "";

    if (type === 'siswa') {
      headers = [['nama', 'nis', 'kelas', 'jurusan', 'username', 'password', 'nomor Hp', 'nama bengkel', 'alamat bengkel']];
      filename = "template_siswa_sipkl.xlsx";
      sheetName = "Template Siswa";
    } else if (type === 'guru') {
      headers = [['nama', 'idGuru', 'mapel', 'username', 'password']];
      filename = "template_guru_sipkl.xlsx";
      sheetName = "Template Guru";
    } else {
      headers = [['nama mitra', 'nama kepala bengkel', 'jurusan pkl', 'alamat', 'nomor Hp', 'link google maps', 'username', 'password']];
      filename = "template_mitra_sipkl.xlsx";
      sheetName = "Template Mitra";
    }

    const ws = XLSX.utils.aoa_to_sheet(headers);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, filename);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      setIsSaving(true);
      setUploadProgress(0);
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const rows = XLSX.utils.sheet_to_json(ws);

        if (rows.length === 0) {
          alert('File kosong atau tidak valid.');
          return;
        }

        const newList = [];

        for (let i = 0; i < rows.length; i++) {
          const row: any = rows[i];
          const plainPassword = String(row.password || '123456');
          const hashedPassword = await hashPassword(plainPassword);

          let username = String(row.username || row.nis || row.idGuru || '').trim();
          
          let payload: any = {
            username: username,
            password: hashedPassword,
            passwordOri: plainPassword,
            role: type
          };

          if (type === 'siswa') {
            const rawNamaBengkel = String(row['nama bengkel'] || row.namaBengkel || row.nama_bengkel || '').trim();
            const rawAlamatBengkel = String(row['alamat bengkel'] || row.alamatBengkel || row.alamat_bengkel || '').trim();
            
            let matchingMitra = null;
            if (rawNamaBengkel) {
              matchingMitra = mitras?.find((m: any) => {
                const mNameClean = (m.namaMitra || '').trim().toLowerCase();
                const mAddressClean = (m.alamat || '').trim().toLowerCase();
                const bNameClean = rawNamaBengkel.toLowerCase();
                const bAddressClean = rawAlamatBengkel.toLowerCase();
                
                if (rawAlamatBengkel) {
                  return mNameClean === bNameClean && mAddressClean === bAddressClean;
                } else {
                  return mNameClean === bNameClean;
                }
              });
            }

            payload = {
              ...payload,
              nama: String(row.nama || ''),
              nis: String(row.nis || row.username || ''),
              kelas: String(row.kelas || ''),
              jurusan: String(row.jurusan || ''),
              noHp: String(row['nomor Hp'] || row.noHp || row.nomor_hp || ''),
              namaBengkel: rawNamaBengkel,
              alamatBengkel: rawAlamatBengkel,
              mitraId: matchingMitra ? matchingMitra.id : '',
              koordinatGPS: matchingMitra?.koordinatGPS || null,
              tanggalMulai: '',
              tanggalSelesai: ''
            };
          } else if (type === 'guru') {
            payload = {
              ...payload,
              nama: String(row.nama || ''),
              idGuru: String(row.idGuru || row.username || ''),
              mapel: String(row.mapel || '')
            };
          } else if (type === 'mitra') {
            const rawGmaps = String(row['link google maps'] || row.googleMapsLink || row.google_maps_link || row.gmaps || '').trim();
            const parsedCoords = extractCoordinates(rawGmaps);
            payload = {
              ...payload,
              namaMitra: String(row['nama mitra'] || row.nama_mitra || row.nama || ''),
              kepalaMitra: String(row['nama kepala bengkel'] || row.nama_kepala_bengkel || row['nama kepala'] || row.nama_kepala || row.kepala || ''),
              alamat: String(row.alamat || ''),
              jurusan: String(row['jurusan pkl'] || row.jurusan || ''),
              noHp: String(row['nomor Hp'] || row.noHp || row.nomor_hp || ''),
              googleMapsLink: rawGmaps,
              koordinatGPS: parsedCoords || { lat: 0, lng: 0 }
            };
          }

          const docRef = await addDoc(collection(db, type), payload);
          newList.push({ id: docRef.id, ...payload });
          
          setUploadProgress(Math.round(((i + 1) / rows.length) * 100));
        }

        setData([...newList, ...data]);
        alert(`Berhasil mengunggah ${newList.length} data ${type}.`);
      } catch (err) {
        console.error(err);
        alert('Gagal memproses file Excel.');
      } finally {
        setIsSaving(false);
        setUploadProgress(0);
        if (e.target) e.target.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus selamanya data ini?')) return;
    await deleteDoc(doc(db, type, id));
    setData(data.filter((item: any) => item.id !== id));
  };

  const handleClearSiswaData = async (id: string, nama: string) => {
    if (!confirm(`Hapus seluruh konfigurasi penempatan PKL (Guru, Tanggal Mulai/Berakhir, Kepala Bengkel, No. HP) untuk siswa "${nama}"?`)) return;
    try {
      const itemRef = doc(db, 'siswa', id);
      const updatedFields = {
        guruId: "",
        kepalaBengkel: "",
        noHpKepalaBengkel: "",
        tanggalMulai: "",
        tanggalSelesai: ""
      };
      await updateDoc(itemRef, updatedFields);
      setData(data.map((item: any) => item.id === id ? { ...item, ...updatedFields } : item));
      alert(`Berhasil membersihkan konfigurasi penempatan PKL untuk siswa "${nama}".`);
    } catch (e) {
      console.error(e);
      alert('Gagal membersihkan data penempatan siswa.');
    }
  };

  const handleEdit = (item: any) => {
    setFormData({ ...item, password: '********' }); // Don't show hashed password
    setEditId(item.id);
    setShowForm(true);
  };

  const filtered = data.filter((item: any) => {
    const matchesSearch = Object.values(item).some(v => String(v).toLowerCase().includes(search.toLowerCase()));
    const matchesJurusan = jurusanFilter === '' || item.jurusan === jurusanFilter;
    return matchesSearch && matchesJurusan;
  });

  return (
    <div className="space-y-6">
      {/* Statistik Jumlah Data Master Berdasarkan Tipe Tab */}
      {type === 'siswa' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {['TSM', 'TKR', 'TJKT', 'TAV', 'DKV'].map((jur) => {
            const count = data.filter((item: any) => {
              const itemJur = (item.jurusan || '').toUpperCase().trim();
              if (jur === 'TJKT') {
                return itemJur === 'TJKT' || itemJur === 'TKJ';
              }
              return itemJur === jur;
            }).length;

            const themes: Record<string, { bg: string, border: string, text: string, bgIcon: string }> = {
              TSM: { bg: 'bg-rose-50/40', border: 'border-rose-100', text: 'text-rose-600', bgIcon: 'bg-rose-100/80' },
              TKR: { bg: 'bg-blue-50/40', border: 'border-blue-100', text: 'text-blue-600', bgIcon: 'bg-blue-100/80' },
              TJKT: { bg: 'bg-emerald-50/40', border: 'border-emerald-100', text: 'text-emerald-600', bgIcon: 'bg-emerald-100/80' },
              TAV: { bg: 'bg-purple-50/40', border: 'border-purple-100', text: 'text-purple-600', bgIcon: 'bg-purple-100/80' },
              DKV: { bg: 'bg-amber-50/40', border: 'border-amber-100', text: 'text-amber-600', bgIcon: 'bg-amber-100/80' },
            };
            const theme = themes[jur] || { bg: 'bg-slate-50/40', border: 'border-slate-100', text: 'text-slate-600', bgIcon: 'bg-slate-100/80' };

            return (
              <div key={jur} className={`${theme.bg} border ${theme.border} rounded-xl p-4 flex items-center justify-between shadow-sm`}>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg ${theme.bgIcon} flex items-center justify-center ${theme.text} border`}>
                    <User size={20} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">Siswa {jur === 'TJKT' ? 'TJKT/TKJ' : jur}</p>
                    <p className="text-xs font-black text-slate-700">Jurusan {jur}</p>
                  </div>
                </div>
                <p className={`text-2xl font-black ${theme.text} font-mono tracking-tight`}>{count}</p>
              </div>
            );
          })}
        </div>
      )}

      {type === 'guru' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-indigo-50/40 border border-indigo-100 rounded-xl p-4 flex items-center justify-between shadow-sm col-span-1">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-100/80 flex items-center justify-center text-indigo-600 border border-indigo-200">
                <UserCheck size={20} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">Database Guru</p>
                <p className="text-xs font-black text-slate-700">Total Guru Pembimbing</p>
              </div>
            </div>
            <p className="text-2xl font-black text-indigo-600 font-mono tracking-tight">{data.length}</p>
          </div>
        </div>
      )}

      {type === 'mitra' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {['TSM', 'TKR', 'TJKT', 'TAV', 'DKV'].map((jur) => {
            const count = data.filter((item: any) => {
              const itemJur = (item.jurusan || '').toUpperCase().trim();
              if (jur === 'TJKT') {
                return itemJur === 'TJKT' || itemJur === 'TKJ';
              }
              return itemJur === jur;
            }).length;

            const themes: Record<string, { bg: string, border: string, text: string, bgIcon: string }> = {
              TSM: { bg: 'bg-rose-50/40', border: 'border-rose-100', text: 'text-rose-600', bgIcon: 'bg-rose-100/80' },
              TKR: { bg: 'bg-blue-50/40', border: 'border-blue-100', text: 'text-blue-600', bgIcon: 'bg-blue-100/80' },
              TJKT: { bg: 'bg-emerald-50/40', border: 'border-emerald-100', text: 'text-emerald-300', bgIcon: 'bg-emerald-100/80' },
              TAV: { bg: 'bg-purple-50/40', border: 'border-purple-100', text: 'text-purple-600', bgIcon: 'bg-purple-100/80' },
              DKV: { bg: 'bg-amber-50/40', border: 'border-amber-100', text: 'text-amber-600', bgIcon: 'bg-amber-100/80' },
            };
            const theme = themes[jur] || { bg: 'bg-slate-50/40', border: 'border-slate-100', text: 'text-slate-600', bgIcon: 'bg-slate-100/80' };

            return (
              <div key={jur} className={`${theme.bg} border ${theme.border} rounded-xl p-4 flex items-center justify-between shadow-sm`}>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg ${theme.bgIcon} flex items-center justify-center ${theme.text} border`}>
                    <Building2 size={20} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">Mitra {jur === 'TJKT' ? 'TJKT/TKJ' : jur}</p>
                    <p className="text-xs font-black text-slate-700">Mitra Industri {jur}</p>
                  </div>
                </div>
                <p className={`text-2xl font-black ${theme.text} font-mono tracking-tight`}>{count}</p>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="self-start md:self-auto">
          <h2 className="text-xl font-bold text-slate-800 capitalize">Data Master {type}</h2>
          <p className="text-sm text-slate-400">Total terdata: {data.length} records</p>
        </div>
        <div className="flex gap-3 w-full md:w-auto overflow-x-auto pb-2">
          {(type === 'siswa' || type === 'mitra') && (
            <div className="relative md:w-40 shrink-0">
               <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
               <select 
                value={jurusanFilter}
                onChange={(e) => setJurusanFilter(e.target.value)}
                className="w-full bg-white border border-slate-300 py-2 rounded-lg pl-9 pr-4 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 appearance-none font-bold text-slate-700"
               >
                 <option value="">Semua Jurusan</option>
                 <option value="TSM">TSM</option>
                 <option value="TKR">TKR</option>
                 <option value="TJKT">TJKT</option>
                 <option value="TAV">TAV</option>
                 <option value="DKV">DKV</option>
               </select>
            </div>
          )}
          <div className="relative flex-1 md:min-w-64">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              placeholder="Pencarian..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white border border-slate-300 py-2 rounded-lg pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          {(type === 'siswa' || type === 'guru' || type === 'mitra') && (
            <>
              <button 
                onClick={downloadTemplate}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 shadow-md transition-all active:scale-95 text-sm font-bold shrink-0"
                title="Download Template Excel"
              >
                <Download size={18} />
                Template
              </button>
              <label className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 shadow-md transition-all active:scale-95 text-sm font-bold shrink-0 cursor-pointer">
                <Upload size={18} />
                Impor EXCEL
                <input type="file" accept=".xlsx, .xls" onChange={handleFileUpload} className="hidden" />
              </label>
              <button 
                onClick={downloadData}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 shadow-md transition-all active:scale-95 text-sm font-bold shrink-0"
                title="Download Data Lengkap"
              >
                <FileSpreadsheet size={18} />
                Download Data
              </button>
              {type === 'siswa' && (
                <button 
                  onClick={syncSiswaGpsWithMitra}
                  disabled={isSyncingGps}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 shadow-md transition-all active:scale-95 text-sm font-bold shrink-0 font-black text-[12px] uppercase tracking-wider"
                  title="Sinkronkan GPS Siswa dengan Mitra berdasarkan Nama Bengkel & Alamat"
                >
                  {isSyncingGps ? <Loader2 className="animate-spin" size={18} /> : <MapPin size={18} />}
                  Sinkronisasi GPS
                </button>
              )}
              {type === 'mitra' && (
                <button 
                  onClick={downloadAllMitraQRs}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 shadow-md transition-all active:scale-95 text-sm font-bold shrink-0"
                  title="Download Semua QR Code Mitra"
                >
                  <QrIcon size={18} />
                  Download Semua QR
                </button>
              )}
              <button 
                onClick={() => setShowResetConfirm(true)}
                className="bg-rose-100 hover:bg-rose-600 hover:text-white text-rose-600 px-4 py-2 rounded-lg flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95 text-sm font-bold shrink-0 border border-rose-200"
                title="Reset Seluruh Data"
              >
                <Trash2 size={18} />
                RESET DATA
              </button>
            </>
          )}
          <button 
            onClick={() => setShowForm(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 shadow-md transition-all active:scale-95 text-sm font-bold shrink-0"
          >
            <Plus size={18} />
            Tambah Baru
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {uploadProgress > 0 && (
          <div className="p-4 bg-blue-50 border-b border-blue-100">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-blue-700 uppercase tracking-wider">Mengimpor Data...</span>
              <span className="text-xs font-bold text-blue-700">{uploadProgress}%</span>
            </div>
            <div className="w-full bg-blue-200 rounded-full h-1.5">
              <div 
                className="bg-blue-600 h-1.5 rounded-full transition-all duration-300" 
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center w-12 bg-slate-100/10 border-r border-slate-100">No</th>
                {type === 'siswa' ? (
                  <>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Nama & NIS</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Kelas & Jurusan</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Bengkel PKL</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Akses Login</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">No Hp</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Kepala Bengkel</th>
                  </>
                ) : type === 'guru' ? (
                  <>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Nama Guru</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Mata Pelajaran</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Akses Login</th>
                  </>
                ) : type === 'mitra' ? (
                  <>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Mitra Industri</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Jurusan & Alamat</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Akses Login</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">No Hp</th>
                  </>
                ) : (
                  <>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Identitas</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Kode / ID</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Keterangan</th>
                  </>
                )}
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((item: any, idx: number) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-4 py-4 text-center font-bold font-mono text-xs text-slate-400 w-12 bg-slate-50/20 border-r border-slate-100/60">
                      {idx + 1}
                    </td>
                    {type === 'siswa' ? (
                    <>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center text-blue-500 border border-blue-100">
                            <User size={18} />
                          </div>
                          <div>
                            <p className="font-bold text-slate-800 text-sm leading-tight">{item.nama}</p>
                            <p className="text-[10px] font-mono font-bold text-slate-400 mt-0.5">{item.nis}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-xs font-bold text-slate-700">{item.kelas}</div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase">{item.jurusan}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-xs font-bold text-slate-850 break-words max-w-[180px] uppercase leading-tight">{item.namaBengkel || 'Belum Ditentukan'}</div>
                        <div className="text-[10px] text-slate-400 break-words max-w-[180px] mt-0.5 leading-tight capitalize">{item.alamatBengkel || '-'}</div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {item.koordinatGPS && item.koordinatGPS.lat ? (
                            <span className="bg-emerald-50 text-emerald-700 text-[9px] font-bold px-1.5 py-0.5 rounded border border-emerald-100 flex items-center gap-0.5" title={`${item.koordinatGPS.lat}, ${item.koordinatGPS.lng}`}>
                              <MapPin size={10} className="text-emerald-500" />
                              GPS Terhubung
                            </span>
                          ) : item.namaBengkel ? (
                            <span className="bg-rose-50 text-rose-700 text-[9px] font-bold px-1.5 py-0.5 rounded border border-rose-100 flex items-center gap-0.5" title="Belum sinkron atau koordinat tidak ditemukan">
                              <AlertCircle size={10} className="text-rose-500" />
                              GPS Belum Terhubung
                            </span>
                          ) : null}
                          {(item.tanggalMulai || item.tanggalSelesai) && (
                            <span className="bg-blue-50 text-blue-600 text-[9px] font-bold px-1.5 py-0.5 rounded border border-blue-100">
                              {item.tanggalMulai || '?'} s.d. {item.tanggalSelesai || '?'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="bg-slate-50 border border-slate-100 rounded-lg p-2 space-y-1">
                          <p className="text-[9px] font-bold text-slate-400 flex justify-between gap-4 tracking-tighter whitespace-nowrap"><span className="uppercase">User:</span> <span className="text-slate-700">{item.username}</span></p>
                          <p className="text-[9px] font-bold text-slate-400 flex justify-between gap-4 tracking-tighter whitespace-nowrap"><span className="uppercase">Pass:</span> <span className="text-slate-700">{item.passwordOri || '********'}</span></p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs font-bold text-slate-500">
                        {item.noHp || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-xs font-bold text-slate-700">{item.kepalaBengkel || '-'}</div>
                        <div className="text-[10px] text-slate-400 font-bold">{item.noHpKepalaBengkel || '-'}</div>
                      </td>
                    </>
                  ) : type === 'guru' ? (
                    <>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-500 border border-emerald-100">
                            <User size={18} />
                          </div>
                          <div>
                            <p className="font-bold text-slate-800 text-sm leading-tight">{item.nama}</p>
                            <p className="text-[10px] font-mono font-bold text-slate-400 mt-0.5">{item.idGuru}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs font-bold text-slate-600">
                        {item.mapel || '-'}
                      </td>
                      <td className="px-6 py-4">
                        <div className="bg-slate-50 border border-slate-100 rounded-lg p-2 space-y-1 w-40">
                          <p className="text-[9px] font-bold text-slate-400 flex justify-between gap-2 tracking-tighter whitespace-nowrap"><span className="uppercase">User:</span> <span className="text-slate-700">{item.username}</span></p>
                          <p className="text-[9px] font-bold text-slate-400 flex justify-between gap-2 tracking-tighter whitespace-nowrap"><span className="uppercase">Pass:</span> <span className="text-slate-700">{item.passwordOri || '********'}</span></p>
                        </div>
                      </td>
                    </>
                  ) : type === 'mitra' ? (
                    <>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center text-amber-500 border border-amber-100">
                             <Building2 size={18} />
                          </div>
                          <div>
                             <p className="font-bold text-slate-800 text-sm leading-tight">{item.namaMitra}</p>
                             <p className="text-[10px] font-bold text-slate-400 mt-0.5 uppercase tracking-tighter">Kepala Bengkel: {item.kepalaMitra || '-'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                         <p className="text-xs text-slate-800 font-medium max-w-[200px] truncate leading-relaxed">{item.alamat || '-'}</p>
                         <div className="flex items-center gap-1.5 mt-1 text-[10px] uppercase tracking-wider flex-wrap">
                           <span className="bg-emerald-50 text-emerald-700 text-[9px] font-extrabold px-1.5 py-0.5 rounded">
                             {item.jurusan || 'Semua'}
                           </span>
                           {item.googleMapsLink ? (
                             <a 
                               href={item.googleMapsLink} 
                               target="_blank" 
                               rel="noopener noreferrer" 
                               className="text-blue-500 hover:underline font-bold flex items-center gap-0.5 max-w-[120px] truncate normal-case"
                               title="Buka Peta Google"
                             >
                               Maps ↗
                             </a>
                           ) : (
                             <span className="text-rose-400 font-medium italic normal-case">Maps Belum Set</span>
                           )}
                         </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="bg-slate-50 border border-slate-100 rounded-lg p-2 space-y-1 w-40">
                          <p className="text-[9px] font-bold text-slate-400 flex justify-between gap-2 tracking-tighter whitespace-nowrap"><span className="uppercase">User:</span> <span className="text-slate-700">{item.username}</span></p>
                          <p className="text-[9px] font-bold text-slate-400 flex justify-between gap-2 tracking-tighter whitespace-nowrap"><span className="uppercase">Pass:</span> <span className="text-slate-700">{item.passwordOri || '********'}</span></p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs font-bold text-slate-500">
                        {item.noHp || '-'}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                           <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center text-slate-400 border border-slate-100">
                              {type === 'mitra' ? <Building2 size={18} /> : <User size={18} />}
                           </div>
                           <span className="font-bold text-slate-800 text-sm leading-tight">{item.nama || item.namaMitra}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                         <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono text-xs font-bold">
                            {item.nis || item.idGuru || item.kodeMitra}
                         </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded text-[10px] font-bold uppercase">{item.jurusan || 'Semua'}</span>
                        </div>
                        <div className="text-xs space-y-1">
                           <span className="text-slate-500">{item.alamat || '-'}</span>
                        </div>
                      </td>
                    </>
                  )}
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                       {type === 'mitra' && (
                         <button onClick={() => setShowQrModal(item)} className="p-2 text-amber-500 hover:bg-amber-50 rounded-lg transition-colors" title="Lihat QR Presensi">
                           <QrIcon size={16} />
                         </button>
                       )}
                       <button onClick={() => handleEdit(item)} className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors">
                          <Edit2 size={16} />
                        </button>
                        {type === 'siswa' && (
                          <button 
                            onClick={() => handleClearSiswaData(item.id, item.nama)} 
                            className="p-2 text-amber-500 hover:bg-amber-50 rounded-lg transition-colors" 
                            title="Clear data siswa (Penempatan PKL)"
                          >
                            <RotateCcw size={16} />
                          </button>
                        )}
                       <button onClick={() => handleDelete(item.id)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors">
                          <Trash2 size={16} />
                       </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
             <div className="py-12 text-center text-slate-400 font-medium italic">Data tidak ditemukan.</div>
          )}
        </div>
      </div>

      {showQrModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl relative"
          >
            <button onClick={() => setShowQrModal(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
              <Trash2 size={20} />
            </button>

            <h3 className="font-extrabold text-lg text-slate-800 uppercase tracking-tight mb-2">QR Presensi Mitra</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-8">Pindai untuk Kehadiran PKL</p>
            
            <div className="bg-white p-4 rounded-2xl border-4 border-slate-100 mb-8 inline-block shadow-inner">
              <QRCodeCanvas 
                id="qr-gen"
                value={`SIPKL_PRESENSI:${showQrModal.id}:${showQrModal.namaMitra}`} 
                size={220}
                level="H"
                includeMargin={false}
              />
            </div>

            <div className="mb-8">
              <p className="font-black text-slate-800 uppercase text-xl leading-tight">{showQrModal.namaMitra}</p>
              <p className="text-[10px] font-mono font-bold text-slate-400 mt-1">ID: {showQrModal.id}</p>
            </div>

            <button 
              onClick={downloadQR} 
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-100 flex items-center justify-center gap-3 transition-transform active:scale-95"
            >
              <Download size={20} />
              Download QR Code
            </button>
            <p className="text-[9px] font-bold text-slate-400 uppercase mt-4 italic">Silakan cetak dan tempel di area bengkel/lokasi PKL</p>
          </motion.div>
        </div>
      )}

      {showResetConfirm && (
        <div className="fixed inset-0 bg-rose-900/40 backdrop-blur-md z-[120] flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl"
          >
            <div className="w-20 h-20 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle size={40} />
            </div>
            <h3 className="font-black text-slate-800 text-xl uppercase tracking-tight mb-2">Reset Data {type}?</h3>
            <p className="text-sm text-slate-500 mb-8 leading-relaxed">
              Tindakan ini akan menghapus <strong>seluruh data {type}</strong> secara permanen dari database. Data yang sudah dihapus tidak dapat dikembalikan.
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-3 rounded-xl transition-colors"
                disabled={isSaving}
              >
                TIDAK
              </button>
              <button 
                onClick={handleResetAll}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-rose-100 transition-all active:scale-95 disabled:opacity-50"
                disabled={isSaving}
              >
                {isSaving ? 'MEMPROSES...' : 'YA, HAPUS'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-slate-900/60 z-[70] flex items-center justify-center p-4 backdrop-blur-[2px]">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }} 
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white w-full max-w-md rounded-xl p-8 shadow-2xl relative overflow-y-auto max-h-[90vh]"
          >
            <h3 className="font-bold text-xl text-slate-800 mb-6">{editId ? 'Edit Data' : 'Input Data Baru'} {type}</h3>
            <form onSubmit={handleSave} className="space-y-4">
              {type === 'siswa' && (
                <>
                  <Input label="NIS (Nomor Induk Siswa)" value={formData.nis} onChange={v => setFormData({...formData, nis: v})} />
                  <Input label="Nama Lengkap" value={formData.nama} onChange={v => setFormData({...formData, nama: v})} />
                  <div className="grid grid-cols-2 gap-4">
                    <Input label="Kelas" value={formData.kelas} onChange={v => setFormData({...formData, kelas: v})} />
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider ml-1">Jurusan</label>
                      <select 
                        value={formData.jurusan || ''} 
                        onChange={e => setFormData({...formData, jurusan: e.target.value})}
                        className="w-full bg-slate-50 p-3 rounded-lg border border-slate-200 text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                      >
                        <option value="">Pilih Jurusan</option>
                        <option value="TSM">TSM</option>
                        <option value="TKR">TKR</option>
                        <option value="TJKT">TJKT</option>
                        <option value="TAV">TAV</option>
                        <option value="DKV">DKV</option>
                      </select>
                    </div>
                  </div>
                  <Input label="Nomor HP" value={formData.noHp} onChange={v => setFormData({...formData, noHp: v})} />
                  <Input label="Nama Bengkel" value={formData.namaBengkel} onChange={v => setFormData({...formData, namaBengkel: v})} required={false} />
                  <Input label="Alamat Bengkel" value={formData.alamatBengkel} onChange={v => setFormData({...formData, alamatBengkel: v})} required={false} />
                </>
              )}
              {type === 'guru' && (
                <>
                  <Input label="ID Guru / NIP" value={formData.idGuru} onChange={v => setFormData({...formData, idGuru: v})} />
                  <Input label="Nama Lengkap" value={formData.nama} onChange={v => setFormData({...formData, nama: v})} />
                  <Input label="Mata Pelajaran" value={formData.mapel} onChange={v => setFormData({...formData, mapel: v})} />
                </>
              )}
              {type === 'mitra' && (
                <>
                  <Input label="Nama Mitra Industri" value={formData.namaMitra} onChange={v => setFormData({...formData, namaMitra: v})} />
                  <Input label="Nama Kepala Bengkel" value={formData.kepalaMitra} onChange={v => setFormData({...formData, kepalaMitra: v})} />
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider ml-1">Jurusan Terkait</label>
                    <select 
                      value={formData.jurusan || ''} 
                      onChange={e => setFormData({...formData, jurusan: e.target.value})}
                      className="w-full bg-slate-50 p-3 rounded-lg border border-slate-200 text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                    >
                      <option value="">Pilih Jurusan</option>
                      <option value="TSM">TSM</option>
                      <option value="TKR">TKR</option>
                      <option value="TJKT">TJKT</option>
                      <option value="TAV">TAV</option>
                      <option value="DKV">DKV</option>
                    </select>
                  </div>
                  <Input label="Alamat Mitra Industri" value={formData.alamat} onChange={v => setFormData({...formData, alamat: v})} />
                  <Input label="Nomor HP" value={formData.noHp} onChange={v => setFormData({...formData, noHp: v})} />
                  <Input 
                    label="Link Google Maps atau Koordinat" 
                    placeholder="Contoh: https://maps.app.goo.gl/... atau -7.25, 112.76"
                    value={formData.googleMapsLink || ''} 
                    disabled={isResolvingLink}
                    onChange={v => {
                      const parsed = extractCoordinates(v);
                      setFormData({
                        ...formData,
                        googleMapsLink: v,
                        koordinatGPS: parsed || undefined
                      });
                    }} 
                    onBlur={() => {
                      if (formData.googleMapsLink && !extractCoordinates(formData.googleMapsLink)) {
                        resolveGoogleMapsLink(formData.googleMapsLink);
                      }
                    }}
                    required={false}
                  />
                  {formData.googleMapsLink && (
                    <div className="mx-1 mt-1 p-3 bg-slate-50 border border-slate-150 rounded-lg text-xs font-medium text-slate-600 space-y-2">
                      {isResolvingLink ? (
                        <div className="text-blue-600 font-bold flex items-center gap-2 py-1">
                          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                          <span>Menghubungkan & mendeteksi koordinat Google Maps (mengekstrak)...</span>
                        </div>
                      ) : (() => {
                        const parsed = formData.koordinatGPS || extractCoordinates(formData.googleMapsLink);
                        return parsed ? (
                          <span className="text-emerald-600 font-bold flex items-center gap-1.5 bg-emerald-50/50 p-1.5 rounded border border-emerald-100">
                            <span className="text-sm">✓</span> Koordinat Terdeteksi: {parsed.lat.toFixed(6)}, {parsed.lng.toFixed(6)}
                          </span>
                        ) : (
                          <div className="space-y-2">
                            <div className="text-amber-600 font-bold flex items-center gap-1">
                              <span>⚠</span> Koordinat tidak terbaca langsung dari link pendek ini.
                            </div>
                            <p className="text-[11px] text-slate-500 leading-normal">
                              Link maps pendek (seperti maps.app.goo.gl) harus diproses untuk mengekstrak titik koordinat yang sesungguhnya.
                            </p>
                            <button
                              type="button"
                              onClick={() => resolveGoogleMapsLink(formData.googleMapsLink)}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] rounded transition-transform active:scale-95 flex items-center gap-1 shadow-sm cursor-pointer"
                            >
                              Ekstrak Koordinat Sekarang
                            </button>
                          </div>
                        );
                      })()}
                      {resolvingError && (
                        <div className="text-red-500 text-[10px] font-semibold mt-1 bg-red-50 p-1.5 rounded border border-red-100">
                          Gagal mengurai: {resolvingError}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
              
              <div className="pt-6 border-t border-slate-100 flex flex-col gap-4">
                <Input label="Username Login" value={formData.username} onChange={v => setFormData({...formData, username: v})} />
                <Input label="Password Initial" type="password" value={formData.password} onChange={v => setFormData({...formData, password: v})} />
              </div>
              
              <div className="flex gap-4 pt-6">
                <button type="button" onClick={() => { setShowForm(false); setEditId(null); setFormData({}); }} className="flex-1 border border-slate-200 py-3 rounded-lg text-sm font-bold text-slate-500 hover:bg-slate-50">Batal</button>
                <button type="submit" disabled={isSaving} className="flex-[2] bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg text-sm font-bold shadow-lg shadow-blue-100">
                  {isSaving ? 'Menyimpan...' : editId ? 'Simpan Perubahan' : 'Simpan Data'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {type === 'mitra' && (
        <div style={{ display: 'none' }} aria-hidden="true">
          {data.map((item: any) => (
            <QRCodeCanvas
              key={item.id}
              id={`qr-hidden-${item.id}`}
              value={`SIPKL_PRESENSI:${item.id}:${item.namaMitra}`}
              size={256}
              level="H"
              includeMargin={false}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Input({ label, value, onChange, type = "text", required = true, placeholder = "", disabled = false, onBlur }: any) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider ml-1">{label}</label>
      <input 
        type={type}
        value={value || ''}
        placeholder={placeholder}
        disabled={disabled}
        onBlur={onBlur}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-slate-50 p-3 rounded-lg border border-slate-200 text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all disabled:opacity-50"
        required={required}
      />
    </div>
  );
}

function MonitoringSection({ data: initialJurnals }: any) {
  const [jurnals, setJurnals] = useState<any[]>(initialJurnals || []);
  const [siswas, setSiswas] = useState<any[]>([]);
  const [gurus, setGurus] = useState<any[]>([]);
  const [mitras, setMitras] = useState<any[]>([]);
  const [absensi, setAbsensi] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [subTab, setSubTab] = useState<'no_jurnal' | 'alpa' | 'semua'>('no_jurnal');
  const [isResetting, setIsResetting] = useState(false);
  const [search, setSearch] = useState('');

  const fetchAll = async () => {
    setIsLoading(true);
    try {
      const [sSnap, gSnap, mSnap, aSnap, jSnap] = await Promise.all([
        getDocs(query(collection(db, 'siswa'), limit(150))),
        getDocs(query(collection(db, 'guru'), limit(150))),
        getDocs(query(collection(db, 'mitra'), limit(150))),
        getDocs(query(collection(db, 'absensi'), orderBy('tanggal', 'desc'), limit(150))),
        getDocs(query(collection(db, 'jurnal'), orderBy('tanggal', 'desc'), limit(150)))
      ]);
      setSiswas(sSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setGurus(gSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setMitras(mSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setAbsensi(aSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setJurnals(jSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error("Error fetching monitoring databases:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const handleResetJurnal = async () => {
    if (!confirm("⚠️ PERINGATAN! Apakah Anda yakin ingin menghapus SELURUH review jurnal / laporan kegiatan siswa secara keseluruhan? Tindakan ini tidak dapat dibatalkan.")) return;
    try {
      setIsResetting(true);
      const jSnap = await getDocs(collection(db, 'jurnal'));
      const batchPromises = jSnap.docs.map(d => deleteDoc(doc(db, 'jurnal', d.id)));
      await Promise.all(batchPromises);
      alert("Berhasil menghapus seluruh review laporan jurnal.");
      fetchAll();
    } catch (error) {
      console.error(error);
      alert("Gagal mereset data jurnal.");
    } finally {
      setIsResetting(false);
    }
  };

  // 1. Calculate: Hadir Tanpa Jurnal List
  const hadirTanpaJurnalList: any[] = [];
  absensi.forEach((absen: any) => {
    if (absen.tipe === 'hadir') {
      const hasJurnal = jurnals.some(j => j.siswaId === absen.siswaId && j.tanggal === absen.tanggal);
      if (!hasJurnal) {
        const student = siswas.find(s => s.id === absen.siswaId);
        if (student) {
          const guru = gurus.find(g => g.id === student.guruId);
          const mit = mitras.find(m => m.id === student.mitraId);
          hadirTanpaJurnalList.push({
            id: `${absen.id}_no_j`,
            idSiswa: student.id,
            nama: student.nama,
            kelas: student.kelas,
            bengkel: student.namaBengkel || mit?.namaMitra || 'Belum Ditentukan',
            pembimbing: guru?.nama || 'Belum Ditentukan',
            kepalaBengkel: student.kepalaBengkel || 'Belum Set',
            tanggal: absen.tanggal
          });
        }
      }
    }
  });

  // Sort by date descending
  hadirTanpaJurnalList.sort((a, b) => b.tanggal.localeCompare(a.tanggal));

  // 2. Calculate: Recap of ALPA List
  const alpaList: any[] = [];
  const alpaKeySet = new Set<string>(); // "siswaId_tanggal"

  // Explicit Alpas from database
  absensi.forEach((absen: any) => {
    if (absen.tipe === 'tidak_absen' || absen.tipe === 'alpha') {
      const key = `${absen.siswaId}_${absen.tanggal}`;
      alpaKeySet.add(key);
      const student = siswas.find(s => s.id === absen.siswaId);
      if (student) {
        const guru = gurus.find(g => g.id === student.guruId);
        const mit = mitras.find(m => m.id === student.mitraId);
        alpaList.push({
          id: `${absen.id}_alpa`,
          idSiswa: student.id,
          nama: student.nama,
          kelas: student.kelas,
          bengkel: student.namaBengkel || mit?.namaMitra || 'Belum Ditentukan',
          pembimbing: guru?.nama || 'Belum Ditentukan',
          tanggal: absen.tanggal
        });
      }
    }
  });

  // Virtual Alpas for Sundays and configuration dates in past 30 days
  siswas.forEach((student: any) => {
    if (!student.tanggalMulai) return;
    const start = new Date(student.tanggalMulai);
    const end = student.tanggalSelesai ? new Date(student.tanggalSelesai) : new Date();
    const limitDate = end < new Date() ? end : new Date();

    const startDate = new Date(limitDate);
    startDate.setDate(startDate.getDate() - 30);
    const scanStart = start > startDate ? start : startDate;

    for (let d = new Date(scanStart); d <= limitDate; d.setDate(d.getDate() + 1)) {
      const dateStr = format(d, 'yyyy-MM-dd');
      const key = `${student.id}_${dateStr}`;
      if (!alpaKeySet.has(key)) {
        const matchAbsen = absensi.find((a: any) => a.siswaId === student.id && a.tanggal === dateStr);
        if (!matchAbsen) {
          alpaKeySet.add(key);
          const guru = gurus.find((g: any) => g.id === student.guruId);
          const mit = mitras.find((m: any) => m.id === student.mitraId);
          alpaList.push({
            id: `${student.id}_${dateStr}_valpa`,
            idSiswa: student.id,
            nama: student.nama,
            kelas: student.kelas,
            bengkel: student.namaBengkel || mit?.namaMitra || 'Belum Ditentukan',
            pembimbing: guru?.nama || 'Belum Ditentukan',
            tanggal: dateStr
          });
        }
      }
    }
  });

  alpaList.sort((a, b) => b.tanggal.localeCompare(a.tanggal));

  // Search Filter: for search state
  const filterBySearch = (list: any[]) => {
    if (!search.trim()) return list;
    const sLower = search.toLowerCase();
    return list.filter(item => 
      (item.nama || '').toLowerCase().includes(sLower) ||
      (item.kelas || '').toLowerCase().includes(sLower) ||
      (item.bengkel || '').toLowerCase().includes(sLower) ||
      (item.tanggal || '').includes(sLower)
    );
  };

  const displayHadirNoJurnal = filterBySearch(hadirTanpaJurnalList);
  const displayAlpa = filterBySearch(alpaList);
  const displaySemua = search.trim() ? jurnals.filter((j: any) => {
    const s = siswas.find(st => st.id === j.siswaId);
    return (s?.nama || '').toLowerCase().includes(search.toLowerCase()) || (j.tanggal || '').includes(search);
  }) : jurnals;

  const handleDownloadRekap = () => {
    const exportHadirNoJurnal = hadirTanpaJurnalList.map((item: any) => ({
      'Nama Siswa': item.nama,
      'Kelas': item.kelas,
      'Bengkel / Mitra': item.bengkel,
      'Guru Pembimbing': item.pembimbing,
      'Kepala Bengkel': item.kepalaBengkel,
      'Tanggal Kehadiran': item.tanggal
    }));

    const exportAlpa = alpaList.map((item: any) => ({
      'Nama Siswa': item.nama,
      'Kelas': item.kelas,
      'Bengkel / Mitra': item.bengkel,
      'Guru Pembimbing': item.pembimbing,
      'Tanggal ALPA': item.tanggal
    }));

    const wb = XLSX.utils.book_new();
    
    const ws1 = XLSX.utils.json_to_sheet(exportHadirNoJurnal);
    XLSX.utils.book_append_sheet(wb, ws1, 'Hadir Tanpa Jurnal');

    const ws2 = XLSX.utils.json_to_sheet(exportAlpa);
    XLSX.utils.book_append_sheet(wb, ws2, 'Rekap Siswa Alpa');

    XLSX.writeFile(wb, `Rekap_Analisis_Log_Aktivitas_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="animate-spin text-blue-900 w-8 h-8" />
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Memproses Analisis Aktivitas...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 md:p-8 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Analisis & Log Aktivitas Siswa</h2>
            <p className="text-xs text-slate-500 mt-1">Daftar ketidakhadiran, absen tanpa pelaporan jurnal, dan kontrol database jurnal.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button 
              onClick={handleDownloadRekap}
              className="bg-green-600 hover:bg-green-700 text-white font-extrabold text-[10px] uppercase tracking-widest px-4 py-3 rounded-lg border border-green-750 flex items-center gap-2 transition-all active:scale-95"
            >
              <FileSpreadsheet size={13} />
              Download Rekap (.xlsx)
            </button>
            {subTab === 'semua' && (
              <button 
                onClick={handleResetJurnal}
                disabled={isResetting}
                className="bg-rose-50 text-rose-600 hover:bg-rose-100 hover:text-rose-700 font-extrabold text-[10px] uppercase tracking-widest px-4 py-3 rounded-lg border border-rose-200/50 flex items-center gap-2 self-start md:self-auto transition-colors active:scale-95 disabled:opacity-50"
              >
                <Trash2 size={13} />
                Reset Semua Jurnal
              </button>
            )}
          </div>
        </div>

        {/* Sub-tab selection with beautiful minimalist pill-style selector */}
        <div className="flex flex-wrap gap-2 mt-6 p-1 bg-slate-100 rounded-xl max-w-fit">
          <button 
            type="button"
            onClick={() => setSubTab('no_jurnal')}
            className={cn(
              "px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all",
              subTab === 'no_jurnal' ? "bg-white text-slate-850 shadow-sm" : "text-slate-500 hover:text-slate-800"
            )}
          >
            Hadir Tanpa Jurnal ({hadirTanpaJurnalList.length})
          </button>
          <button 
            type="button"
            onClick={() => setSubTab('alpa')}
            className={cn(
              "px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all",
              subTab === 'alpa' ? "bg-white text-slate-850 shadow-sm" : "text-slate-500 hover:text-slate-800"
            )}
          >
            Rekap Siswa ALPA ({alpaList.length})
          </button>
          <button 
            type="button"
            onClick={() => setSubTab('semua')}
            className={cn(
              "px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all",
              subTab === 'semua' ? "bg-white text-slate-850 shadow-sm" : "text-slate-500 hover:text-slate-800"
            )}
          >
            Semua Jurnal Masuk ({jurnals.length})
          </button>
        </div>
      </div>

      {/* Filter and Content representation */}
      <div className="relative">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input 
          placeholder="Cari berdasarkan nama, kelas, bengkel, atau tanggal..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-white border border-slate-200 py-3.5 pl-12 pr-4 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 shadow-sm transition-all"
        />
      </div>

      {subTab === 'no_jurnal' && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 bg-amber-50/50 border-b border-amber-100/50 flex items-center gap-3">
            <div className="w-2.5 h-2.5 bg-amber-500 rounded-full animate-pulse" />
            <p className="text-[10px] font-extrabold text-amber-700 uppercase tracking-widest">Daftar Siswa Hadir PKL Tetapi Tidak Mengirimkan Laporan Jurnal</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200">
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Nama & Kelas</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tempat Bengkel</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Pembimbing / Hub</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tanggal Hadir</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayHadirNoJurnal.map((item: any) => (
                  <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-800 text-sm leading-tight">{item.nama}</div>
                      <div className="text-[10px] text-slate-400 font-semibold uppercase mt-0.5">{item.kelas}</div>
                    </td>
                    <td className="px-6 py-4 text-xs font-bold text-slate-700 uppercase">{item.bengkel}</td>
                    <td className="px-6 py-4">
                      <div className="text-xs font-semibold text-slate-800 uppercase">{item.pembimbing}</div>
                      <div className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Kabeng: {item.kepalaBengkel}</div>
                    </td>
                    <td className="px-6 py-4 text-xs font-black text-slate-600 font-mono tracking-tight">{item.tanggal}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-amber-50 text-amber-600 text-[9px] font-extrabold uppercase border border-amber-200/50">
                        Hadir Tanpa Jurnal
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {displayHadirNoJurnal.length === 0 && (
              <div className="py-16 text-center text-slate-400">
                <p className="text-sm italic">Tidak ada siswa hadir tanpa laporan jurnal.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {subTab === 'alpa' && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 bg-rose-50/50 border-b border-rose-100/50 flex items-center gap-3">
            <div className="w-2.5 h-2.5 bg-rose-500 rounded-full animate-pulse" />
            <p className="text-[10px] font-extrabold text-rose-700 uppercase tracking-widest">Rekapitulasi Siswa Alpa (Tidak Berangkat PKL)</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200">
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Nama & Kelas</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tempat Bengkel</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Nama Pembimbing</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tanggal ALPA</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayAlpa.map((item: any) => (
                  <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-800 text-sm leading-tight">{item.nama}</div>
                      <div className="text-[10px] text-slate-400 font-semibold uppercase mt-0.5">{item.kelas}</div>
                    </td>
                    <td className="px-6 py-4 text-xs font-bold text-slate-700 uppercase">{item.bengkel}</td>
                    <td className="px-6 py-4 text-xs font-semibold text-slate-800 uppercase">{item.pembimbing}</td>
                    <td className="px-6 py-4 text-xs font-black text-slate-600 font-mono tracking-tight">{item.tanggal}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-rose-50 text-rose-600 text-[9px] font-extrabold uppercase border border-rose-200/50 animate-pulse">
                        Alpa (Bolos PKL)
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {displayAlpa.length === 0 && (
              <div className="py-16 text-center text-slate-400">
                <p className="text-sm italic">Tidak ada rekapitulasi siswa alpa ditemukan.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {subTab === 'semua' && (
        <div className="space-y-6">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Review Laporan Jurnal Keseluruhan</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {displaySemua.map((j: any) => {
              const siswa = siswas.find(s => s.id === j.siswaId);
              return (
                <div key={j.id} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm group hover:border-blue-300 transition-colors">
                  <div className="flex justify-between items-start mb-4 pb-3 border-b border-slate-50">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 font-bold text-xs uppercase">
                        {siswa?.nama?.charAt(0) || 'S'}
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">Nama Siswa</p>
                        <p className="text-xs font-black text-slate-800 uppercase">{siswa?.nama || `ID: ${j.siswaId}`}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">Tanggal</p>
                      <p className="text-xs font-black text-slate-800">{j.tanggal}</p>
                    </div>
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed italic">"{j.kegiatan}"</p>
                </div>
              );
            })}
          </div>
          {displaySemua.length === 0 && (
            <div className="py-20 text-center text-slate-400 bg-white border border-dashed border-slate-300 rounded-xl">
              <p className="text-sm italic">Keanggotaan jurnal kosong atau laporan terhapus seluruhnya.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
