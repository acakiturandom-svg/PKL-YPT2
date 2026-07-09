
import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut as firebaseSignOut } from 'firebase/auth';
import { collection, query, where, getDocs, doc, getDoc, getDocFromCache, getDocFromServer } from 'firebase/firestore';
import { auth, db } from './firebase';
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
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (error) {
      setState(s => ({ ...s, isLoading: false }));
      throw error;
    }
  };

  const loginOthers = async (role: UserRole, username: string, pass: string) => {
    setState(s => ({ ...s, isLoading: true }));
    try {
      const hashed = await hashPassword(pass);
      const collectionName = role === 'siswa' ? 'siswa' : role === 'guru' ? 'guru' : 'mitra';
      const cleanUsername = username.trim();
      const idField = role === 'siswa' ? 'nis' : role === 'guru' ? 'idGuru' : 'kodeMitra';
      
      const lowerUsername = cleanUsername.toLowerCase();
      const upperUsername = cleanUsername.toUpperCase();
      
      // Fetch potential docs by username or ID field with case variations
      const q1 = query(collection(db, collectionName), where('username', 'in', [cleanUsername, lowerUsername, upperUsername]));
      const q2 = query(collection(db, collectionName), where(idField, 'in', [cleanUsername, lowerUsername, upperUsername]));
      
      const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
      const docs = [...snap1.docs, ...snap2.docs];

      if (docs.length === 0) {
        throw new Error(`${role.toUpperCase()} dengan Username/ID "${cleanUsername}" tidak ditemukan.`);
      }

      // Try matching password - support hashed OR plain text (for safety/compatibility)
      const matchedDoc = docs.find(doc => {
        const data = doc.data();
        return data.password === hashed || data.password === pass;
      });

      if (!matchedDoc) {
        throw new Error('Kata sandi yang Anda masukkan salah.');
      }

      const profile = { id: matchedDoc.id, ...matchedDoc.data() };
      const session = { user: { uid: matchedDoc.id }, role, profile };
      localStorage.setItem('sipkl_session', JSON.stringify(session));
      setState({ ...session, isLoading: false });
    } catch (error) {
      setState(s => ({ ...s, isLoading: false }));
      throw error;
    }
  };

  const logout = async () => {
    setState(s => ({ ...s, isLoading: true }));
    if (state.role === 'admin') {
      await firebaseSignOut(auth);
    }
    localStorage.removeItem('sipkl_session');
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
