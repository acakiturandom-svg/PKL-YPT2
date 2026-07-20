
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  getDocs as firestoreGetDocs,
  getDocsFromCache,
  getDoc as firestoreGetDoc,
  getDocFromCache,
  onSnapshot as fireonSnapshot,
  addDoc as firestoreAddDoc,
  updateDoc as firestoreUpdateDoc,
  deleteDoc as firestoreDeleteDoc,
  setDoc as firestoreSetDoc,
  writeBatch as firestoreWriteBatch,
  Query,
  QuerySnapshot,
  DocumentReference,
  DocumentSnapshot
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Initialize Firestore with local persistent caching enabled
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
}, firebaseConfig.firestoreDatabaseId);

export const auth = getAuth(app);

// State tracking for quota exceeded error
export let isQuotaExceeded = localStorage.getItem('sipkl_quota_active') === 'true';
const quotaListeners = new Set<(val: boolean) => void>();

export function subscribeToQuotaStatus(listener: (val: boolean) => void) {
  quotaListeners.add(listener);
  listener(isQuotaExceeded);
  return () => {
    quotaListeners.delete(listener);
  };
}

export function setQuotaExceeded(val: boolean) {
  isQuotaExceeded = val;
  if (val) {
    localStorage.setItem('sipkl_quota_active', 'true');
  } else {
    localStorage.removeItem('sipkl_quota_active');
  }
  quotaListeners.forEach(l => l(val));
}

// Custom wrapped read operations with Firestore cache fallbacks
export async function getDocs(q: Query): Promise<QuerySnapshot> {
  try {
    return await firestoreGetDocs(q);
  } catch (error: any) {
    const isQuotaError = 
      error?.code === 'resource-exhausted' || 
      error?.message?.toLowerCase().includes('quota') || 
      error?.message?.toLowerCase().includes('limit exceeded');

    if (isQuotaError) {
      console.warn("Firestore getDocs Quota Exceeded. Attempting local cache fallback...");
      setQuotaExceeded(true);
      try {
        return await getDocsFromCache(q);
      } catch (cacheError) {
        console.warn("Firestore cache retrieval failed:", cacheError);
      }
    }

    // Return empty mock snapshot instead of crashing the UI when cache is empty/quota is hit
    return {
      docs: [],
      empty: true,
      size: 0,
      forEach: () => {},
      metadata: {
        fromCache: true,
        hasPendingWrites: false,
      }
    } as any;
  }
}

export async function getDoc(docRef: DocumentReference): Promise<DocumentSnapshot> {
  try {
    return await firestoreGetDoc(docRef);
  } catch (error: any) {
    const isQuotaError = 
      error?.code === 'resource-exhausted' || 
      error?.message?.toLowerCase().includes('quota') || 
      error?.message?.toLowerCase().includes('limit exceeded');

    if (isQuotaError) {
      console.warn("Firestore getDoc Quota Exceeded. Attempting local cache fallback...");
      setQuotaExceeded(true);
      try {
        return await getDocFromCache(docRef);
      } catch (cacheError) {
        console.warn("Firestore doc cache retrieval failed:", cacheError);
      }
    }

    // Return mock non-existent snapshot to prevent UI crashes
    return {
      id: docRef.id,
      exists: () => false,
      data: () => undefined,
      ref: docRef,
      metadata: {
        fromCache: true,
        hasPendingWrites: false
      }
    } as any;
  }
}

// Wrapper of onSnapshot that handles Quota Exceeded errors gracefully
export function onSnapshot(
  ref: any,
  nextOrObserver: any,
  errorOrNext?: any,
  complete?: any
): () => void {
  try {
    return fireonSnapshot(ref, nextOrObserver, errorOrNext, complete);
  } catch (error: any) {
    const isQuotaError = 
      error?.code === 'resource-exhausted' || 
      error?.message?.toLowerCase().includes('quota') || 
      error?.message?.toLowerCase().includes('limit exceeded');

    if (isQuotaError) {
      console.warn("onSnapshot caught quota error during initialization.");
      setQuotaExceeded(true);
      // Try calling nextOrObserver if possible with cache doc
      if (typeof nextOrObserver === 'function') {
        getDoc(ref).then(snap => nextOrObserver(snap)).catch(() => {});
      } else if (nextOrObserver && typeof nextOrObserver.next === 'function') {
        getDoc(ref).then(snap => nextOrObserver.next(snap)).catch(() => {});
      }
      return () => {};
    }
    throw error;
  }
}

// Standard Firestore write operations
export async function addDoc(colRef: any, data: any): Promise<any> {
  return await firestoreAddDoc(colRef, data);
}

export async function updateDoc(docRef: any, data: any): Promise<void> {
  await firestoreUpdateDoc(docRef, data);
}

export async function setDoc(docRef: any, data: any, options?: any): Promise<void> {
  await firestoreSetDoc(docRef, data, options);
}

export async function deleteDoc(docRef: any): Promise<void> {
  await firestoreDeleteDoc(docRef);
}

export function writeBatch(database: any): any {
  return firestoreWriteBatch(database);
}

// Auto-cleanup legacy offline seeded data to avoid user confusion
try {
  const legacyKeys = [
    'sipkl_offline_seeded',
    'sipkl_coll_siswa',
    'sipkl_coll_guru',
    'sipkl_coll_mitra',
    'sipkl_coll_jurnal',
    'sipkl_coll_absensi',
    'sipkl_quota_active'
  ];
  legacyKeys.forEach(key => localStorage.removeItem(key));
} catch (e) {
  console.warn("Failed to clear legacy seeding keys:", e);
}



