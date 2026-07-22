
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

// Helper to extract a typed value from modern Firebase query filter format
function extractQueryValue(valObj: any): any {
  if (!valObj) return undefined;
  if ('stringValue' in valObj) return valObj.stringValue;
  if ('integerValue' in valObj) return parseInt(valObj.integerValue, 10);
  if ('doubleValue' in valObj) return parseFloat(valObj.doubleValue);
  if ('booleanValue' in valObj) return valObj.booleanValue === true || valObj.booleanValue === 'true';
  if ('arrayValue' in valObj && valObj.arrayValue?.values) {
    return valObj.arrayValue.values.map((v: any) => extractQueryValue(v));
  }
  if ('value' in valObj) return valObj.value;
  return valObj;
}

// Emulate a Firestore QuerySnapshot query filter locally over our custom LocalStorage backups
function getLocalBackupSnapshot(colName: string, q: Query): any {
  const cacheKey = `sipkl_coll_${colName}`;
  const cachedStr = localStorage.getItem(cacheKey);
  if (!cachedStr) return null;
  
  try {
    let list = JSON.parse(cachedStr);
    
    // Parse filters out of standard and minified Web SDK Query objects
    const filters = (q as any)._query?.filters || [];
    for (const filter of filters) {
      const segments = filter.field?.segments || [];
      const field = segments.join('.');
      const op = filter.op;
      const rawVal = extractQueryValue(filter.value);
      
      if (field && op && rawVal !== undefined) {
        if (op === '==' || op === 'equal') {
          list = list.filter((item: any) => item[field] === rawVal);
        } else if (op === 'in') {
          const valList = Array.isArray(rawVal) ? rawVal : [rawVal];
          list = list.filter((item: any) => valList.includes(item[field]));
        }
      }
    }
    
    const mockDocs = list.map((item: any) => ({
      id: item.id,
      data: () => item,
      exists: () => true,
    }));
    
    return {
      docs: mockDocs,
      empty: mockDocs.length === 0,
      size: mockDocs.length,
      forEach: (callback: any) => mockDocs.forEach(callback),
      metadata: {
        fromCache: true,
        hasPendingWrites: false,
      }
    } as any;
  } catch (e) {
    console.error("Failed to parse local backup cache for:", colName, e);
  }
  return null;
}

// --- SMART MEMORY CACHING LAYER ---
interface CacheEntry {
  snap: QuerySnapshot;
  timestamp: number;
}

const memoryQueryCache = new Map<string, CacheEntry>();
const memoryDocCache = new Map<string, { snap: DocumentSnapshot; timestamp: number }>();
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes cache validity

export function clearQueryCache() {
  memoryQueryCache.clear();
  memoryDocCache.clear();
  console.log("[Smart Cache] Query and Document cache cleared successfully.");
}

function getQueryCacheKey(q: Query): string {
  try {
    const path = (q as any).path || (q as any)._query?.path?.segments?.join('/') || 'root';
    const queryDetails = JSON.stringify((q as any)._query || {});
    return `q_${path}_${queryDetails}`;
  } catch (e) {
    return 'q_generic_' + Math.random();
  }
}

function getDocCacheKey(docRef: DocumentReference): string {
  try {
    return docRef.path || (docRef as any).path || (docRef as any)._key?.path?.segments?.join('/') || docRef.id;
  } catch (e) {
    return 'd_' + docRef.id;
  }
}

// Custom wrapped read operations with Firestore cache fallbacks
export async function getDocs(q: Query): Promise<QuerySnapshot> {
  const cacheKey = getQueryCacheKey(q);
  const now = Date.now();
  const cached = memoryQueryCache.get(cacheKey);

  if (cached && (now - cached.timestamp < CACHE_TTL_MS)) {
    console.log(`[Smart Cache] Serving cached getDocs for key: ${cacheKey}. 0 Firestore reads used.`);
    return cached.snap;
  }

  let colName = '';
  try {
    const path = (q as any).path || (q as any)._query?.path?.segments?.join('/');
    if (path) {
      const segments = path.split('/');
      colName = segments[segments.length - 1];
    }
  } catch (e) {}

  try {
    const snap = await firestoreGetDocs(q);
    
    // Store in query cache
    memoryQueryCache.set(cacheKey, { snap, timestamp: now });
    
    // Auto backup successful query results to custom offline LocalStorage cache (merge strategy)
    if (colName && ['siswa', 'guru', 'mitra', 'jurnal', 'absensi'].includes(colName)) {
      try {
        const docsData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (docsData.length > 0) {
          const cacheKey = `sipkl_coll_${colName}`;
          let existingData: any[] = [];
          const cachedStr = localStorage.getItem(cacheKey);
          if (cachedStr) {
            existingData = JSON.parse(cachedStr);
          }
          
          const merged = [...existingData];
          docsData.forEach(newDoc => {
            const idx = merged.findIndex(m => m.id === newDoc.id);
            if (idx >= 0) {
              merged[idx] = newDoc;
            } else {
              merged.push(newDoc);
            }
          });
          localStorage.setItem(cacheKey, JSON.stringify(merged));
          console.log(`[Cache Backup] Synced ${docsData.length} records to local cache for ${colName}. Total cached: ${merged.length}`);
        }
      } catch (cacheErr) {
        console.warn("Failed to update custom local backup storage:", cacheErr);
      }
    }
    
    return snap;
  } catch (error: any) {
    const isQuotaError = 
      error?.code === 'resource-exhausted' || 
      error?.message?.toLowerCase().includes('quota') || 
      error?.message?.toLowerCase().includes('limit exceeded');

    if (isQuotaError) {
      console.warn("Firestore getDocs Quota Exceeded. Attempting local cache fallback...");
      setQuotaExceeded(true);
      
      // Try native Firestore cache first
      try {
        const nativeSnap = await getDocsFromCache(q);
        if (nativeSnap && nativeSnap.size > 0) {
          return nativeSnap;
        }
      } catch (cacheError) {
        console.warn("Firestore native cache retrieval failed:", cacheError);
      }
      
      // Fallback to our query-aware custom LocalStorage cache backup
      if (colName) {
        const backupSnap = getLocalBackupSnapshot(colName, q);
        if (backupSnap) {
          console.log(`[Offline Cache] Returned ${backupSnap.size} backup items from custom storage for ${colName}`);
          return backupSnap;
        }
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
  const cacheKey = getDocCacheKey(docRef);
  const now = Date.now();
  const cached = memoryDocCache.get(cacheKey);

  if (cached && (now - cached.timestamp < CACHE_TTL_MS)) {
    console.log(`[Smart Cache] Serving cached getDoc for key: ${cacheKey}. 0 Firestore reads used.`);
    return cached.snap;
  }

  let colName = '';
  let docId = docRef.id;
  try {
    const path = (docRef as any).path || (docRef as any)._key?.path?.segments?.join('/');
    if (path) {
      const segments = path.split('/');
      if (segments.length >= 2) {
        colName = segments[segments.length - 2];
      }
    }
  } catch (e) {}

  try {
    const snap = await firestoreGetDoc(docRef);
    
    // Store in doc cache
    memoryDocCache.set(cacheKey, { snap, timestamp: now });

    if (snap.exists() && colName && ['siswa', 'guru', 'mitra', 'jurnal', 'absensi'].includes(colName)) {
      try {
        const itemData = { id: snap.id, ...snap.data() };
        const cacheKey = `sipkl_coll_${colName}`;
        let existingData: any[] = [];
        const cachedStr = localStorage.getItem(cacheKey);
        if (cachedStr) {
          existingData = JSON.parse(cachedStr);
        }
        
        const merged = [...existingData];
        const idx = merged.findIndex(m => m.id === snap.id);
        if (idx >= 0) {
          merged[idx] = itemData;
        } else {
          merged.push(itemData);
        }
        localStorage.setItem(cacheKey, JSON.stringify(merged));
      } catch (cacheErr) {}
    }
    return snap;
  } catch (error: any) {
    const isQuotaError = 
      error?.code === 'resource-exhausted' || 
      error?.message?.toLowerCase().includes('quota') || 
      error?.message?.toLowerCase().includes('limit exceeded');

    if (isQuotaError) {
      console.warn("Firestore getDoc Quota Exceeded. Attempting local cache fallback...");
      setQuotaExceeded(true);
      
      // Try native Firestore cache first
      try {
        return await getDocFromCache(docRef);
      } catch (cacheError) {
        console.warn("Firestore doc cache retrieval failed:", cacheError);
      }
      
      // Fallback to our custom localStorage cache
      if (colName && docId) {
        try {
          const cacheKey = `sipkl_coll_${colName}`;
          const cachedStr = localStorage.getItem(cacheKey);
          if (cachedStr) {
            const list = JSON.parse(cachedStr);
            const found = list.find((item: any) => item.id === docId);
            if (found) {
              return {
                id: docId,
                exists: () => true,
                data: () => found,
                ref: docRef,
                metadata: {
                  fromCache: true,
                  hasPendingWrites: false
                }
              } as any;
            }
          }
        } catch (e) {}
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

// Helper functions to keep custom LocalStorage cache in sync with offline writes
function updateLocalCacheItem(colName: string, id: string, data: any) {
  if (!colName || !['siswa', 'guru', 'mitra', 'jurnal', 'absensi'].includes(colName)) return;
  try {
    const cacheKey = `sipkl_coll_${colName}`;
    let existingData: any[] = [];
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      existingData = JSON.parse(cached);
    }
    const idx = existingData.findIndex(m => m.id === id);
    if (idx >= 0) {
      existingData[idx] = { ...existingData[idx], ...data };
    } else {
      existingData.push({ id, ...data });
    }
    localStorage.setItem(cacheKey, JSON.stringify(existingData));
    console.log(`[Cache Sync] Synchronized write for ${id} in ${colName} to LocalStorage cache.`);
  } catch (e) {
    console.error("Failed to update local cache item:", e);
  }
}

function removeLocalCacheItem(colName: string, id: string) {
  if (!colName || !['siswa', 'guru', 'mitra', 'jurnal', 'absensi'].includes(colName)) return;
  try {
    const cacheKey = `sipkl_coll_${colName}`;
    let existingData: any[] = [];
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      existingData = JSON.parse(cached);
    }
    const filtered = existingData.filter(m => m.id !== id);
    localStorage.setItem(cacheKey, JSON.stringify(filtered));
    console.log(`[Cache Sync] Synchronized deletion for ${id} in ${colName} to LocalStorage cache.`);
  } catch (e) {
    console.error("Failed to remove local cache item:", e);
  }
}

// Standard Firestore write operations with local-backup sync and offline resilience
export async function addDoc(colRef: any, data: any): Promise<any> {
  clearQueryCache();
  let colName = '';
  try {
    const path = colRef.path || colRef._query?.path?.segments?.join('/');
    if (path) {
      const segments = path.split('/');
      colName = segments[segments.length - 1];
    }
  } catch (e) {}

  try {
    const docRef = await firestoreAddDoc(colRef, data);
    if (colName && docRef.id) {
      updateLocalCacheItem(colName, docRef.id, data);
    }
    return docRef;
  } catch (error: any) {
    const isQuotaError = 
      error?.code === 'resource-exhausted' || 
      error?.message?.toLowerCase().includes('quota') || 
      error?.message?.toLowerCase().includes('limit exceeded');

    if (isQuotaError && colName) {
      setQuotaExceeded(true);
      // Fallback local-only save so the user doesn't lose their data!
      const mockId = 'local_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
      updateLocalCacheItem(colName, mockId, data);
      console.warn(`[Offline Cache Write] Saved offline record under ID: ${mockId} in ${colName}`);
      return { id: mockId } as any;
    }
    throw error;
  }
}

export async function updateDoc(docRef: any, data: any): Promise<void> {
  clearQueryCache();
  let colName = '';
  let docId = docRef.id;
  try {
    const path = docRef.path || docRef._key?.path?.segments?.join('/');
    if (path) {
      const segments = path.split('/');
      if (segments.length >= 2) {
        colName = segments[segments.length - 2];
      }
    }
  } catch (e) {}

  if (colName && docId) {
    updateLocalCacheItem(colName, docId, data);
  }

  try {
    await firestoreUpdateDoc(docRef, data);
  } catch (error: any) {
    const isQuotaError = 
      error?.code === 'resource-exhausted' || 
      error?.message?.toLowerCase().includes('quota') || 
      error?.message?.toLowerCase().includes('limit exceeded');

    if (isQuotaError) {
      setQuotaExceeded(true);
      console.warn(`[Offline Cache Update] Saved offline update for ${docId} in ${colName}`);
      return;
    }
    throw error;
  }
}

export async function setDoc(docRef: any, data: any, options?: any): Promise<void> {
  clearQueryCache();
  let colName = '';
  let docId = docRef.id;
  try {
    const path = docRef.path || docRef._key?.path?.segments?.join('/');
    if (path) {
      const segments = path.split('/');
      if (segments.length >= 2) {
        colName = segments[segments.length - 2];
      }
    }
  } catch (e) {}

  if (colName && docId) {
    updateLocalCacheItem(colName, docId, data);
  }

  try {
    await firestoreSetDoc(docRef, data, options);
  } catch (error: any) {
    const isQuotaError = 
      error?.code === 'resource-exhausted' || 
      error?.message?.toLowerCase().includes('quota') || 
      error?.message?.toLowerCase().includes('limit exceeded');

    if (isQuotaError) {
      setQuotaExceeded(true);
      console.warn(`[Offline Cache Set] Saved offline set for ${docId} in ${colName}`);
      return;
    }
    throw error;
  }
}

export async function deleteDoc(docRef: any): Promise<void> {
  clearQueryCache();
  let colName = '';
  let docId = docRef.id;
  try {
    const path = docRef.path || docRef._key?.path?.segments?.join('/');
    if (path) {
      const segments = path.split('/');
      if (segments.length >= 2) {
        colName = segments[segments.length - 2];
      }
    }
  } catch (e) {}

  if (colName && docId) {
    removeLocalCacheItem(colName, docId);
  }

  try {
    await firestoreDeleteDoc(docRef);
  } catch (error: any) {
    const isQuotaError = 
      error?.code === 'resource-exhausted' || 
      error?.message?.toLowerCase().includes('quota') || 
      error?.message?.toLowerCase().includes('limit exceeded');

    if (isQuotaError) {
      setQuotaExceeded(true);
      console.warn(`[Offline Cache Delete] Deleted offline item ${docId} in ${colName}`);
      return;
    }
    throw error;
  }
}

export function writeBatch(database: any): any {
  const batch = firestoreWriteBatch(database);
  const originalCommit = batch.commit.bind(batch);
  batch.commit = async () => {
    clearQueryCache();
    return await originalCommit();
  };
  return batch;
}

// Clean up legacy offline mock seed status only - KEEP actual offline data tables
try {
  localStorage.removeItem('sipkl_offline_seeded');
} catch (e) {
  console.warn("Failed to clear legacy seeding keys:", e);
}



