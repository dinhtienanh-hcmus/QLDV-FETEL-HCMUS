import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, getDoc, query, orderBy, deleteDoc, doc, updateDoc, setDoc } from 'firebase/firestore';
import { db, firebaseConfig } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { PlusCircle, Trash2, Users, FileSpreadsheet, Check, X, Bell, Upload, List, Edit2, Camera, Plus } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import Papa from 'papaparse';
import { isTermExpired, filterActiveTerms, DEFAULT_DOAN_KHOA_TERMS, DEFAULT_DOAN_KHOA_PERIODS, DEFAULT_CHI_DOAN_TERMS } from '../utils/termUtils';

interface Organizer {
  mssv: string;
  name: string;
  role: string;
}

interface Activity {
  id: string;
  name: string;
  startTime: number;
  endTime: number;
  pointsParticipant: number;
  pointsOrganizer: number;
  drlCategory?: string;
  targetAudience: string;
  semester: number;
  academicYear: string;
  creatorId?: string;
  status: 'pending' | 'approved' | 'rejected';
  planLink?: string;
  evidenceLink?: string;
  description?: string;
  imageUrl?: string;
  branch?: string;
  organizerDetails?: Organizer[];
  isCooperating?: boolean;
  cooperatingBranches?: string[];
  otherCooperators?: string;
  branches?: string[];
}

export default function AdminScreen() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const { currentUser } = useAuth();
  
  const [name, setName] = useState('');
  const [startTimeStr, setStartTimeStr] = useState('');
  const [endTimeStr, setEndTimeStr] = useState('');
  const [pointsParticipant, setPointsParticipant] = useState(2);
  const [pointsOrganizer, setPointsOrganizer] = useState(5);
  const [drlCategory, setDrlCategory] = useState('Mục 3: Trách nhiệm tham gia các hoạt động chính trị, xã hội, văn hóa, văn nghệ, thể thao, phòng chống tội phạm, tệ nạn xã hội');
  const [organizerDetails, setOrganizerDetails] = useState<Organizer[]>([]);
  const [isCooperating, setIsCooperating] = useState(false);
  const [cooperatingBranches, setCooperatingBranches] = useState<string[]>([]);
  const [otherCooperators, setOtherCooperators] = useState('');
  const [searchMssv, setSearchMssv] = useState('');
  const [selectedRole, setSelectedRole] = useState('Thành viên');
  const [targetAudience, setTargetAudience] = useState('all');
  const [planLink, setPlanLink] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [semester, setSemester] = useState(1);
  const [academicYear, setAcademicYear] = useState('2026-2027');

  const isAdmin = currentUser?.role === 'admin';
  const isBranch = currentUser?.role === 'chidoan';

  const isUserInMyBranch = (u: any) => {
    if (isAdmin) return true;
    if (isBranch) {
      const myBranch = (currentUser?.branch || '').trim().toLowerCase();
      if (!myBranch) return false;
      const uBranch = (u.branch || '').trim().toLowerCase();
      return uBranch === myBranch || uBranch.includes(myBranch) || myBranch.includes(uBranch);
    }
    return false;
  };

  const [activeTab, setActiveTab] = useState<'activities' | 'users' | 'bch' | 'handbook' | 'branches'>('activities');
  const [usersList, setUsersList] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [selectedBranchFilter, setSelectedBranchFilter] = useState('');
  const [searchBch, setSearchBch] = useState('');

  const [branches, setBranches] = useState<any[]>([]);
  const [newBranchName, setNewBranchName] = useState('');
  const [editingBranchId, setEditingBranchId] = useState<string | null>(null);
  const [editingBranchName, setEditingBranchName] = useState('');
  const [deletingBranch, setDeletingBranch] = useState<{ id: string; name: string } | null>(null);
  const [branchesSeeded, setBranchesSeeded] = useState(false);

  const DEFAULT_BRANCHES = [
    '25ICD1', '25DTV1', '25DTV2', '25DTV_DKD',
    '26ICD1', '26DTV1', '26DTV2', '26DTV_DKD'
  ];

  const [handbookTopics, setHandbookTopics] = useState<any[]>([]);
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [topicTitle, setTopicTitle] = useState('');
  const [topicContent, setTopicContent] = useState('');
  
  const [notificationMsg, setNotificationMsg] = useState('');
  const [notificationTarget, setNotificationTarget] = useState('all');

  const [newUsername, setNewUsername] = useState('');
  const [newRole, setNewRole] = useState('chidoan');
  const [newName, setNewName] = useState('');
  const [newBranch, setNewBranch] = useState('');
  const [creatingAccount, setCreatingAccount] = useState(false);

  const [editingBchUser, setEditingBchUser] = useState<any>(null);
  const [bchModalTab, setBchModalTab] = useState<'doankhoa' | 'chidoan'>('doankhoa');
  
  // Dynamic terms & periods state
  const [doanKhoaTerms, setDoanKhoaTerms] = useState<string[]>(DEFAULT_DOAN_KHOA_TERMS);
  const [doanKhoaPeriods, setDoanKhoaPeriods] = useState<string[]>(DEFAULT_DOAN_KHOA_PERIODS);
  const [chiDoanTerms, setChiDoanTerms] = useState<string[]>(DEFAULT_CHI_DOAN_TERMS);

  const [showAddTermModal, setShowAddTermModal] = useState(false);
  const [addTermType, setAddTermType] = useState<'dk_term' | 'dk_period' | 'cd_term'>('dk_term');
  const [newTermInput, setNewTermInput] = useState('');

  const [bchForm, setBchForm] = useState({
    committeeRole: '',
    branchRole: '',
    committeePeriod: '2026-2027',
    committeeTerm: '2025-2027',
    branchTerm: '2026-2027',
    avatar: ''
  });

  const [editingUserInfo, setEditingUserInfo] = useState<any>(null);
  const [userEditForm, setUserEditForm] = useState({
    name: '',
    mssv: '',
    branch: '',
    email: '',
    username: '',
    role: 'doanvien'
  });

  useEffect(() => {
    fetchActivities();
    fetchUsers();
    fetchBchTerms();
    if (isAdmin) {
      fetchHandbookTopics();
      fetchBranches();
    }
  }, [currentUser, isAdmin]);

  const fetchBchTerms = async () => {
    try {
      const termsDocRef = doc(db, 'system', 'bch_terms');
      const termsDocSnap = await getDoc(termsDocRef);

      let dkTerms = DEFAULT_DOAN_KHOA_TERMS;
      let dkPeriods = DEFAULT_DOAN_KHOA_PERIODS;
      let cdTerms = DEFAULT_CHI_DOAN_TERMS;

      if (termsDocSnap.exists()) {
        const data = termsDocSnap.data();
        if (Array.isArray(data.doanKhoaTerms)) dkTerms = Array.from(new Set([...dkTerms, ...data.doanKhoaTerms]));
        if (Array.isArray(data.doanKhoaPeriods)) dkPeriods = Array.from(new Set([...dkPeriods, ...data.doanKhoaPeriods]));
        if (Array.isArray(data.chiDoanTerms)) cdTerms = Array.from(new Set([...cdTerms, ...data.chiDoanTerms]));
      }

      // Filter out expired terms/periods (passing October cutoff of end year)
      const activeDkTerms = filterActiveTerms(dkTerms);
      const activeDkPeriods = filterActiveTerms(dkPeriods);
      const activeCdTerms = filterActiveTerms(cdTerms);

      if (activeDkTerms.length === 0) activeDkTerms.push('2025-2027');
      if (activeDkPeriods.length === 0) activeDkPeriods.push('2026-2027');
      if (activeCdTerms.length === 0) activeCdTerms.push('2026-2027');

      setDoanKhoaTerms(activeDkTerms);
      setDoanKhoaPeriods(activeDkPeriods);
      setChiDoanTerms(activeCdTerms);

      // Sync active cleaned list to Firestore
      try {
        await setDoc(termsDocRef, {
          doanKhoaTerms: activeDkTerms,
          doanKhoaPeriods: activeDkPeriods,
          chiDoanTerms: activeCdTerms,
          updatedAt: Date.now()
        }, { merge: true });
      } catch (writeErr) {
        console.warn("Không thể lưu cập nhật nhiệm kỳ lên Firestore:", writeErr);
      }
    } catch (e) {
      console.error("Lỗi tải/dọn dẹp danh sách nhiệm kỳ:", e);
    }
  };

  const handleAddNewTerm = async () => {
    if (!newTermInput.trim()) return;
    const termStr = newTermInput.trim();
    
    // Validate format YYYY-YYYY or YYYY - YYYY
    const regex = /^\d{4}\s*-\s*\d{4}$/;
    if (!regex.test(termStr)) {
      alert("Vui lòng nhập đúng định dạng Năm-Năm (VD: 2027-2029)");
      return;
    }

    if (isTermExpired(termStr)) {
      alert("Nhiệm kỳ/Giai đoạn này đã hết hạn (sau mốc tháng 10 của năm kết thúc)!");
      return;
    }

    try {
      let updatedDkTerms = [...doanKhoaTerms];
      let updatedDkPeriods = [...doanKhoaPeriods];
      let updatedCdTerms = [...chiDoanTerms];

      if (addTermType === 'dk_term') {
        updatedDkTerms = filterActiveTerms([...updatedDkTerms, termStr]);
        setDoanKhoaTerms(updatedDkTerms);
        setBchForm(prev => ({ ...prev, committeeTerm: termStr }));
      } else if (addTermType === 'dk_period') {
        updatedDkPeriods = filterActiveTerms([...updatedDkPeriods, termStr]);
        setDoanKhoaPeriods(updatedDkPeriods);
        setBchForm(prev => ({ ...prev, committeePeriod: termStr }));
      } else if (addTermType === 'cd_term') {
        updatedCdTerms = filterActiveTerms([...updatedCdTerms, termStr]);
        setChiDoanTerms(updatedCdTerms);
        setBchForm(prev => ({ ...prev, branchTerm: termStr }));
      }

      const termsDocRef = doc(db, 'system', 'bch_terms');
      await setDoc(termsDocRef, {
        doanKhoaTerms: updatedDkTerms,
        doanKhoaPeriods: updatedDkPeriods,
        chiDoanTerms: updatedCdTerms,
        updatedAt: Date.now()
      }, { merge: true });

      setNewTermInput('');
      setShowAddTermModal(false);
      alert(`Đã thêm mới thành công: ${termStr}`);
    } catch (e) {
      console.error(e);
      alert("Có lỗi khi thêm nhiệm kỳ mới.");
    }
  };

  const fetchBranches = async () => {
    try {
      const q = query(collection(db, 'branches'), orderBy('name', 'asc'));
      const snapshot = await getDocs(q);
      if (snapshot.empty && !branchesSeeded) {
        setBranchesSeeded(true);
        const list = [];
        for (const bName of DEFAULT_BRANCHES) {
          const docRef = await addDoc(collection(db, 'branches'), { name: bName, createdAt: Date.now() });
          list.push({ id: docRef.id, name: bName });
        }
        setBranches(list);
      } else {
        setBranches(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    } catch (err) {
      console.error('Lỗi tải Chi đoàn:', err);
    }
  };

  const handleAddBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBranchName.trim()) return;
    try {
      await addDoc(collection(db, 'branches'), {
        name: newBranchName.trim(),
        createdAt: Date.now(),
      });
      setNewBranchName('');
      fetchBranches();
    } catch (err) {
      console.error(err);
      alert('Không thể thêm Chi đoàn.');
    }
  };

  const handleUpdateBranch = async (id: string) => {
    if (!editingBranchName.trim()) return;
    try {
      await updateDoc(doc(db, 'branches', id), {
        name: editingBranchName.trim(),
        updatedAt: Date.now(),
      });
      setEditingBranchId(null);
      setEditingBranchName('');
      fetchBranches();
    } catch (err) {
      console.error(err);
      alert('Không thể cập nhật Chi đoàn.');
    }
  };

  const confirmDeleteBranch = async () => {
    if (!deletingBranch) return;
    try {
      await deleteDoc(doc(db, 'branches', deletingBranch.id));
      setBranches(prev => prev.filter(b => b.id !== deletingBranch.id));
      setDeletingBranch(null);
    } catch (err) {
      console.error(err);
      alert('Không thể xóa Chi đoàn.');
    }
  };

  const fetchHandbookTopics = async () => {
    try {
      const q = query(collection(db, 'handbook_topics'), orderBy('order', 'asc'));
      const snapshot = await getDocs(q);
      const topics = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setHandbookTopics(topics);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const snapshot = await getDocs(collection(db, 'users'));
      const rawUsers = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
      
      const cleanedUsers = rawUsers.map(usr => {
        let modified = false;
        let cTerm = usr.committeeTerm;
        let cPeriod = usr.committeePeriod;
        let bTerm = usr.branchTerm;

        if (cTerm && isTermExpired(cTerm)) {
          cTerm = null;
          modified = true;
        }
        if (cPeriod && isTermExpired(cPeriod)) {
          cPeriod = null;
          modified = true;
        }
        if (bTerm && isTermExpired(bTerm)) {
          bTerm = null;
          modified = true;
        }

        if (modified) {
          updateDoc(doc(db, 'users', usr.id), {
            committeeTerm: cTerm,
            committeePeriod: cPeriod,
            branchTerm: bTerm
          }).catch(console.error);
        }

        return {
          ...usr,
          committeeTerm: cTerm,
          committeePeriod: cPeriod,
          branchTerm: bTerm
        };
      });

      setUsersList(cleanedUsers);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchActivities = async () => {
    if (!currentUser) return;
    try {
      const q = query(collection(db, 'activities'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const acts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Activity));
      
      const filteredActs = acts.filter(a => {
        if (isAdmin) return true;
        const matchesBranch = a.branch === currentUser?.branch || (a.branches && a.branches.includes(currentUser?.branch || ''));
        return a.creatorId === currentUser?.uid || matchesBranch;
      });
      
      setActivities(filteredActs);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingTopicId) {
        await updateDoc(doc(db, 'handbook_topics', editingTopicId), {
          title: topicTitle,
          content: topicContent,
        });
      } else {
        await addDoc(collection(db, 'handbook_topics'), {
          title: topicTitle,
          content: topicContent,
          order: handbookTopics.length + 1
        });
      }
      setTopicTitle('');
      setTopicContent('');
      setEditingTopicId(null);
      fetchHandbookTopics();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteTopic = async (id: string) => {
    if (!window.confirm("Bạn có chắc muốn xóa chủ đề này?")) return;
    try {
      await deleteDoc(doc(db, 'handbook_topics', id));
      fetchHandbookTopics();
    } catch (err) {
      console.error(err);
    }
  };

  const handleEditTopic = (topic: any) => {
    setEditingTopicId(topic.id);
    setTopicTitle(topic.title);
    setTopicContent(topic.content);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !startTimeStr || !endTimeStr) return;
    
    try {
      const startMs = new Date(startTimeStr).getTime();
      const endMs = new Date(endTimeStr).getTime();
      
      const newAct = {
        name,
        startTime: startMs || Date.now(),
        endTime: endMs || (Date.now() + 86400000),
        pointsParticipant,
        pointsOrganizer,
        drlCategory,
        targetAudience,
        semester,
        academicYear,
        creatorId: currentUser?.uid,
        branch: currentUser?.branch || 'admin',
        branches: isCooperating ? [currentUser?.branch || 'admin', ...cooperatingBranches] : [currentUser?.branch || 'admin'],
        organizerDetails,
        isCooperating,
        cooperatingBranches,
        otherCooperators,
        status: isAdmin ? 'approved' : 'pending',
        planLink,
        description,
        imageUrl,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      
      const docRef = await addDoc(collection(db, 'activities'), newAct);

      if (isAdmin && newAct.status === 'approved') {
        await addDoc(collection(db, 'notifications'), {
          title: 'Hoạt động mới',
          message: `Có hoạt động mới: ${name}`,
          targetAudience,
          createdAt: Date.now()
        });
      }

      setName('');
      setStartTimeStr('');
      setEndTimeStr('');
      setPlanLink('');
      setDescription('');
      setImageUrl('');
      setOrganizerDetails([]);
      setIsCooperating(false);
      setCooperatingBranches([]);
      setOtherCooperators('');
      fetchActivities();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Xóa hoạt động này?')) return;
    try {
      await deleteDoc(doc(db, 'activities', id));
      fetchActivities();
    } catch (err) {
      console.error(err);
    }
  };

  const handleApprove = async (id: string, actName: string, actTarget: string) => {
    if (!isAdmin) return;
    try {
      await updateDoc(doc(db, 'activities', id), {
        status: 'approved',
        updatedAt: Date.now()
      });
      await addDoc(collection(db, 'notifications'), {
        title: 'Hoạt động được phê duyệt',
        message: `Hoạt động "${actName}" đã được duyệt.`,
        targetAudience: actTarget,
        createdAt: Date.now()
      });
      fetchActivities();
    } catch (err) {
      console.error(err);
    }
  };

  const sendNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notificationMsg || !isAdmin) return;
    try {
      await addDoc(collection(db, 'notifications'), {
        title: 'Thông báo từ Ban Chấp hành Đoàn khoa',
        message: notificationMsg,
        targetAudience: notificationTarget,
        createdAt: Date.now()
      });
      setNotificationMsg('');
      alert("Đã gửi thông báo!");
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !newUsername) return;
    
    setCreatingAccount(true);
    try {
      if (newRole === 'doanvien') {
        const cleanUname = newUsername.trim();
        const docRef = doc(db, 'users', `profile_${cleanUname.toLowerCase()}`);
        await setDoc(docRef, {
          username: cleanUname,
          mssv: cleanUname,
          email: `${cleanUname}@student.hcmus.edu.vn`,
          name: newName.trim(),
          role: 'doanvien',
          branch: newBranch.trim(),
          createdAt: Date.now()
        }, { merge: true });
        alert(`Đã tạo hồ sơ Đoàn viên cho ${newName} (${cleanUname}).\nĐoàn viên sẽ tự đăng nhập bằng Google!`);
      } else if (newRole === 'chidoan') {
        const rawUname = newUsername.trim().toLowerCase();
        const username = rawUname.endsWith('.fetel') ? rawUname : `${rawUname}.fetel`;
        const authEmail = `${username}@chidoan.fetel`;
        
        const secondaryApp = initializeApp(firebaseConfig, "SecondaryAppInstance");
        const secondaryAuth = getAuth(secondaryApp);
        const userCred = await createUserWithEmailAndPassword(secondaryAuth, authEmail, "Abc@123");
        await signOut(secondaryAuth);

        await setDoc(doc(db, 'users', userCred.user.uid), {
          email: '',
          authEmail: authEmail,
          username: username,
          name: newName.trim() || `Chi đoàn ${newBranch}`,
          role: 'chidoan',
          branch: newBranch.trim(),
          createdAt: Date.now()
        });
        alert(`Tạo tài khoản Chi đoàn thành công!\nTên đăng nhập: ${username}\nMật khẩu: Abc@123`);
      } else {
        const rawUname = newUsername.trim().toLowerCase();
        const authEmail = rawUname.includes('@') ? rawUname : `${rawUname}@chidoan.fetel`;
        const secondaryApp = initializeApp(firebaseConfig, "SecondaryAppInstance");
        const secondaryAuth = getAuth(secondaryApp);
        const userCred = await createUserWithEmailAndPassword(secondaryAuth, authEmail, "Abc@123");
        await signOut(secondaryAuth);

        await setDoc(doc(db, 'users', userCred.user.uid), {
          email: authEmail,
          username: rawUname,
          name: newName.trim() || 'Admin',
          role: 'admin',
          branch: newBranch.trim() || 'Đoàn khoa ĐTVT',
          createdAt: Date.now()
        });
        alert(`Tạo tài khoản Admin thành công!\nTên đăng nhập: ${rawUname}\nMật khẩu: Abc@123`);
      }
      setNewUsername('');
      setNewName('');
      setNewBranch('');
      fetchUsers();
    } catch (err: any) {
      alert(err.message || 'Lỗi tạo tài khoản');
    } finally {
      setCreatingAccount(false);
    }
  };

  const updateEvidence = async (id: string, currentLink?: string) => {
    const link = window.prompt("Nhập URL link Drive minh chứng:", currentLink || "");
    if (link === null) return;
    try {
      await updateDoc(doc(db, 'activities', id), {
        evidenceLink: link,
        updatedAt: Date.now()
      });
      fetchActivities();
    } catch (err) {
      console.error(err);
    }
  };

  const RequestTimeEdit = async (id: string) => {
    if (!isBranch) return;
    const newStartStr = window.prompt("Nhập thời gian bắt đầu mới (YYYY-MM-DDTHH:mm):");
    if (!newStartStr) return;
    const newEndStr = window.prompt("Nhập thời gian kết thúc mới (YYYY-MM-DDTHH:mm):");
    if (!newEndStr) return;
    
    try {
      const startMs = new Date(newStartStr).getTime();
      const endMs = new Date(newEndStr).getTime();
      
      await updateDoc(doc(db, 'activities', id), {
        startTime: startMs || Date.now(),
        endTime: endMs || (Date.now() + 86400000),
        status: 'pending',
        updatedAt: Date.now()
      });
      fetchActivities();
      alert("Đã gửi yêu cầu phê duyệt thời gian mới.");
    } catch (err) {
      console.error(err);
    }
  };

  const downloadXlsxTemplate = () => {
    const csvContent = "STT,NH,HK,Mand,MSSV,Họ tên,Tenhd,Thành tích (ghi rõ giải đạt được),Khen thưởng (ghi rõ cấp khen thưởng),Điểm,Ghi chú\n1,25-26,1,3.5,21120000,Nguyen Van A,Chao mung... 20/10,,,,5,\n";
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "Mau_Danh_Sach_Tham_Gia.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadAccountTemplate = () => {
    const csvContent = "kiem_tra,Tên đăng nhập / MSSV,Họ và tên,Vai trò,Tên đơn vị\n,21120000,Nguyễn Văn A,doanvien,Chi đoàn 21KTPM\n,chidoan1,Bí thư chi đoàn 1,chidoan,Chi đoàn 1\n";
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "Mau_Danh_Sach_Tai_Khoan.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleBulkImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !isAdmin) return;
    
    setCreatingAccount(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async function(results) {
        const rows = results.data as any[];
        let count = 0;
        
        try {
           const secondaryApp = initializeApp(firebaseConfig, "SecondaryAppInstanceBulk");
           const secondaryAuth = getAuth(secondaryApp);

           for (const row of rows) {
             let usernameStr = row['Tên đăng nhập / MSSV']?.toString().trim();
             if (!usernameStr) continue;

             const newNameStr = row['Họ và tên']?.toString().trim() || 'No Name';
             const newRoleStr = row['Vai trò']?.toString().trim() || 'doanvien';
             const newBranchStr = row['Tên đơn vị']?.toString().trim() || '';

             if (newRoleStr === 'doanvien') {
               const docRef = doc(db, 'users', `profile_${usernameStr.toLowerCase()}`);
               await setDoc(docRef, {
                 username: usernameStr,
                 mssv: usernameStr,
                 email: `${usernameStr}@student.hcmus.edu.vn`,
                 name: newNameStr,
                 role: 'doanvien',
                 branch: newBranchStr,
                 createdAt: Date.now()
               }, { merge: true });
               count++;
             } else if (newRoleStr === 'chidoan') {
               const rawU = usernameStr.toLowerCase();
               const uname = rawU.endsWith('.fetel') ? rawU : `${rawU}.fetel`;
               const authEmail = `${uname}@chidoan.fetel`;
               try {
                 const userCred = await createUserWithEmailAndPassword(secondaryAuth, authEmail, "Abc@123");
                 await setDoc(doc(db, 'users', userCred.user.uid), {
                   email: '',
                   authEmail: authEmail,
                   username: uname,
                   name: newNameStr,
                   role: 'chidoan',
                   branch: newBranchStr,
                   createdAt: Date.now()
                 });
                 count++;
               } catch (err) {
                 console.error("Lỗi tạo chi đoàn:", uname, err);
               }
             }
           }
           await signOut(secondaryAuth);
           alert(`Đã tạo thành công ${count} tài khoản!`);
           fetchUsers();
        } catch (e) {
           console.error(e);
           alert("Lỗi import.");
        } finally {
           setCreatingAccount(false);
           if (e.target) e.target.value = '';
        }
      }
    });
  };

  const handleEditUser = (u: any) => {
    setEditingUserInfo(u);
    setUserEditForm({
      name: u.name || '',
      mssv: u.mssv || u.username || '',
      branch: u.branch || currentUser?.branch || '',
      email: u.email || '',
      username: u.username || u.mssv || '',
      role: u.role || 'doanvien'
    });
  };

  const handleSaveUserInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUserInfo) return;

    try {
      const updates: any = {
        name: userEditForm.name.trim(),
        mssv: userEditForm.mssv.trim(),
        branch: userEditForm.branch.trim(),
        email: userEditForm.email.trim(),
        updatedAt: Date.now()
      };
      if (userEditForm.username.trim()) {
        updates.username = userEditForm.username.trim();
      }
      if (isAdmin && userEditForm.role) {
        updates.role = userEditForm.role;
      }

      await updateDoc(doc(db, 'users', editingUserInfo.id), updates);
      setUsersList(prev => prev.map(u => u.id === editingUserInfo.id ? { ...u, ...updates } : u));
      setEditingUserInfo(null);
      alert("Cập nhật thông tin đoàn viên thành công!");
    } catch (err) {
      console.error(err);
      alert("Có lỗi khi lưu thông tin đoàn viên.");
    }
  };

  const handleDeleteUser = async (u: any) => {
    const nameStr = u.name || u.email || u.username || u.id;
    if (!window.confirm(`Bạn có chắc chắn muốn XÓA VĨNH VIỄN tài khoản "${nameStr}" (ID: ${u.id})?`)) return;
    try {
      await deleteDoc(doc(db, 'users', u.id));
      setUsersList(prev => prev.filter(item => item.id !== u.id));
      alert(`Đã xóa tài khoản "${nameStr}" thành công.`);
    } catch (e) {
      console.error(e);
      alert("Lỗi khi xóa tài khoản.");
    }
  };

  const handleOpenBchEdit = (u: any) => {
    setEditingBchUser(u);
    setBchModalTab('doankhoa');
    setBchForm({
      committeeRole: u.committeeRole || '',
      branchRole: u.branchRole || (u.committeeRole && u.committeeRole.toLowerCase().includes('chi đoàn') ? u.committeeRole : ''),
      committeePeriod: u.committeePeriod || '2026-2027',
      committeeTerm: u.committeeTerm || '2025-2027',
      branchTerm: u.branchTerm || u.committeePeriod || '2026-2027',
      avatar: u.avatar || ''
    });
  };

  const handleSaveBchUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBchUser) return;
    
    let updates: any = {};
    const commRole = bchForm.committeeRole.trim();
    const brRole = bchForm.branchRole.trim();

    updates.committeeRole = commRole || null;
    updates.branchRole = brRole || null;

    if (!commRole && !brRole) {
       updates.committeePeriod = null;
       updates.committeeTerm = null;
       updates.branchTerm = null;
    } else {
       updates.committeePeriod = bchForm.committeePeriod.trim();
       updates.committeeTerm = bchForm.committeeTerm.trim();
       updates.branchTerm = bchForm.branchTerm.trim();
       if (bchForm.avatar.trim() !== '') {
          updates.avatar = bchForm.avatar.trim();
       } else {
          updates.avatar = null;
       }
    }
    
    try {
      await updateDoc(doc(db, 'users', editingBchUser.id), updates);
      setEditingBchUser(null);
      fetchUsers();
      alert("Cập nhật chức vụ thành công!");
    } catch(e) {
      console.error(e);
      alert("Lỗi cập nhật chức vụ");
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="bg-slate-900 text-white p-6 pt-10 shrink-0">
        <h2 className="text-lg font-bold">Quản lý Đoàn</h2>
        <p className="text-[10px] opacity-70">
          {isAdmin 
            ? 'Duyệt hoạt động, gửi thông báo, quản lý Chi đoàn và tài khoản' 
            : isBranch 
              ? `Quản lý đoàn viên & Ban Chấp hành Chi đoàn ${currentUser?.branch || ''}` 
              : 'Tạo hoạt động và báo cáo minh chứng'}
        </p>
        
        {(isAdmin || isBranch) && (
          <div className="mt-4 flex gap-2 border-b border-slate-700/50 pb-[-1px] overflow-x-auto no-scrollbar">
            <button 
              onClick={() => setActiveTab('activities')}
              className={`pb-2 shrink-0 text-xs font-bold uppercase tracking-wide border-b-2 transition ${activeTab === 'activities' ? 'border-white text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
            >
              Hoạt động
            </button>
            {isAdmin && (
              <button 
                onClick={() => setActiveTab('branches')}
                className={`pb-2 shrink-0 text-xs font-bold uppercase tracking-wide border-b-2 transition ${activeTab === 'branches' ? 'border-white text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
              >
                Chi Đoàn
              </button>
            )}
            <button 
              onClick={() => setActiveTab('users')}
              className={`pb-2 shrink-0 text-xs font-bold uppercase tracking-wide border-b-2 transition ${activeTab === 'users' ? 'border-white text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
            >
              {isBranch ? 'Đoàn viên Chi đoàn' : 'Tài khoản'}
            </button>
            <button 
              onClick={() => setActiveTab('bch')}
              className={`pb-2 shrink-0 text-xs font-bold uppercase tracking-wide border-b-2 transition ${activeTab === 'bch' ? 'border-white text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
            >
              {isBranch ? 'BCH Chi đoàn' : 'Ban Chấp hành'}
            </button>
            {isAdmin && (
              <button 
                onClick={() => setActiveTab('handbook')}
                className={`pb-2 shrink-0 text-xs font-bold uppercase tracking-wide border-b-2 transition ${activeTab === 'handbook' ? 'border-white text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
              >
                Sổ tay ĐV
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 p-4 space-y-4 overflow-y-auto pb-10">
        
        {activeTab === 'activities' && (
          <>
        {isAdmin && (
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
            <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center">
              <Bell size={16} className="mr-1.5 text-blue-600"/> Gửi thông báo
            </h3>
            <form onSubmit={sendNotification} className="space-y-2">
              <textarea 
                className="w-full text-sm p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none" 
                placeholder="Nội dung thông báo..." rows={2}
                value={notificationMsg} onChange={e => setNotificationMsg(e.target.value)} required 
              />
              <div className="flex gap-2">
                <select 
                  className="flex-1 text-sm p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none"
                  value={notificationTarget} onChange={e => setNotificationTarget(e.target.value)}
                >
                  <option value="all">Tất cả Đoàn viên</option>
                  <option value="chidoan">Tất cả Chi đoàn</option>
                </select>
                <button type="submit" className="bg-blue-600 text-white px-4 rounded-lg font-bold text-xs">GỬI</button>
              </div>
            </form>
          </div>
        )}

        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center">
            <PlusCircle size={16} className="mr-1.5 text-blue-600"/>
            Tạo đề xuất hoạt động
          </h3>
          <form onSubmit={handleAdd} className="space-y-3">
            <input 
              type="text" placeholder="Tên hoạt động" 
              className="w-full text-sm p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none"
              value={name} onChange={e => setName(e.target.value)} required
            />
            
            <div className="flex gap-2">
               <div className="w-1/2">
                  <label className="text-[10px] font-semibold text-slate-500 uppercase ml-1 block mb-1">Học kỳ</label>
                  <select className="w-full text-sm p-2 bg-slate-50 border border-slate-200 rounded-lg" value={semester} onChange={e => setSemester(Number(e.target.value))}>
                    <option value={1}>Học kỳ 1</option>
                    <option value={2}>Học kỳ 2</option>
                    <option value={3}>Học kỳ hè</option>
                  </select>
               </div>
               <div className="w-1/2">
                  <label className="text-[10px] font-semibold text-slate-500 uppercase ml-1 block mb-1">Năm học</label>
                  <input type="text" className="w-full text-sm p-2 bg-slate-50 border border-slate-200 rounded-lg" value={academicYear} onChange={e => setAcademicYear(e.target.value)} placeholder="VD: 2026-2027" required />
               </div>
            </div>

            <div className="flex gap-2">
              <div className="w-1/2">
                <label className="text-[10px] font-semibold text-slate-500 uppercase ml-1 block">Bắt đầu</label>
                <input type="date" className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg" value={startTimeStr} onChange={e => setStartTimeStr(e.target.value)} required />
              </div>
              <div className="w-1/2">
                <label className="text-[10px] font-semibold text-slate-500 uppercase ml-1 block">Kết thúc</label>
                <input type="date" className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg" value={endTimeStr} onChange={e => setEndTimeStr(e.target.value)} required />
              </div>
            </div>
            
            <div className="flex gap-2">
              <div className="w-1/2">
                <label className="text-[10px] font-semibold text-slate-500 uppercase ml-1 block">ĐRL Tham gia</label>
                <input type="number" className="w-full text-sm p-2 bg-slate-50 border border-slate-200 rounded-lg" value={pointsParticipant} onChange={e => setPointsParticipant(Number(e.target.value))} min={1} required />
              </div>
              <div className="w-1/2">
                <label className="text-[10px] font-semibold text-slate-500 uppercase ml-1 block">ĐRL Tổ chức</label>
                <input type="number" className="w-full text-sm p-2 bg-slate-50 border border-slate-200 rounded-lg" value={pointsOrganizer} onChange={e => setPointsOrganizer(Number(e.target.value))} min={1} required />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase ml-1 block mb-1">Mục / Tiêu chí ĐRL</label>
              <select className="w-full text-sm p-2 bg-slate-50 border border-slate-200 rounded-lg font-medium" value={drlCategory} onChange={e => setDrlCategory(e.target.value)}>
                <option value="Mục 1: Trách nhiệm chấp hành pháp luật và nội quy, quy chế của nhà trường">Mục 1: Trách nhiệm chấp hành pháp luật và nội quy, quy chế của nhà trường</option>
                <option value="Mục 3: Trách nhiệm tham gia các hoạt động chính trị, xã hội, văn hóa, văn nghệ, thể thao, phòng chống tội phạm, tệ nạn xã hội">Mục 3: Trách nhiệm tham gia các hoạt động chính trị, xã hội, văn hóa, văn nghệ, thể thao, phòng chống tội phạm, tệ nạn xã hội</option>
                <option value="Mục 4: Trách nhiệm công dân trong quan hệ cộng đồng">Mục 4: Trách nhiệm công dân trong quan hệ cộng đồng</option>
              </select>
            </div>

            {isBranch && (
              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase ml-1 block mb-1">Link Kế hoạch (Drive)</label>
                <input type="url" placeholder="https://drive.google.com/..." className="w-full text-sm p-2 bg-slate-50 border border-slate-200 rounded-lg" value={planLink} onChange={e => setPlanLink(e.target.value)} required={isBranch} />
              </div>
            )}
            
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase ml-1 block mb-1">Nội dung hoạt động</label>
              <textarea placeholder="Mô tả chi tiết nội dung hoạt động..." rows={3} className="w-full text-sm p-2 bg-slate-50 border border-slate-200 rounded-lg" value={description} onChange={e => setDescription(e.target.value)}></textarea>
            </div>

            <div>
               <label className="text-[10px] font-semibold text-slate-500 uppercase ml-1 block mb-1">File đính kèm (Ảnh jpg, png)</label>
               <div className="flex items-center gap-2">
                 <label className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-bold cursor-pointer transition flex items-center shrink-0">
                   <Upload size={14} className="mr-2" /> Chọn File Ảnh
                   <input type="file" accept=".jpg,.png,.jpeg" className="hidden" onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          setImageUrl(ev.target?.result as string);
                        };
                        reader.readAsDataURL(file);
                      }
                   }} />
                 </label>
                 {imageUrl ? (
                   <div className="text-[10px] text-slate-500 font-medium">Đã tải ảnh lên</div>
                 ) : (
                   <div className="text-[10px] text-slate-400 italic">Chưa có ảnh</div>
                 )}
               </div>
               {imageUrl && <img src={imageUrl} alt="preview" className="mt-2 h-20 rounded shadow-sm object-cover border border-slate-200" />}
            </div>

            {isBranch && (
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-3">
                 <label className="text-[10px] font-bold text-slate-800 uppercase block">Thành viên ban tổ chức</label>
                 <div className="flex gap-2">
                   <input type="text" placeholder="Tìm theo MSSV..." className="flex-1 text-sm p-2 border border-slate-200 rounded-lg focus:outline-none" value={searchMssv} onChange={e => setSearchMssv(e.target.value)} />
                   <select className="w-1/3 text-xs p-2 border border-slate-200 rounded-lg focus:outline-none" value={selectedRole} onChange={e => setSelectedRole(e.target.value)}>
                     <option value="Trưởng ban">Trưởng ban</option>
                     {isCooperating && <option value="Đồng Trưởng ban">Đồng Trưởng ban</option>}
                     <option value="Phó Trưởng ban">Phó Trưởng ban</option>
                     <option value="Thành viên">Thành viên</option>
                   </select>
                   <button type="button" onClick={() => {
                      if (!searchMssv.trim()) return;
                      const user = usersList.find(u => u.mssv === searchMssv.trim() && u.role === 'doanvien');
                      if (!user) return alert('Không tìm thấy sinh viên với MSSV này');
                      if (organizerDetails.some(o => o.mssv === user.mssv)) return alert('Sinh viên này đã có trong danh sách');
                      setOrganizerDetails([...organizerDetails, { mssv: user.mssv, name: user.name, role: selectedRole }]);
                      setSearchMssv('');
                   }} className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 rounded-lg text-xs font-bold transition">THÊM</button>
                 </div>
                 
                 {organizerDetails.length > 0 && (
                   <ul className="space-y-2 mt-2">
                     {organizerDetails.map((org, idx) => (
                        <li key={idx} className="flex justify-between items-center bg-white p-2 border border-slate-100 rounded-lg shadow-sm">
                           <div className="text-xs">
                              <span className="font-bold text-slate-800">{org.name}</span>
                              <span className="text-slate-500 ml-2">({org.mssv})</span>
                              <span className="block text-[10px] text-blue-600 font-semibold mt-0.5">{org.role}</span>
                           </div>
                           <button type="button" onClick={() => setOrganizerDetails(organizerDetails.filter((_, i) => i !== idx))} className="text-red-500 hover:text-red-700 p-1">
                             <Trash2 size={14} />
                           </button>
                        </li>
                     ))}
                   </ul>
                 )}

                 <div className="pt-2 border-t border-slate-200">
                    <label className="flex items-center text-xs font-medium text-slate-700 cursor-pointer">
                      <input type="checkbox" className="mr-2 rounded text-blue-600 focus:ring-blue-500 h-4 w-4" checked={isCooperating} onChange={e => setIsCooperating(e.target.checked)} />
                      Phối hợp hoạt động với Chi đoàn / Đơn vị khác
                    </label>
                 </div>

                 {isCooperating && (
                    <div className="space-y-3 pt-2">
                       <div>
                         <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1.5">Chọn các Chi đoàn phối hợp</label>
                         <div className="grid grid-cols-2 gap-2">
                           {usersList.filter(u => u.role === 'chidoan' && u.branch !== currentUser?.branch).map(branchUser => (
                              <label key={branchUser.id} className="flex items-center text-xs text-slate-700 cursor-pointer">
                                 <input type="checkbox" className="mr-1.5 rounded text-blue-600 h-3.5 w-3.5" checked={cooperatingBranches.includes(branchUser.branch)} onChange={e => {
                                   if (e.target.checked) setCooperatingBranches([...cooperatingBranches, branchUser.branch]);
                                   else setCooperatingBranches(cooperatingBranches.filter(b => b !== branchUser.branch));
                                 }} />
                                 <span className="truncate" title={branchUser.name}>{branchUser.name}</span>
                              </label>
                           ))}
                           {usersList.filter(u => u.role === 'chidoan' && u.branch !== currentUser?.branch).length === 0 && (
                             <span className="text-xs text-slate-400 italic">Không có chi đoàn nào khác.</span>
                           )}
                         </div>
                       </div>
                       
                       <div>
                         <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1">Các đơn vị ngoài (tự điền, cách nhau bởi dấu phẩy)</label>
                         <input type="text" placeholder="VD: Doanh nghiệp XYZ, CLB Sinh viên..." className="w-full text-sm p-2 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500" value={otherCooperators} onChange={e => setOtherCooperators(e.target.value)} />
                       </div>
                    </div>
                 )}
              </div>
            )}

            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase ml-1">Đối tượng</label>
              <select className="w-full text-sm p-2 bg-slate-50 border border-slate-200 rounded-lg" value={targetAudience} onChange={e => setTargetAudience(e.target.value)}>
                {isAdmin ? (
                  <>
                    <option value="all">Tất cả</option>
                    <option value="chi_doan_1">Chi đoàn 1</option>
                  </>
                ) : (
                  <>
                    <option value="all">Toàn khoa</option>
                    <option value={currentUser?.branch || 'branch'}>Nội bộ</option>
                  </>
                )}
              </select>
            </div>
            
            <div className="flex justify-between items-center mt-2">
              <button type="button" onClick={downloadXlsxTemplate} className="text-[10px] text-emerald-600 font-bold flex items-center border border-emerald-200 bg-emerald-50 px-2 py-1 rounded">
                <FileSpreadsheet size={12} className="mr-1" /> Tải mẫu Danh sách
              </button>
            </div>

            <button type="submit" className="w-full bg-[#1d4ed8] text-white font-bold text-xs py-2.5 rounded-lg hover:bg-blue-800">
               {isAdmin ? 'TẠO HOẠT ĐỘNG' : 'GỬI DUYỆT HOẠT ĐỘNG'}
            </button>
          </form>
        </div>

        <div>
           <h3 className="text-sm font-bold text-slate-800 mb-2">Danh sách hoạt động</h3>
           {loading ? (
             <p className="text-xs text-slate-500 text-center py-4">Đang tải...</p>
           ) : activities.length === 0 ? (
             <p className="text-xs text-slate-500 text-center py-4 bg-white rounded-xl border border-dashed border-slate-300">Chưa có hoạt động</p>
           ) : (
             <div className="space-y-3">
               {activities.map(act => {
                 const isOverdue = Date.now() > act.endTime;
                 const needsEvidence = isBranch && isOverdue && !act.evidenceLink && act.status === 'approved';
                 const overdueDays = isOverdue ? Math.floor((Date.now() - act.endTime) / 86400000) : 0;
                 const warning = needsEvidence && overdueDays > 3;

                 return (
                 <div key={act.id} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
                   <div className={`absolute top-0 right-0 px-2 py-0.5 text-[9px] font-bold uppercase rounded-bl-lg text-white ${act.status === 'approved' ? 'bg-emerald-500' : act.status === 'rejected' ? 'bg-red-500' : 'bg-orange-500'}`}>
                     {act.status}
                   </div>
                   
                   <div className="pr-16">
                     <h4 className="text-xs font-bold text-slate-800 mb-1 leading-tight">{act.name}</h4>
                     <p className="text-[9px] text-slate-500 font-semibold mb-0.5">HK{act.semester} - {act.academicYear}</p>
                     <p className="text-[9px] text-slate-500 mb-0.5">Bắt đầu: {new Date(act.startTime).toLocaleDateString('vi-VN')}</p>
                     <p className="text-[9px] text-slate-500 mb-1">Kết thúc: {new Date(act.endTime).toLocaleDateString('vi-VN')}</p>
                     <div className="flex gap-2 text-[9px] mb-2 font-medium">
                       <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">TG: +{act.pointsParticipant}đ</span>
                       <span className="bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded">BTC: +{act.pointsOrganizer}đ</span>
                       <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{act.targetAudience === 'all' ? 'Toàn khoa' : 'Nội bộ'}</span>
                     </div>
                     {act.planLink && (
                       <a href={act.planLink} target="_blank" rel="noreferrer" className="text-[10px] text-blue-600 underline truncate block max-w-[200px] mb-2">Xem kế hoạch</a>
                     )}
                   </div>

                   {warning && (
                     <div className="bg-red-50 text-red-600 text-[9px] font-semibold px-2 py-1 rounded border border-red-200 mb-2">
                        ⚠️ Quá hạn nộp minh chứng {overdueDays} ngày! Đoàn khoa đã nhận được thông báo.
                     </div>
                   )}
                   {needsEvidence && !warning && (
                     <div className="bg-orange-50 text-orange-600 text-[9px] font-semibold px-2 py-1 rounded border border-orange-200 mb-2">
                        ⚠️ Cần nộp minh chứng (Hạn chót: 3 ngày sau kết thúc).
                     </div>
                   )}

                   <div className="flex justify-between items-center border-t border-slate-100 mt-2 pt-2 gap-2">
                      <div className="flex flex-wrap gap-2">
                        {isAdmin && act.status === 'pending' && (
                          <button onClick={() => handleApprove(act.id, act.name, act.targetAudience)} className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-[10px] font-bold flex items-center">
                            <Check size={12} className="mr-0.5" /> Duyệt
                          </button>
                        )}
                        {isBranch && (
                          <button onClick={() => RequestTimeEdit(act.id)} className="bg-slate-100 text-slate-700 px-2 py-1 rounded text-[10px] font-bold border border-slate-200">
                             Sửa TG
                          </button>
                        )}
                        {isBranch && act.status === 'approved' && isOverdue && (
                           <button onClick={() => updateEvidence(act.id, act.evidenceLink)} className={`px-2 py-1 rounded text-[10px] font-bold border ${act.evidenceLink ? 'bg-slate-50 text-slate-600 border-slate-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                             {act.evidenceLink ? 'Sửa minh chứng' : '+ Nộp minh chứng'}
                           </button>
                        )}
                        {(isAdmin || act.evidenceLink) && act.evidenceLink && (
                          <a href={act.evidenceLink} target="_blank" rel="noreferrer" className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-1 rounded font-bold border border-indigo-100">
                             Xem minh chứng
                          </a>
                        )}
                      </div>
                      
                      <button onClick={() => handleDelete(act.id)} className="p-1.5 text-red-500 bg-red-50 hover:bg-red-100 rounded-lg shrink-0">
                        <Trash2 size={14} />
                      </button>
                   </div>
                 </div>
                 );
               })}
             </div>
           )}
        </div>
        </>
        )}

        {activeTab === 'branches' && isAdmin && (
          <div className="space-y-4">
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
              <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center">
                <PlusCircle size={16} className="mr-1.5 text-blue-600"/> Thêm Chi đoàn mới
              </h3>
              <p className="text-xs text-slate-500 mb-3">
                Thêm Chi đoàn trực thuộc để sinh viên/Đoàn viên chọn khi cập nhật thông tin ban đầu.
              </p>
              <form onSubmit={handleAddBranch} className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="Tên Chi đoàn (Ví dụ: 27ICD1, 27DTV1...)" 
                  className="flex-1 text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  required
                />
                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg font-bold text-xs shadow transition cursor-pointer shrink-0">
                  THÊM CHI ĐOÀN
                </button>
              </form>
            </div>

            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-bold text-slate-800 flex items-center">
                  <Users size={16} className="mr-1.5 text-blue-600"/> Danh sách Chi đoàn trực thuộc ({branches.length})
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {branches.map((b) => (
                  <div key={b.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex justify-between items-center">
                    {editingBranchId === b.id ? (
                      <div className="flex gap-1 items-center flex-1 mr-2">
                        <input 
                          type="text" 
                          value={editingBranchName} 
                          onChange={(e) => setEditingBranchName(e.target.value)}
                          className="w-full text-xs p-1.5 bg-white border border-slate-300 rounded focus:outline-none"
                        />
                        <button onClick={() => handleUpdateBranch(b.id)} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition">
                          <Check size={16} />
                        </button>
                        <button onClick={() => { setEditingBranchId(null); setEditingBranchName(''); }} className="p-1.5 text-slate-400 hover:bg-slate-200 rounded-lg transition">
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <span className="font-bold text-xs text-slate-800">{b.name}</span>
                    )}

                    {editingBranchId !== b.id && (
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={() => { setEditingBranchId(b.id); setEditingBranchName(b.name); }}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                          title="Chỉnh sửa tên"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button 
                          onClick={() => setDeletingBranch({ id: b.id, name: b.name })}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                          title="Xóa Chi đoàn"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}

                {branches.length === 0 && (
                  <div className="col-span-full text-center py-6 text-slate-400 text-xs italic">
                    Chưa có Chi đoàn nào. Vui lòng thêm Chi đoàn mới.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'users' && (isAdmin || isBranch) && (
          <>
            {isBranch && (
              <div className="bg-blue-50 border border-blue-200 p-3.5 rounded-xl text-blue-900 text-xs flex items-center justify-between mb-3">
                <div>
                  <span className="font-bold">Chi đoàn:</span> <span className="bg-blue-600 text-white font-bold px-2 py-0.5 rounded text-[11px] ml-1">{currentUser?.branch || 'Chưa cập nhật'}</span>
                  <p className="text-[11px] text-blue-700 mt-0.5">Tài khoản Chi đoàn có quyền xem, quản lý và cập nhật chức vụ Ban Chấp hành cho đoàn viên thuộc Chi đoàn mình.</p>
                </div>
              </div>
            )}

            {isAdmin && (
              <>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                  <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center">
                    <Users size={16} className="mr-1.5 text-blue-600"/> Tạo tài khoản mới
                  </h3>
                  <form onSubmit={handleCreateAccount} className="space-y-3">
                     <input 
                       type="text" placeholder="MSSV / Tên đăng nhập" 
                       className="w-full text-sm p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none" 
                       value={newUsername} onChange={e => setNewUsername(e.target.value)} required 
                     />
                     <input 
                       type="text" placeholder="Họ và tên / Tên hiển thị" 
                       className="w-full text-sm p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none" 
                       value={newName} onChange={e => setNewName(e.target.value)} required 
                     />
                     <select 
                       className="w-full text-sm p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none" 
                       value={newRole} onChange={e => setNewRole(e.target.value)}
                     >
                        <option value="chidoan">Bí thư / Quản lý Chi đoàn</option>
                        <option value="doanvien">Đoàn viên</option>
                        <option value="admin">Quản trị viên (Admin)</option>
                     </select>
                     <input 
                       type="text" 
                       list="branch-options"
                       placeholder="Tên đơn vị (Chọn hoặc nhập tên Chi đoàn / Đoàn khoa...)" 
                       className="w-full text-sm p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none" 
                       value={newBranch} 
                       onChange={e => setNewBranch(e.target.value)}
                     />
                     <datalist id="branch-options">
                       <option value="Đoàn khoa ĐTVT" />
                       {branches.map(b => (
                         <option key={b.id} value={b.name} />
                       ))}
                     </datalist>
                     <button 
                       type="submit" disabled={creatingAccount}
                       className="w-full bg-[#1d4ed8] text-white font-bold text-xs py-2.5 rounded-lg hover:bg-blue-800 disabled:opacity-70"
                     >
                       {creatingAccount ? 'ĐANG TẠO...' : 'TẠO TÀI KHOẢN (MẬT KHẨU: 123123)'}
                     </button>
                  </form>
                </div>

                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                  <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center">
                    <Upload size={16} className="mr-1.5 text-blue-600"/> Import Hàng Loạt (CSV)
                  </h3>
                  <p className="text-xs text-slate-500 mb-3">Tải mẫu CSV và dùng đúng định dạng để tạo nhiều tài khoản cùng lúc. Mật khẩu mặc định: <b>123123</b>.</p>
                  
                  <div className="flex gap-2">
                     <button type="button" onClick={downloadAccountTemplate} className="text-[10px] text-emerald-600 font-bold flex items-center border border-emerald-200 bg-emerald-50 px-3 py-2 rounded-lg justify-center flex-1">
                       <FileSpreadsheet size={14} className="mr-1.5" /> Tải mẫu CSV
                     </button>
                     <label className="text-[10px] text-blue-600 font-bold flex items-center border border-blue-200 bg-blue-50 px-3 py-2 rounded-lg cursor-pointer justify-center flex-1">
                       <Upload size={14} className="mr-1.5" /> Upload CSV
                       <input type="file" accept=".csv" className="hidden" onChange={handleBulkImport} disabled={creatingAccount} />
                     </label>
                  </div>
                  {creatingAccount && <div className="text-xs text-center mt-2 text-blue-600 font-medium">Đang tiến hành tạo tài khoản, xin vui lòng đợi...</div>}
                </div>
              </>
            )}

            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <h3 className="text-sm font-bold text-slate-800 flex items-center">
                  <List size={16} className="mr-1.5 text-blue-600"/> 
                  {isBranch ? `Danh sách Đoàn viên Chi đoàn ${currentUser?.branch || ''}` : 'Danh sách tài khoản hệ thống'} ({usersList.filter(isUserInMyBranch).length})
                </h3>
                {isAdmin && selectedBranchFilter && (
                  <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full w-fit">
                    Lớp {selectedBranchFilter}: {usersList.filter(u => (u.branch || '').toLowerCase() === selectedBranchFilter.toLowerCase()).length} tài khoản
                  </span>
                )}
              </div>

              <div className={`grid grid-cols-1 ${isAdmin ? 'sm:grid-cols-2' : ''} gap-2 mb-3`}>
                <input 
                  type="text" 
                  placeholder="Tìm kiếm theo Họ tên, Email, MSSV..." 
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-500"
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                />
                {isAdmin && (
                  <select
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-500 cursor-pointer font-medium text-slate-700"
                    value={selectedBranchFilter}
                    onChange={e => setSelectedBranchFilter(e.target.value)}
                  >
                    <option value="">-- Tất cả Chi đoàn / Lớp --</option>
                    {Array.from(new Set([...branches.map(b => b.name), ...DEFAULT_BRANCHES])).map(b => (
                      <option key={b} value={b}>Chi đoàn {b}</option>
                    ))}
                  </select>
                )}
              </div>

              {loadingUsers ? (
                <p className="text-xs text-center text-slate-500 py-4">Đang tải danh sách tài khoản...</p>
              ) : (
                <div className="space-y-2 max-h-[550px] overflow-y-auto pr-1 no-scrollbar">
                   {usersList
                    .filter((u: any) => {
                      if (!isUserInMyBranch(u)) return false;
                      if (isAdmin && selectedBranchFilter && (u.branch || '').toLowerCase() !== selectedBranchFilter.toLowerCase()) {
                        return false;
                      }
                      const q = userSearch.toLowerCase().trim();
                      if (!q) return true;
                      return (
                        (u.name || '').toLowerCase().includes(q) ||
                        (u.email || '').toLowerCase().includes(q) ||
                        (u.username || '').toLowerCase().includes(q) ||
                        (u.mssv || '').toLowerCase().includes(q) ||
                        (u.branch || '').toLowerCase().includes(q)
                      );
                    })
                    .map((u: any) => (
                      <div key={u.id} className="flex justify-between items-center p-3 bg-slate-50 border border-slate-100 rounded-lg hover:bg-slate-100/80 transition-all">
                         <div>
                            <div className="text-xs font-bold text-slate-800">{u.name || 'Chưa cập nhật tên'} <span className="opacity-70 font-normal">({u.username || u.email || u.id})</span></div>
                            <div className="text-[10px] text-slate-500 mt-1 flex flex-wrap items-center gap-1.5">
                               <span className="font-semibold text-blue-700">{u.role === 'admin' ? 'QTV Khoa' : u.role === 'chidoan' ? 'BCH Chi đoàn' : 'Đoàn viên'}</span>
                               <span>•</span>
                               <span className="bg-slate-200/70 text-slate-700 px-1.5 py-0.5 rounded font-medium">{u.branch || 'Chưa phân lớp'}</span>
                               {u.committeeRole && (
                                 <span className="bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded text-[9px]">{u.committeeRole}</span>
                               )}
                               {u.mssv && (
                                 <>
                                   <span>•</span>
                                   <span>MSSV: {u.mssv}</span>
                                 </>
                               )}
                               {u.email && (
                                 <>
                                   <span>•</span>
                                   <span className="truncate max-w-[180px]">{u.email}</span>
                                 </>
                               )}
                            </div>
                         </div>
                         <div className="flex items-center gap-1.5 shrink-0">
                            <button onClick={() => handleOpenBchEdit(u)} className="p-1.5 text-amber-700 bg-amber-50 hover:bg-amber-100 rounded text-[10px] font-bold flex items-center shrink-0" title="Gán/Cập nhật chức vụ BCH">
                               <Users size={12} className="mr-1" /> Gán BCH
                            </button>
                            <button onClick={() => handleEditUser(u)} className="p-1.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded text-[10px] font-bold flex items-center shrink-0">
                               <Edit2 size={12} className="mr-1" /> Sửa
                            </button>
                            <button onClick={() => handleDeleteUser(u)} className="p-1.5 text-red-600 bg-red-50 hover:bg-red-100 rounded text-[10px] font-bold flex items-center shrink-0">
                               <Trash2 size={12} className="mr-1" /> Xóa
                            </button>
                         </div>
                      </div>
                   ))}
                   {usersList.filter((u: any) => {
                      if (!isUserInMyBranch(u)) return false;
                      if (isAdmin && selectedBranchFilter && (u.branch || '').toLowerCase() !== selectedBranchFilter.toLowerCase()) {
                        return false;
                      }
                      const q = userSearch.toLowerCase().trim();
                      if (!q) return true;
                      return (
                        (u.name || '').toLowerCase().includes(q) ||
                        (u.email || '').toLowerCase().includes(q) ||
                        (u.username || '').toLowerCase().includes(q) ||
                        (u.mssv || '').toLowerCase().includes(q) ||
                        (u.branch || '').toLowerCase().includes(q)
                      );
                    }).length === 0 && (
                      <p className="text-xs text-center text-slate-400 py-6 italic">Không tìm thấy đoàn viên phù hợp.</p>
                   )}
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === 'bch' && (isAdmin || isBranch) && (
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
            <h3 className="text-sm font-bold text-slate-800 mb-1 flex items-center">
              <Users size={16} className="mr-1.5 text-blue-600"/> 
              {isBranch ? `Quản lý Ban Chấp hành Chi đoàn ${currentUser?.branch || ''}` : 'Quản lý Ban Chấp hành'}
            </h3>
            <p className="text-xs text-slate-500 mb-3">
              {isBranch 
                ? 'Nhấn "Cập nhật" hoặc "Gán BCH" để gán chức danh Bí thư Chi đoàn, Phó Bí thư Chi đoàn hoặc Ủy viên BCH Chi đoàn cho đoàn viên.' 
                : 'Nhấn vào "Cập nhật chức vụ" để gán chức danh cho bất kỳ tài khoản nào. Những tài khoản có chức danh sẽ hiện ở trang chủ.'}
            </p>
            {loadingUsers ? (
              <p className="text-xs text-center text-slate-500">Đang tải...</p>
            ) : (
              <div className="space-y-4 text-xs">
                 <input 
                   type="text" 
                   placeholder="Tìm kiếm theo Tên, Email hoặc MSSV..." 
                   className="w-full text-sm p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none mb-2"
                   value={searchBch}
                   onChange={e => setSearchBch(e.target.value)}
                 />
                 <div className="space-y-2">
                    <h4 className="font-bold text-slate-700">Đang là thành viên BCH {isBranch ? `Chi đoàn ${currentUser?.branch || ''}` : ''}:</h4>
                    {usersList.filter(u => {
                       if (!isUserInMyBranch(u)) return false;
                       if (!u.committeeRole) return false;
                       const q = searchBch.toLowerCase().trim();
                       if (!q) return true;
                       return (
                         (u.name || '').toLowerCase().includes(q) ||
                         (u.email || '').toLowerCase().includes(q) ||
                         (u.username || '').toLowerCase().includes(q) ||
                         (u.mssv || '').toLowerCase().includes(q)
                       );
                    }).length === 0 ? (
                       <p className="text-[10px] text-slate-400 italic">Chưa có thành viên BCH nào hoặc không khớp kết quả tìm kiếm.</p>
                    ) : (
                       usersList.filter(u => {
                          if (!isUserInMyBranch(u)) return false;
                          if (!u.committeeRole) return false;
                          const q = searchBch.toLowerCase().trim();
                          if (!q) return true;
                          return (
                            (u.name || '').toLowerCase().includes(q) ||
                            (u.email || '').toLowerCase().includes(q) ||
                            (u.username || '').toLowerCase().includes(q) ||
                            (u.mssv || '').toLowerCase().includes(q)
                          );
                       }).map((u: any) => (
                          <div key={u.id} className="flex justify-between items-center p-3 bg-blue-50 border border-blue-100 rounded-lg">
                             <div className="flex items-center space-x-3">
                                <img src={u.avatar || "https://upload.wikimedia.org/wikipedia/vi/thumb/9/90/Huy_Hi%E1%BB%87u_%C4%90o%C3%A0n.png/1200px-Huy_Hi%E1%BB%87u_%C4%90o%C3%A0n.png"} alt="avatar" className="w-8 h-8 rounded-full border border-slate-200 object-cover" />
                                <div>
                                   <div className="font-bold text-slate-800">{u.name} <span className="text-[10px] font-normal text-slate-500">({u.email || u.username})</span></div>
                                   <div className="text-[10px] text-slate-500 mt-0.5">
                                      {u.committeeRole} • NK {u.committeeTerm || '2025-2027'}
                                   </div>
                                </div>
                             </div>
                             <div className="flex items-center gap-1.5">
                                <button onClick={() => handleOpenBchEdit(u)} className="p-1.5 text-blue-600 bg-white hover:bg-blue-100 rounded text-[10px] font-bold flex items-center shrink-0">
                                   <Edit2 size={12} className="mr-1" /> Cập nhật
                                </button>
                                <button onClick={() => handleDeleteUser(u)} className="p-1.5 text-red-600 bg-red-50 hover:bg-red-100 rounded text-[10px] font-bold flex items-center shrink-0">
                                   <Trash2 size={12} className="mr-1" /> Xóa
                                </button>
                             </div>
                          </div>
                       ))
                    )}
                 </div>

                 <div className="space-y-2 mt-4 pt-4 border-t border-slate-100">
                    <h4 className="font-bold text-slate-700">Đoàn viên khác (chọn để gán vào BCH {isBranch ? `Chi đoàn ${currentUser?.branch || ''}` : ''}):</h4>
                    <div className="max-h-60 overflow-y-auto space-y-2 pr-1 no-scrollbar">
                       {usersList.filter(u => {
                          if (!isUserInMyBranch(u)) return false;
                          if (u.committeeRole) return false;
                          const q = searchBch.toLowerCase().trim();
                          if (!q) return true;
                          return (
                            (u.name || '').toLowerCase().includes(q) ||
                            (u.email || '').toLowerCase().includes(q) ||
                            (u.username || '').toLowerCase().includes(q) ||
                            (u.mssv || '').toLowerCase().includes(q)
                          );
                       }).map((u: any) => (
                          <div key={u.id} className="flex justify-between items-center p-2 bg-slate-50 border border-slate-100 rounded-lg">
                             <div>
                                <div className="font-bold text-slate-800 text-[11px]">{u.name} <span className="font-normal opacity-70">({u.email || u.username})</span></div>
                                <div className="text-[9px] text-slate-500 mt-0.5">{u.branch || 'Chưa cập nhật đơn vị'}</div>
                             </div>
                             <div className="flex items-center gap-1">
                                <button onClick={() => handleOpenBchEdit(u)} className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[9px] font-bold">
                                   + Thêm vào BCH
                                </button>
                                <button onClick={() => handleDeleteUser(u)} className="p-1 text-red-600 hover:bg-red-50 rounded" title="Xóa tài khoản">
                                   <Trash2 size={12} />
                                </button>
                             </div>
                          </div>
                       ))}
                    </div>
                 </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'handbook' && isAdmin && (
          <>
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
              <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center">
                <List size={16} className="mr-1.5 text-blue-600"/> 
                {editingTopicId ? 'Cập nhật chủ đề' : 'Thêm chủ đề mới'}
              </h3>
              <form onSubmit={handleSaveTopic} className="space-y-3">
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase ml-1">Tiêu đề</label>
                  <input type="text" required placeholder="Nhập tiêu đề..." className="w-full text-sm p-2 bg-slate-50 border border-slate-200 rounded-lg" value={topicTitle} onChange={e => setTopicTitle(e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase ml-1">Nội dung</label>
                  <textarea required placeholder="Nhập nội dung sổ tay..." rows={5} className="w-full text-sm p-2 bg-slate-50 border border-slate-200 rounded-lg" value={topicContent} onChange={e => setTopicContent(e.target.value)}></textarea>
                </div>
                <div className="flex gap-2">
                  <button type="submit" className="w-full bg-[#1d4ed8] text-white p-3 rounded-lg font-bold text-xs uppercase cursor-pointer hover:bg-blue-800 transition">
                    {editingTopicId ? 'Lưu cập nhật' : 'Thêm chủ đề'}
                  </button>
                  {editingTopicId && (
                    <button type="button" onClick={() => {setEditingTopicId(null); setTopicTitle(''); setTopicContent('');}} className="w-full bg-slate-200 text-slate-700 p-3 rounded-lg font-bold text-xs uppercase cursor-pointer hover:bg-slate-300 transition">
                      Hủy bỏ
                    </button>
                  )}
                </div>
              </form>
            </div>

            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
              <h3 className="text-sm font-bold text-slate-800 mb-3">Danh sách chủ đề (${handbookTopics.length})</h3>
              <div className="space-y-2">
                {handbookTopics.map(topic => (
                  <div key={topic.id} className="p-3 bg-slate-50 border border-slate-100 rounded-lg flex justify-between items-center">
                    <div className="flex-1 pr-2">
                      <div className="text-xs font-bold text-slate-800">{topic.title}</div>
                      <div className="text-[10px] text-slate-500 line-clamp-2 mt-1 whitespace-pre-wrap">{topic.content}</div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => handleEditTopic(topic)} className="p-1.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg" title="Sửa">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => handleDeleteTopic(topic.id)} className="p-1.5 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg" title="Xóa">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
                {handbookTopics.length === 0 && (
                  <p className="text-xs text-slate-500 italic text-center py-4">Chưa có chủ đề nào.</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {editingBchUser && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-3">
              <div>
                <h3 className="font-bold text-base text-slate-800">Cập nhật chức vụ BCH</h3>
                <p className="text-xs text-slate-500">{editingBchUser.name} - {editingBchUser.branch}</p>
              </div>
              <button type="button" onClick={() => setEditingBchUser(null)} className="text-slate-400 hover:text-slate-600 font-bold text-sm">✕</button>
            </div>

            {/* Modal Navigation Tabs */}
            <div className="flex border-b border-slate-200 mb-3.5 text-xs font-bold">
              <button
                type="button"
                onClick={() => setBchModalTab('doankhoa')}
                className={`flex-1 py-2 text-center border-b-2 transition ${
                  bchModalTab === 'doankhoa'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                Cấp Đoàn khoa / LCH
              </button>
              <button
                type="button"
                onClick={() => setBchModalTab('chidoan')}
                className={`flex-1 py-2 text-center border-b-2 transition ${
                  bchModalTab === 'chidoan'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                Cấp Chi đoàn
              </button>
            </div>

            <form onSubmit={handleSaveBchUser} className="space-y-3.5">
               {bchModalTab === 'doankhoa' ? (
                 <div className="space-y-3">
                   <div>
                      <label className="text-xs font-semibold text-slate-600 mb-1 block">Chức vụ cấp Đoàn khoa / LCH</label>
                      <select 
                        className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 font-medium text-slate-700"
                        value={bchForm.committeeRole}
                        onChange={(e) => setBchForm({...bchForm, committeeRole: e.target.value})}
                      >
                        <option value="">-- Không tham gia BCH Đoàn khoa / LCH --</option>
                        <option value="Bí thư Đoàn khoa">Bí thư Đoàn khoa</option>
                        <option value="Phó Bí thư Đoàn khoa">Phó Bí thư Đoàn khoa</option>
                        <option value="Ủy viên Ban Thường vụ Đoàn khoa">Ủy viên Ban Thường vụ Đoàn khoa</option>
                        <option value="Ủy viên Ban Thường vụ">Ủy viên Ban Thường vụ</option>
                        <option value="Ủy viên BCH Đoàn khoa">Ủy viên BCH Đoàn khoa</option>
                        <option value="Liên Chi hội trưởng">Liên Chi hội trưởng</option>
                        <option value="Liên Chi hội phó">Liên Chi hội phó</option>
                        <option value="Ủy viên BCH Liên Chi hội">Ủy viên BCH Liên Chi hội</option>
                      </select>
                   </div>

                   <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-xs font-semibold text-slate-600">Nhiệm kỳ Đoàn khoa / LCH</label>
                        {(isAdmin || currentUser?.role === 'admin') && (
                          <button 
                            type="button" 
                            onClick={() => { setAddTermType('dk_term'); setShowAddTermModal(true); }} 
                            className="text-[11px] text-blue-600 hover:text-blue-800 font-bold flex items-center cursor-pointer"
                          >
                            <PlusCircle size={11} className="mr-0.5" /> Thêm NK
                          </button>
                        )}
                      </div>
                      <select 
                        className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 font-medium text-slate-700"
                        value={bchForm.committeeTerm}
                        onChange={(e) => setBchForm({...bchForm, committeeTerm: e.target.value})}
                      >
                        {doanKhoaTerms.map(t => (
                          <option key={t} value={t}>Nhiệm kỳ {t}</option>
                        ))}
                      </select>
                   </div>

                   <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-xs font-semibold text-slate-600">Giai đoạn (Theo năm học)</label>
                        {(isAdmin || currentUser?.role === 'admin') && (
                          <button 
                            type="button" 
                            onClick={() => { setAddTermType('dk_period'); setShowAddTermModal(true); }} 
                            className="text-[11px] text-blue-600 hover:text-blue-800 font-bold flex items-center cursor-pointer"
                          >
                            <PlusCircle size={11} className="mr-0.5" /> Thêm GĐ
                          </button>
                        )}
                      </div>
                      <select 
                        className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 font-medium text-slate-700"
                        value={bchForm.committeePeriod}
                        onChange={(e) => setBchForm({...bchForm, committeePeriod: e.target.value})}
                      >
                        {doanKhoaPeriods.map(p => (
                          <option key={p} value={p}>Năm học {p}</option>
                        ))}
                      </select>
                   </div>
                 </div>
               ) : (
                 <div className="space-y-3">
                   <div>
                      <label className="text-xs font-semibold text-slate-600 mb-1 block">Chức vụ cấp Chi đoàn</label>
                      <select 
                        className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 font-medium text-slate-700"
                        value={bchForm.branchRole}
                        onChange={(e) => setBchForm({...bchForm, branchRole: e.target.value})}
                      >
                        <option value="">-- Không tham gia BCH Chi đoàn --</option>
                        <option value="Bí thư Chi đoàn">Bí thư Chi đoàn</option>
                        <option value="Phó Bí thư Chi đoàn">Phó Bí thư Chi đoàn</option>
                        <option value="Ủy viên BCH Chi đoàn">Ủy viên BCH Chi đoàn</option>
                      </select>
                   </div>

                   <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-xs font-semibold text-slate-600">Nhiệm kỳ Chi đoàn (Theo năm học)</label>
                        {(isAdmin || currentUser?.role === 'admin') && (
                          <button 
                            type="button" 
                            onClick={() => { setAddTermType('cd_term'); setShowAddTermModal(true); }} 
                            className="text-[11px] text-blue-600 hover:text-blue-800 font-bold flex items-center cursor-pointer"
                          >
                            <PlusCircle size={11} className="mr-0.5" /> Thêm NK
                          </button>
                        )}
                      </div>
                      <select 
                        className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 font-medium text-slate-700"
                        value={bchForm.branchTerm}
                        onChange={(e) => setBchForm({...bchForm, branchTerm: e.target.value})}
                      >
                        {chiDoanTerms.map(t => (
                          <option key={t} value={t}>Năm học {t}</option>
                        ))}
                      </select>
                   </div>
                 </div>
               )}

               {(bchForm.committeeRole || bchForm.branchRole) && (
                 <>
                   <div>
                     <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Ảnh đại diện Chức vụ</label>
                     <div className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                       <div className="relative group shrink-0">
                         <img 
                           src={bchForm.avatar || "https://upload.wikimedia.org/wikipedia/vi/thumb/9/90/Huy_Hi%E1%BB%87u_%C4%90o%C3%A0n.png/1200px-Huy_Hi%E1%BB%87u_%C4%90o%C3%A0n.png"} 
                           alt="Avatar Preview" 
                           className="w-12 h-12 rounded-full object-cover border-2 border-blue-600 bg-white shadow-sm"
                         />
                         <label className="absolute bottom-0 right-0 bg-blue-600 text-white p-1 rounded-full cursor-pointer hover:bg-blue-700 transition shadow">
                           <Camera size={10} />
                           <input 
                             type="file" 
                             accept="image/*" 
                             className="hidden" 
                             onChange={(e) => {
                               const file = e.target.files?.[0];
                               if (file) {
                                 const reader = new FileReader();
                                 reader.onload = (ev) => {
                                   setBchForm({ ...bchForm, avatar: ev.target?.result as string });
                                 };
                                 reader.readAsDataURL(file);
                               }
                             }} 
                           />
                         </label>
                       </div>
                       <div className="flex-1 space-y-1">
                         <label className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition inline-flex items-center shadow-sm">
                           <Upload size={12} className="mr-1.5" /> Tải ảnh từ thiết bị
                           <input 
                             type="file" 
                             accept="image/*" 
                             className="hidden" 
                             onChange={(e) => {
                               const file = e.target.files?.[0];
                               if (file) {
                                 const reader = new FileReader();
                                 reader.onload = (ev) => {
                                   setBchForm({ ...bchForm, avatar: ev.target?.result as string });
                                 };
                                 reader.readAsDataURL(file);
                               }
                             }} 
                           />
                         </label>
                         {bchForm.avatar && (
                           <button 
                             type="button" 
                             onClick={() => setBchForm({ ...bchForm, avatar: '' })} 
                             className="block text-[10px] text-red-600 hover:underline font-semibold"
                           >
                             Xóa ảnh đại diện
                           </button>
                         )}
                       </div>
                     </div>
                   </div>
                 </>
               )}
               <div className="flex space-x-3 pt-2">
                 <button type="button" onClick={() => setEditingBchUser(null)} className="flex-1 py-2.5 rounded-xl font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 text-sm">Huỷ</button>
                 <button type="submit" className="flex-1 py-2.5 rounded-xl font-bold bg-blue-600 text-white hover:bg-blue-700 text-sm">Lưu</button>
               </div>
            </form>
          </div>
        </div>
      )}

      {deletingBranch && (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-xl p-5 border border-slate-100">
            <h3 className="font-bold text-slate-800 text-base mb-2">Xác nhận xóa Chi đoàn</h3>
            <p className="text-xs text-slate-600 mb-5">
              Bạn có chắc chắn muốn xóa Chi đoàn <span className="font-bold text-slate-900">{deletingBranch.name}</span> khỏi hệ thống không?
            </p>
            <div className="flex space-x-3">
              <button 
                type="button" 
                onClick={() => setDeletingBranch(null)} 
                className="flex-1 py-2.5 rounded-xl font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs transition cursor-pointer"
              >
                Hủy
              </button>
              <button 
                type="button" 
                onClick={confirmDeleteBranch} 
                className="flex-1 py-2.5 rounded-xl font-bold bg-red-600 text-white hover:bg-red-700 text-xs shadow-md transition cursor-pointer"
              >
                Xóa ngay
              </button>
            </div>
          </div>
        </div>
      )}

      {editingUserInfo && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl border border-slate-100">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-base text-slate-800">
                Cập nhật thông tin Đoàn viên
              </h3>
              <button onClick={() => setEditingUserInfo(null)} className="text-slate-400 hover:text-slate-600 text-sm font-bold">✕</button>
            </div>
            
            <form onSubmit={handleSaveUserInfo} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Họ và tên <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-500 font-medium"
                  value={userEditForm.name}
                  onChange={e => setUserEditForm({ ...userEditForm, name: e.target.value })}
                  placeholder="VD: Nguyễn Văn A"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Mã số sinh viên (MSSV)</label>
                <input
                  type="text"
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-500 font-medium"
                  value={userEditForm.mssv}
                  onChange={e => setUserEditForm({ ...userEditForm, mssv: e.target.value })}
                  placeholder="VD: 23120001"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Chi đoàn / Lớp</label>
                <input
                  type="text"
                  list="branch-options-edit"
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-500 font-medium"
                  value={userEditForm.branch}
                  onChange={e => setUserEditForm({ ...userEditForm, branch: e.target.value })}
                  placeholder="VD: 23DTV1"
                />
                <datalist id="branch-options-edit">
                  {branches.map(b => (
                    <option key={b.id} value={b.name} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Email liên hệ / Gmail</label>
                <input
                  type="email"
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-500 font-medium"
                  value={userEditForm.email}
                  onChange={e => setUserEditForm({ ...userEditForm, email: e.target.value })}
                  placeholder="VD: nguyenvana@gmail.com"
                />
              </div>

              {isAdmin && (
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1 block">Vai trò hệ thống</label>
                  <select
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-500 font-medium text-slate-700"
                    value={userEditForm.role}
                    onChange={e => setUserEditForm({ ...userEditForm, role: e.target.value })}
                  >
                    <option value="doanvien">Đoàn viên</option>
                    <option value="chidoan">BCH Chi đoàn</option>
                    <option value="admin">Quản trị viên (QTV Khoa)</option>
                  </select>
                </div>
              )}

              <div className="flex space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingUserInfo(null)}
                  className="flex-1 py-2.5 rounded-xl font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs transition cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl font-bold bg-blue-600 text-white hover:bg-blue-700 text-xs shadow-md transition cursor-pointer"
                >
                  Lưu thay đổi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddTermModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-xs shadow-xl border border-slate-100">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-sm text-slate-800">
                Thêm {addTermType === 'dk_term' ? 'Nhiệm kỳ Đoàn khoa' : addTermType === 'dk_period' ? 'Giai đoạn Đoàn khoa' : 'Nhiệm kỳ Chi đoàn'} mới
              </h3>
              <button onClick={() => setShowAddTermModal(false)} className="text-slate-400 hover:text-slate-600 text-xs font-bold">✕</button>
            </div>
            
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Khoảng năm học (VD: 2027-2029)</label>
                <input
                  type="text"
                  required
                  autoFocus
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-500 font-medium"
                  value={newTermInput}
                  onChange={e => setNewTermInput(e.target.value)}
                  placeholder="2027-2029"
                />
                <p className="text-[10px] text-slate-400 mt-1 italic">
                  * Mốc tháng 10 của năm kết thúc sẽ tự động dọn dẹp khi hết hạn.
                </p>
              </div>

              <div className="flex space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddTermModal(false)}
                  className="flex-1 py-2 rounded-xl font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs transition"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleAddNewTerm}
                  className="flex-1 py-2 rounded-xl font-bold bg-blue-600 text-white hover:bg-blue-700 text-xs shadow-md transition"
                >
                  Xác nhận thêm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
