
import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut as firebaseSignOut } from 'firebase/auth';
import { collection, query, where, limit, doc, getDocFromCache, getDocFromServer } from 'firebase/firestore';
import { auth, db, getDocs, getDoc, isQuotaExceeded, setQuotaExceeded, clearQueryCache } from './firebase';
import { AuthState, UserRole } from '../types';
import { hashPassword } from './utils';

interface AuthContextType extends AuthState {
  loginAdmin: (email: string, pass: string) => Promise<void>;
  loginOthers: (role: UserRole, username: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    role: null,
    profile: null,
    isLoading: true,
  });

  useEffect(() => {
    // Test connection
    const testConn = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (e) {
        console.warn("Firestore connection test completed (expected if no test doc exists)");
      }
    };
    testConn();

    // Monitor Auth State for both Admin (Firebase) and Others (localStorage)
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Firebase Auth user exists -> treat as Admin
        setState({
          user,
          role: 'admin',
          profile: { nama: 'Administrator', email: user.email },
          isLoading: false,
        });
        // Clear non-admin session just in case
        localStorage.removeItem('sipkl_session');
      } else {
        // No Firebase user, check localStorage for non-admin session
        const savedSession = localStorage.getItem('sipkl_session');
        if (savedSession) {
          try {
            const session = JSON.parse(savedSession);
            // Clean up any stale (Offline...) label from profile nama or namaMitra
            if (session.profile) {
              if (session.profile.nama) {
                session.profile.nama = session.profile.nama.replace(/\s*\(Offline.*?\)/i, '').trim();
              }
              if (session.profile.namaMitra) {
                session.profile.namaMitra = session.profile.namaMitra.replace(/\s*\(Offline.*?\)/i, '').trim();
              }
            }
            setState({
              user: session.user,
              role: session.role,
              profile: session.profile,
              isLoading: false,
            });
          } catch (e) {
            localStorage.removeItem('sipkl_session');
            setState({ user: null, role: null, profile: null, isLoading: false });
          }
        } else {
          // No session of any kind
          setState({ user: null, role: null, profile: null, isLoading: false });
        }
      }
    });

    return () => unsubscribe();
  }, []);

  const loginAdmin = async (email: string, pass: string) => {
    setState(s => ({ ...s, isLoading: true }));
    clearQueryCache();
    // Remove stale offline flags
    localStorage.removeItem('sipkl_quota_active');
    setQuotaExceeded(false);

    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (error: any) {
      const isQuotaError = error?.code === 'resource-exhausted' || 
                           error?.message?.toLowerCase().includes('quota') || 
                           error?.message?.toLowerCase().includes('limit exceeded');
      
      if (isQuotaError) {
        console.warn("Emergency bypass for Admin login triggered due to active Firestore quota error.");
        setQuotaExceeded(true);
        const session = { 
          user: { uid: 'offline_admin_uid', email }, 
          role: 'admin' as UserRole, 
          profile: { nama: 'Administrator', email } 
        };
        localStorage.setItem('sipkl_session', JSON.stringify(session));
        setState({ ...session, isLoading: false });
        return;
      }
      setState(s => ({ ...s, isLoading: false }));
      throw error;
    }
  };

  const loginOthers = async (role: UserRole, username: string, pass: string) => {
    setState(s => ({ ...s, isLoading: true }));
    clearQueryCache();
    const cleanUsername = username.trim();

    try {
      const hashed = await hashPassword(pass);
      const collectionName = role === 'siswa' ? 'siswa' : role === 'guru' ? 'guru' : 'mitra';
      const idField = role === 'siswa' ? 'nis' : role === 'guru' ? 'idGuru' : 'kodeMitra';
      
      const lowerUsername = cleanUsername.toLowerCase();
      const upperUsername = cleanUsername.toUpperCase();
      
      // Targeted efficient query with limit(1) — max 1 read per check
      const q1 = query(
        collection(db, collectionName), 
        where('username', 'in', [cleanUsername, lowerUsername, upperUsername]),
        limit(1)
      );
      
      let snap = await getDocs(q1);
      
      // If not found by username, try searching by ID field (NIS / NIP / KodeMitra) with limit(1)
      if (snap.empty) {
        const q2 = query(
          collection(db, collectionName), 
          where(idField, 'in', [cleanUsername, lowerUsername, upperUsername]),
          limit(1)
        );
        snap = await getDocs(q2);
      }

      const docs = snap.docs;

      // 1. Never perform full collection scans! If 0 docs found, throw user not found.
      if (docs.length === 0) {
        setState(s => ({ ...s, isLoading: false }));
        throw new Error(`${role.toUpperCase()} dengan Username/ID "${cleanUsername}" tidak ditemukan di database.`);
      }

      // Try matching password - support hashed OR plain text
      const matchedDoc = docs.find(docItem => {
        const data = docItem.data();
        return data.password === hashed || data.password === pass;
      });

      if (!matchedDoc) {
        setState(s => ({ ...s, isLoading: false }));
        throw new Error('Kata sandi yang Anda masukkan salah.');
      }

      const profile = { id: matchedDoc.id, ...matchedDoc.data() };
      const session = { user: { uid: matchedDoc.id }, role, profile };
      localStorage.setItem('sipkl_session', JSON.stringify(session));
      setState({ ...session, isLoading: false });
    } catch (error: any) {
      setState(s => ({ ...s, isLoading: false }));

      // 2. Only trigger quota exceeded mode if error is specifically a quota exhaustion error
      const isQuotaError = 
        error?.code === 'resource-exhausted' || 
        error?.code === 'quota-exceeded' ||
        error?.message?.toLowerCase().includes('quota') || 
        error?.message?.toLowerCase().includes('limit exceeded');
        
      if (isQuotaError) {
        console.warn("Firestore quota limit error caught in login. Triggering fallback offline session.");
        setQuotaExceeded(true);
        const mockProfile = createEmergencyProfile(role, cleanUsername, pass);
        const session = { user: { uid: 'emergency_' + cleanUsername }, role, profile: mockProfile };
        localStorage.setItem('sipkl_session', JSON.stringify(session));
        setState({ ...session, isLoading: false });
        return;
      }
      
      throw error;
    }
  };

  function createEmergencyProfile(role: UserRole, username: string, pass: string) {
    try {
      const collKey = `sipkl_coll_${role === 'siswa' ? 'siswa' : role === 'guru' ? 'guru' : 'mitra'}`;
      const savedCollStr = localStorage.getItem(collKey);
      if (savedCollStr) {
        const docsData = JSON.parse(savedCollStr);
        const idField = role === 'siswa' ? 'nis' : role === 'guru' ? 'idGuru' : 'kodeMitra';
        const found = docsData.find((d: any) => 
          String(d.username).toLowerCase() === username.toLowerCase() || 
          String(d[idField]).toLowerCase() === username.toLowerCase()
        );
        if (found) {
          console.log("Found cached profile in localStorage for emergency login:", found);
          return found;
        }
      }
    } catch (e) {
      console.warn("Failed to lookup cached profile for emergency login:", e);
    }

    // Fallback to auto-generated profile if not found in local cache
    const formattedName = username ? username.charAt(0).toUpperCase() + username.slice(1) : 'User';
    if (role === 'siswa') {
      return {
        id: 'user_' + username,
        nama: formattedName,
        nis: username,
        kelas: 'XII DKV 1',
        jurusan: 'DKV',
        username: username,
        noHp: '081234567890',
        mitraId: 'MTR-002',
        guruId: 'GURU-002'
      };
    } else if (role === 'guru') {
      return {
        id: 'user_' + username,
        nama: formattedName,
        idGuru: username,
        mapel: 'Produktif',
        username: username
      };
    } else {
      return {
        id: 'user_' + username,
        namaMitra: formattedName,
        kepalaMitra: `Bpk. ${formattedName}`,
        kodeMitra: username,
        jurusanPkl: 'DKV',
        alamat: 'Purbalingga',
        noHp: '081234567890',
        username: username
      };
    }
  }

  const logout = async () => {
    setState(s => ({ ...s, isLoading: true }));
    clearQueryCache();
    if (state.role === 'admin') {
      try {
        await firebaseSignOut(auth);
      } catch (e) {}
    }
    localStorage.removeItem('sipkl_session');
    localStorage.removeItem('sipkl_quota_active');
    setState({ user: null, role: null, profile: null, isLoading: false });
  };

  return (
    <AuthContext.Provider value={{ ...state, loginAdmin, loginOthers, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
