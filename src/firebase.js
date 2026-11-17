// Firebase SDK Initialization and Firestore Helpers
// Stride Circuit LLC - Pace Plot
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  setDoc,
  addDoc,
  deleteDoc
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// CRITICAL: Specify databaseId from config
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Error Handling Function conforming to FirestoreErrorInfo standard
export const OperationType = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
};

export function handleFirestoreError(error, operationType, path) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
      emailVerified: auth.currentUser?.emailVerified || null,
      isAnonymous: auth.currentUser?.isAnonymous || null,
      tenantId: auth.currentUser?.tenantId || null,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Test Connection on boot
export async function testFirestoreConnection() {
  try {
    // Attempt reading from user profile or test path
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Firestore connection notice: client is offline or connecting.");
    }
  }
}

// Auth Helpers
export async function loginWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    
    // Create/update user document in Firestore
    if (user) {
      const userPath = `users/${user.uid}`;
      try {
        await setDoc(doc(db, 'users', user.uid), {
          displayName: (user.displayName || 'Pace Plot Runner').slice(0, 100),
          email: (user.email || '').slice(0, 150),
          photoURL: (user.photoURL || '').slice(0, 500),
          createdAt: new Date().toISOString()
        }, { merge: true });
      } catch (err) {
        try {
          handleFirestoreError(err, OperationType.WRITE, userPath);
        } catch (_) {}
      }
    }
    return user;
  } catch (err) {
    console.error("Google Sign-In Error:", err);
    throw err;
  }
}

export async function logoutUser() {
  try {
    await firebaseSignOut(auth);
  } catch (err) {
    console.error("Sign-out error:", err);
    throw err;
  }
}

// ----------------------------------------------------
// Firestore Collections Data Operations
// ----------------------------------------------------

// 1. Saved Routes
export function subscribeSavedRoutes(userId, onUpdate, onError) {
  if (!userId) return () => {};
  const path = 'savedRoutes';
  const q = query(collection(db, path), where('userId', '==', userId));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = [];
      snapshot.forEach(docSnap => {
        items.push({ id: docSnap.id, ...docSnap.data() });
      });
      onUpdate(items);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, path);
      } catch (structuredErr) {
        if (onError) onError(structuredErr);
      }
    }
  );
}

export async function addSavedRoute(routeData) {
  if (!auth.currentUser) throw new Error("Must be signed in to save route to cloud.");
  const path = 'savedRoutes';
  try {
    const routeTitle = String(routeData.title || 'Custom Safe Loop').slice(0, 150);
    const targetDist = Number(routeData.distance || 3.1);

    // Deduplication check: check if user already saved this exact route
    const q = query(
      collection(db, path),
      where('userId', '==', auth.currentUser.uid)
    );
    const snapshot = await getDocs(q);
    const existing = snapshot.docs.find(d => {
      const data = d.data();
      return data.title === routeTitle && Math.abs(Number(data.distance) - targetDist) < 0.15;
    });

    if (existing) {
      return { id: existing.id, isDuplicate: true };
    }

    const docRef = await addDoc(collection(db, path), {
      userId: auth.currentUser.uid,
      title: routeTitle,
      distance: targetDist,
      safetyScore: String(routeData.safetyScore || '9.8').slice(0, 10),
      locationName: String(routeData.locationName || 'Mapped Location').slice(0, 150),
      elevation: String(routeData.elevation || '+40 ft').slice(0, 50),
      pathCoordinates: Array.isArray(routeData.path) ? routeData.path.slice(0, 200) : [],
      createdAt: new Date().toISOString()
    });
    return { id: docRef.id, isDuplicate: false };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function deleteSavedRoute(routeId) {
  if (!auth.currentUser) throw new Error("Must be signed in to delete route.");
  const path = `savedRoutes/${routeId}`;
  try {
    await deleteDoc(doc(db, 'savedRoutes', routeId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// 2. Emergency Contacts
export function subscribeEmergencyContacts(userId, onUpdate, onError) {
  if (!userId) return () => {};
  const path = 'emergencyContacts';
  const q = query(collection(db, path), where('userId', '==', userId));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = [];
      snapshot.forEach(docSnap => {
        items.push({ id: docSnap.id, ...docSnap.data() });
      });
      onUpdate(items);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, path);
      } catch (structuredErr) {
        if (onError) onError(structuredErr);
      }
    }
  );
}

export async function addEmergencyContact(contactData) {
  if (!auth.currentUser) throw new Error("Must be signed in to add emergency contact to cloud.");
  const path = 'emergencyContacts';
  try {
    const docRef = await addDoc(collection(db, path), {
      userId: auth.currentUser.uid,
      name: String(contactData.name || 'Emergency Contact').slice(0, 100),
      phone: String(contactData.phone || '').slice(0, 30),
      role: String(contactData.role || 'Contact').slice(0, 20),
      createdAt: new Date().toISOString()
    });
    return docRef.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function deleteEmergencyContact(contactId) {
  if (!auth.currentUser) throw new Error("Must be signed in to delete emergency contact.");
  const path = `emergencyContacts/${contactId}`;
  try {
    await deleteDoc(doc(db, 'emergencyContacts', contactId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// 3. Run Workout Activities
export function subscribeRunActivities(userId, onUpdate, onError) {
  if (!userId) return () => {};
  const path = 'runActivities';
  const q = query(collection(db, path), where('userId', '==', userId));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = [];
      snapshot.forEach(docSnap => {
        items.push({ id: docSnap.id, ...docSnap.data() });
      });
      onUpdate(items);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, path);
      } catch (structuredErr) {
        if (onError) onError(structuredErr);
      }
    }
  );
}

export async function addRunActivity(activityData) {
  if (!auth.currentUser) return null; // Only persist if user signed in
  const path = 'runActivities';
  try {
    const docRef = await addDoc(collection(db, path), {
      userId: auth.currentUser.uid,
      routeTitle: String(activityData.routeTitle || 'Safe Run Loop').slice(0, 150),
      distance: Number(activityData.distance || 0),
      durationSeconds: Number(activityData.durationSeconds || 0),
      avgPace: String(activityData.avgPace || "8'42\"").slice(0, 20),
      avgHeartRate: Number(activityData.avgHeartRate || 145),
      calories: Number(activityData.calories || 280),
      completedAt: activityData.completedAt ? String(activityData.completedAt).slice(0, 64) : new Date().toISOString()
    });
    return docRef.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
    throw err;
  }
}

// 4. Offline Workout Queue & Background Sync (F12)
export const OFFLINE_WORKOUT_QUEUE_KEY = 'paceplot_offline_workout_queue';
const OFFLINE_QUEUE_CACHE_NAME = 'paceplot-v1.2.0';
const OFFLINE_QUEUE_CACHE_URL = '/__offline_workout_queue';

export function getOfflineWorkoutQueue(storage = globalThis.localStorage) {
  try {
    if (!storage || typeof storage.getItem !== 'function') return [];
    const raw = storage.getItem(OFFLINE_WORKOUT_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

export async function enqueueOfflineWorkout(
  workoutData,
  storage = globalThis.localStorage,
  cacheStorage = globalThis.caches
) {
  const queue = getOfflineWorkoutQueue(storage);
  const item = {
    ...(workoutData || {}),
    completedAt: workoutData?.completedAt ? String(workoutData.completedAt).slice(0, 64) : new Date().toISOString(),
    queuedAt: new Date().toISOString()
  };
  const isDup = queue.some(
    (existing) =>
      existing.completedAt === item.completedAt &&
      (existing.routeTitle || '') === (item.routeTitle || '')
  );
  if (!isDup) {
    queue.push(item);
  }

  try {
    if (storage && typeof storage.setItem === 'function') {
      storage.setItem(OFFLINE_WORKOUT_QUEUE_KEY, JSON.stringify(queue));
    }
  } catch (_) {}

  try {
    if (cacheStorage && typeof cacheStorage.open === 'function' && typeof Response !== 'undefined') {
      const cache = await cacheStorage.open(OFFLINE_QUEUE_CACHE_NAME);
      await cache.put(
        OFFLINE_QUEUE_CACHE_URL,
        new Response(JSON.stringify(queue), {
          headers: { 'Content-Type': 'application/json' }
        })
      );
    }
  } catch (_) {}

  return queue;
}

export async function flushOfflineWorkoutQueue(options = {}) {
  const storage = options.storage !== undefined ? options.storage : globalThis.localStorage;
  const cacheStorage = options.cacheStorage !== undefined ? options.cacheStorage : globalThis.caches;
  const uploadFn = options.uploadFn || options.addRunActivityImpl || addRunActivity;
  const isOnline = options.isOnline !== undefined ? Boolean(options.isOnline) : (globalThis.navigator?.onLine ?? true);
  const currentUser =
    options.user !== undefined
      ? options.user
      : (options.currentUser !== undefined ? options.currentUser : auth.currentUser);

  const queue = getOfflineWorkoutQueue(storage);
  if (queue.length === 0) {
    return { flushedCount: 0, remainingCount: 0 };
  }
  if (!isOnline || !currentUser) {
    return { flushedCount: 0, remainingCount: queue.length };
  }

  let flushedCount = 0;
  const remaining = [];

  for (const item of queue) {
    try {
      const res = await uploadFn(item);
      if (res) {
        flushedCount++;
      } else {
        remaining.push(item);
      }
    } catch (_) {
      remaining.push(item);
    }
  }

  try {
    if (storage) {
      if (remaining.length === 0 && typeof storage.removeItem === 'function') {
        storage.removeItem(OFFLINE_WORKOUT_QUEUE_KEY);
      } else if (typeof storage.setItem === 'function') {
        storage.setItem(OFFLINE_WORKOUT_QUEUE_KEY, JSON.stringify(remaining));
      }
    }
  } catch (_) {}

  try {
    if (cacheStorage && typeof cacheStorage.open === 'function') {
      const cache = await cacheStorage.open(OFFLINE_QUEUE_CACHE_NAME);
      if (remaining.length === 0 && typeof cache.delete === 'function') {
        await cache.delete(OFFLINE_QUEUE_CACHE_URL);
      } else if (typeof cache.put === 'function' && typeof Response !== 'undefined') {
        await cache.put(
          OFFLINE_QUEUE_CACHE_URL,
          new Response(JSON.stringify(remaining), {
            headers: { 'Content-Type': 'application/json' }
          })
        );
      }
    }
  } catch (_) {}

  return { flushedCount, remainingCount: remaining.length };
}

// 5. User Profile Sync (Subscription & Active Training Plan) (F13)
export async function syncUserProfileState(partialData = {}) {
  if (!auth.currentUser || !partialData || typeof partialData !== 'object') return null;
  const userPath = `users/${auth.currentUser.uid}`;
  try {
    await setDoc(
      doc(db, 'users', auth.currentUser.uid),
      {
        email: (auth.currentUser.email || '').slice(0, 150),
        ...partialData,
        updatedAt: new Date().toISOString()
      },
      { merge: true }
    );
    return true;
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.WRITE, userPath);
    } catch (_) {}
    return false;
  }
}

export function subscribeUserProfile(userId, onUpdate, onError) {
  if (!userId) return () => {};
  const path = `users/${userId}`;
  return onSnapshot(
    doc(db, 'users', userId),
    (docSnap) => {
      onUpdate(docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.GET, path);
      } catch (structuredErr) {
        if (onError) onError(structuredErr);
      }
    }
  );
}

// 6. Live SafeGuard Beacon Session (F14)
export async function upsertBeaconSession(sessionId, beaconData = {}) {
  if (!auth.currentUser || !sessionId) return null;
  const cleanId = String(sessionId).slice(0, 128);
  const path = `beacons/${cleanId}`;
  try {
    await setDoc(
      doc(db, 'beacons', cleanId),
      {
        userId: auth.currentUser.uid,
        ...beaconData,
        updatedAt: new Date().toISOString()
      },
      { merge: true }
    );
    return cleanId;
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.WRITE, path);
    } catch (_) {}
    return null;
  }
}

export function subscribeBeaconSession(sessionId, onUpdate, onError) {
  if (!sessionId) return () => {};
  const cleanId = String(sessionId).slice(0, 128);
  const path = `beacons/${cleanId}`;
  return onSnapshot(
    doc(db, 'beacons', cleanId),
    (docSnap) => {
      onUpdate(docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.GET, path);
      } catch (structuredErr) {
        if (onError) onError(structuredErr);
      }
    }
  );
}

export {
  collection,
  query,
  where,
  onSnapshot,
  setDoc,
  addDoc,
  deleteDoc,
  doc,
  onAuthStateChanged
};
