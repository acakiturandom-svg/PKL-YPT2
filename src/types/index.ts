
export type UserRole = 'admin' | 'siswa' | 'guru' | 'mitra';

export interface Siswa {
  id: string;
  nis: string;
  nama: string;
  kelas: string;
  jurusan: string;
  noHp: string;
  username: string;
  password?: string;
  guruId: string;
  mitraId: string;
  tanggalMulai: string;
  tanggalSelesai: string;
  role: 'siswa';
}

export interface Guru {
  id: string;
  idGuru: string;
  nama: string;
  noHp: string;
  mapel: string;
  username: string;
  password?: string;
  role: 'guru';
}

export interface Mitra {
  id: string;
  kodeMitra: string;
  namaMitra: string;
  alamat: string;
  bidangUsaha: string;
  kontakPerson: string;
  noHp: string;
  googleMapsLink?: string;
  koordinatGPS: { lat: number; lng: number };
  radiusAbsensi: number;
  jurusan?: string;
  username: string;
  password?: string;
  role: 'mitra';
}

export interface Jurnal {
  id: string;
  siswaId: string;
  mitraId: string;
  guruId: string;
  tanggal: string; // YYYY-MM-DD
  kegiatan: string;
  tipeHari: 'masuk' | 'libur';
  createdAt: any;
}

export interface Absensi {
  id: string;
  siswaId: string;
  mitraId: string;
  tanggal: string; // YYYY-MM-DD
  tipe: 'hadir' | 'libur' | 'tidak_absen' | 'diluar_jangkauan';
  jamCheckin?: string;
  koordinatCheckin?: { lat: number; lng: number };
  jarakCheckin?: number;
  alasanLibur?: string;
  keteranganLibur?: string;
}

export interface AuthState {
  user: any | null;
  role: UserRole | null;
  profile: any | null;
  isLoading: boolean;
}
