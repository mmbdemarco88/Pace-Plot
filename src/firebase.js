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
import firebaseConfig from '../firebase-applet-config.json';

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
      completedAt: new Date().toISOString()
    });
    return docRef.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
    throw err;
  }
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
