import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import firebaseConfigData from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfigData);
const db = getFirestore(app, firebaseConfigData.firestoreDatabaseId);
const auth = getAuth(app);

async function cleanData() {
  console.log('Starting data cleanup...');

  try {
    await signInWithEmailAndPassword(auth, 'dkdtvt.hcmus@gmail.com', 'Abc@123');
    console.log('Signed in as admin successfully.');
  } catch (err) {
    try {
      await signInWithEmailAndPassword(auth, 'dkdtvt.hcmus@gmail.com', '123123');
      console.log('Signed in as admin with 123123 successfully.');
    } catch (err2) {
      console.warn('Admin login attempt failed:', err2);
    }
  }

  // 1. Delete activities & registrations subcollection
  console.log('Cleaning activities...');
  const actSnap = await getDocs(collection(db, 'activities'));
  for (const actDoc of actSnap.docs) {
    const regSnap = await getDocs(collection(db, 'activities', actDoc.id, 'registrations'));
    for (const regDoc of regSnap.docs) {
      await deleteDoc(doc(db, 'activities', actDoc.id, 'registrations', regDoc.id));
    }
    await deleteDoc(doc(db, 'activities', actDoc.id));
  }
  console.log(`Deleted ${actSnap.docs.length} activities.`);

  // 2. Delete notifications
  console.log('Cleaning notifications...');
  const notifSnap = await getDocs(collection(db, 'notifications'));
  for (const nDoc of notifSnap.docs) {
    await deleteDoc(doc(db, 'notifications', nDoc.id));
  }
  console.log(`Deleted ${notifSnap.docs.length} notifications.`);

  // 3. Clean users except admin & user Google email
  const allowedEmails = ['dkdtvt.hcmus@gmail.com', 'dinhtienanh.hcmus@gmail.com'];
  console.log('Cleaning users collection...');
  const usersSnap = await getDocs(collection(db, 'users'));
  let deletedUsersCount = 0;
  for (const uDoc of usersSnap.docs) {
    const data = uDoc.data();
    const userEmail = (data.email || data.authEmail || '').toLowerCase().trim();
    const isAllowed = allowedEmails.some(e => userEmail.includes(e) || uDoc.id.includes(e));

    if (!isAllowed) {
      await deleteDoc(doc(db, 'users', uDoc.id));
      deletedUsersCount++;
    } else {
      console.log(`Kept user doc: ${uDoc.id} (${userEmail})`);
    }
  }
  console.log(`Deleted ${deletedUsersCount} users. Kept allowed admin & user accounts.`);

  console.log('Cleanup completed successfully!');
  process.exit(0);
}

cleanData().catch((err) => {
  console.error('Error during cleanup:', err);
  process.exit(1);
});
