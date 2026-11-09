import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfigData from '../../firebase-applet-config.json';

export const firebaseConfig = firebaseConfigData;
const app = initializeApp(firebaseConfig);
export const FIRESTORE_DATABASE_ID =
  (firebaseConfig as any).firestoreDatabaseId || 'ai-studio-db3168c1-729b-4a68-8d30-1644a5330071';
export const db = getFirestore(app, FIRESTORE_DATABASE_ID);
export const auth = getAuth(app);

export function isQuotaExceededError(err: any): boolean {
  if (!err) return false;
  const code = String(err?.code || '').toLowerCase();
  const msg = String(err?.message || err || '').toLowerCase();
  return (
    code.includes('resource-exhausted') ||
    msg.includes('quota limit exceeded') ||
    msg.includes('quota exceeded')
  );
}

export function isOfflineOrNetworkError(err: any): boolean {
  if (!err) return false;
  const code = String(err?.code || '').toLowerCase();
  const msg = String(err?.message || err || '').toLowerCase();
  return (
    code.includes('unavailable') ||
    code.includes('failed-precondition') ||
    msg.includes('offline') ||
    msg.includes('client is offline') ||
    msg.includes('network') ||
    msg.includes('transport')
  );
}


