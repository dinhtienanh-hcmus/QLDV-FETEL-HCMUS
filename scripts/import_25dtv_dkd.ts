import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc, writeBatch } from 'firebase/firestore';
import * as fs from 'fs';
import firebaseConfigData from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfigData);
const db = getFirestore(app, firebaseConfigData.firestoreDatabaseId);

const subs: Record<string, string> = {
  'Ph?m': 'Phạm', 'Nguy?n': 'Nguyễn', 'B?o': 'Bảo', 'H?i': 'Hải', 'Ðang': 'Đăng', 'Qu?c': 'Quốc',
  'Hu?nh': 'Huỳnh', 'Ng?c': 'Ngọc', 'Phu?c': 'Phước', 'T?n': 'Tấn', 'Tu?n': 'Tuấn', 'Th?nh': 'Thịnh',
  'Ð?c': 'Đức', 'Vi?n': 'Viễn', 'M? Ái': 'Mỹ Ái', 'Nh?t': 'Nhật', 'H?ng': 'Hùng', 'Cu?ng': 'Cường',
  'Luu': 'Lưu', 'C?m': 'Cẩm', 'Ðào': 'Đào', 'Huong': 'Hương', 'Ki?t': 'Kiệt', 'Vi?t': 'Việt',
  'Tâm': 'Tâm', 'Ð?': 'Đỗ', 'Thành': 'Thành', 'Ð?t': 'Đạt', 'Ðông': 'Đông', 'M?c': 'Mạc',
  'H?u': 'Hữu', 'M?nh': 'Mạnh', 'Võ': 'Võ', 'Vuong': 'Vương', 'M? M?': 'Mỹ Mỹ', 'K? Nam': 'Kỳ Nam',
  'Qu?nh': 'Quỳnh', 'Vũ': 'Vũ', 'Nhân': 'Nhân', 'Ti?n': 'Tiến', 'Tri?t': 'Triết', 'Dương': 'Dương',
  'Ðình': 'Đình', 'T?t': 'Tất', 'Ðoàn': 'Đoàn', 'Kh?i': 'Khải', 'Trường': 'Trường', 'Truong': 'Trương',
  'Tru?ng': 'Trường', 'Th?': 'Thị', 'Lu?t': 'Luật', 'Nghia': 'Nghĩa', 'Th?ng': 'Thắng', 'Ðang Khoa': 'Đăng Khoa',
  'Tr?n': 'Trần', 'H?': 'Hồ', 'V?': 'Vũ', 'M?': 'Mỹ', 'Kh?nh': 'Khánh', 'Cát': 'Cát', 'Nhu': 'Như'
};

function cleanName(raw: string): string {
  let res = raw;
  for (const [k, v] of Object.entries(subs)) {
    res = res.split(k).join(v);
  }
  res = res.replace(/Ð/g, 'Đ');
  return res.trim();
}

async function run() {
  console.log('Reading DANH_S_CH_25DTV_DKD_be41fdeb.csv...');
  const buffer = fs.readFileSync('public/assets/aistudio/DANH_S_CH_25DTV_DKD_be41fdeb.csv');
  const lines = buffer.toString('latin1').split(/\r?\n/).filter(l => l.trim().length > 0);
  console.log(`Found ${lines.length} rows.`);

  // 1. Get existing users to check if any student already logged in
  const usersSnap = await getDocs(collection(db, 'users'));
  const activeUserByMssv = new Map<string, string>();
  usersSnap.docs.forEach(d => {
    const data = d.data();
    const m = String(data.mssv || data.username || '').toLowerCase().trim();
    if (m && !d.id.startsWith('profile_')) {
      activeUserByMssv.set(m, d.id);
    }
  });

  console.log(`Found ${activeUserByMssv.size} active existing users.`);

  // Write in batches of 50
  let batch = writeBatch(db);
  let batchCount = 0;
  let totalImported = 0;
  let totalMerged = 0;

  for (const line of lines) {
    const parts = line.split(',').map(s => s.trim());
    if (parts.length < 3) continue;
    const mssv = parts[1];
    const rawStudentName = parts[2];
    const branch = parts[3] || '25DTV_DKD';
    const studentName = cleanName(rawStudentName);

    if (!mssv || !/^\d+$/.test(mssv)) continue;

    const lowerMssv = mssv.toLowerCase();
    const existingActiveUid = activeUserByMssv.get(lowerMssv);

    if (existingActiveUid) {
      // Merge with active account
      const docRef = doc(db, 'users', existingActiveUid);
      batch.set(docRef, {
        name: studentName,
        mssv: mssv,
        branch: branch,
        updatedAt: Date.now()
      }, { merge: true });
      totalMerged++;
    } else {
      // Create pre-imported profile placeholder
      const docRef = doc(db, 'users', `profile_${lowerMssv}`);
      batch.set(docRef, {
        username: mssv,
        mssv: mssv,
        email: `${mssv}@student.hcmus.edu.vn`,
        name: studentName,
        role: 'doanvien',
        branch: branch,
        createdAt: Date.now()
      }, { merge: true });
      totalImported++;
    }

    batchCount++;
    if (batchCount >= 40) {
      await batch.commit();
      console.log(`Committed batch of ${batchCount} documents.`);
      batch = writeBatch(db);
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
    console.log(`Committed final batch of ${batchCount} documents.`);
  }

  console.log(`IMPORT COMPLETED SUCCESSFULLY:`);
  console.log(`- Pre-imported profiles: ${totalImported}`);
  console.log(`- Merged with existing accounts: ${totalMerged}`);
  console.log(`- Total: ${totalImported + totalMerged} students of 25DTV_DKD`);
  process.exit(0);
}

run().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
