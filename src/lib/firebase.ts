import type { Firestore } from "firebase/firestore";

/**
 * Firebase project "Beyond the Algorithm" (Firestore, Doha). This web config
 * is public by design: what visitors may read or write is decided by the
 * Firestore security rules in `firestore.rules`, not by hiding these values.
 */
const config = {
  apiKey: "AIzaSyB4TwFn_5djz6-K05TMyEYctQXWtfDXY2c",
  authDomain: "beyond-the-algorithm-d26e3.firebaseapp.com",
  projectId: "beyond-the-algorithm-d26e3",
  storageBucket: "beyond-the-algorithm-d26e3.firebasestorage.app",
  messagingSenderId: "507509435259",
  appId: "1:507509435259:web:9ea8996a8b2ea61148ebde",
};

let dbPromise: Promise<Firestore> | null = null;

/**
 * Firestore, loaded on first use only (result screens and the feedback form),
 * so no game pays for it on its first screen. Browser only.
 *
 * The local cache keeps the last boards on the device: on bad venue Wi-Fi
 * they still show, and new scores upload once the connection is back.
 */
export function getDb(): Promise<Firestore> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const [{ getApps, initializeApp }, fs] = await Promise.all([import("firebase/app"), import("firebase/firestore")]);
      const app = getApps()[0] ?? initializeApp(config);
      try {
        return fs.initializeFirestore(app, {
          localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
        });
      } catch {
        // Already initialised (hot reload) or no IndexedDB: use what exists.
        return fs.getFirestore(app);
      }
    })();
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}
