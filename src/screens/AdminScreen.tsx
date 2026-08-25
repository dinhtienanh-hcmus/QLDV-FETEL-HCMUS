import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, getDoc, query, orderBy, deleteDoc, doc, updateDoc, setDoc, where } from 'firebase/firestore';
import { db, firebaseConfig } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { PlusCircle, Trash2, Users, FileSpreadsheet, Check, X, Bell, Upload, List, Edit2, Camera, Plus, ExternalLink } from 'lucide-react';
import { initializeApp, getApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import Papa from 'papaparse';
import { isTermExpired, filterActiveTerms, DEFAULT_DOAN_KHOA_TERMS, DEFAULT_DOAN_KHOA_PERIODS, DEFAULT_CHI_DOAN_TERMS, formatDateToDDMMYYYY } from '../utils/termUtils';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';

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
  activityType?: string;
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
    if (isAdmin) {
      return u.role === 'chidoan' || u.role === 'admin';
    }
    if (isBranch) {
      const myBranch = (currentUser?.branch || '').trim().toLowerCase();
      if (!myBranch) return false;
      const uBranch = (u.branch || '').trim().toLowerCase();
      const isSameBranch = uBranch === myBranch || uBranch.includes(myBranch) || myBranch.includes(uBranch);
      return isSameBranch && u.role === 'doanvien';
    }
    return false;
  };

  const [activeTab, setActiveTab] = useState<'activities' | 'users' | 'bch' | 'handbook' | 'branches' | 'tracking'>('activities');
  const [trackingSemester, setTrackingSemester] = useState<string>('all');
  const [trackingYear, setTrackingYear] = useState<string>('2026-2027');
  const [trackingSearch, setTrackingSearch] = useState<string>('');
  const [activityType, setActivityType] = useState<string>('tructiep');
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
  const [deletingUser, setDeletingUser] = useState<any | null>(null);
  const [branchesSeeded, setBranchesSeeded] = useState(false);
  const [myDriveLink, setMyDriveLink] = useState('');
  const [savingDriveLink, setSavingDriveLink] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

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
    if (isAdmin || isBranch) {
      fetchBranches();
    }
    if (isAdmin) {
      fetchHandbookTopics();
    }
  }, [currentUser, isAdmin, isBranch]);

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
    const oldBranch = branches.find(b => b.id === id);
    const oldBranchName = oldBranch?.name;
    const newBranchName = editingBranchName.trim();
    if (!oldBranchName) return;

    try {
      // 1. Update the branch document itself
      await updateDoc(doc(db, 'branches', id), {
        name: newBranchName,
        updatedAt: Date.now(),
      });

      // 2. Propagate name changes to users and activities in Firestore
      if (oldBranchName.trim().toLowerCase() !== newBranchName.trim().toLowerCase()) {
        // Query and update all users in that branch
        const usersRef = collection(db, 'users');
        const usersSnap = await getDocs(usersRef);
        const userPromises: Promise<void>[] = [];

        usersSnap.forEach((userDoc) => {
          const userData = userDoc.data();
          if (userData.branch && userData.branch.trim().toLowerCase() === oldBranchName.trim().toLowerCase()) {
            userPromises.push(
              updateDoc(doc(db, 'users', userDoc.id), {
                branch: newBranchName,
                updatedAt: Date.now()
              })
            );
          }
        });

        if (userPromises.length > 0) {
          await Promise.all(userPromises);
        }

        // Query and update all activities using that branch
        const activitiesRef = collection(db, 'activities');
        const activitiesSnap = await getDocs(activitiesRef);
        const activityPromises: Promise<void>[] = [];

        activitiesSnap.forEach((activityDoc) => {
          const actData = activityDoc.data();
          let needsUpdate = false;
          const updateFields: any = {};

          if (actData.branch && actData.branch.trim().toLowerCase() === oldBranchName.trim().toLowerCase()) {
            updateFields.branch = newBranchName;
            needsUpdate = true;
          }
          if (actData.targetAudience && actData.targetAudience.trim().toLowerCase() === oldBranchName.trim().toLowerCase()) {
            updateFields.targetAudience = newBranchName;
            needsUpdate = true;
          }
          if (actData.cooperatingBranches && Array.isArray(actData.cooperatingBranches)) {
            const updatedCooperating = actData.cooperatingBranches.map((cb: string) => 
              cb.trim().toLowerCase() === oldBranchName.trim().toLowerCase() ? newBranchName : cb
            );
            if (JSON.stringify(updatedCooperating) !== JSON.stringify(actData.cooperatingBranches)) {
              updateFields.cooperatingBranches = updatedCooperating;
              needsUpdate = true;
            }
          }
          if (actData.branches && Array.isArray(actData.branches)) {
            const updatedBranches = actData.branches.map((b: string) => 
              b.trim().toLowerCase() === oldBranchName.trim().toLowerCase() ? newBranchName : b
            );
            if (JSON.stringify(updatedBranches) !== JSON.stringify(actData.branches)) {
              updateFields.branches = updatedBranches;
              needsUpdate = true;
            }
          }

          if (needsUpdate) {
            updateFields.updatedAt = Date.now();
            activityPromises.push(
              updateDoc(doc(db, 'activities', activityDoc.id), updateFields)
            );
          }
        });

        if (activityPromises.length > 0) {
          await Promise.all(activityPromises);
        }
      }

      setEditingBranchId(null);
      setEditingBranchName('');
      fetchBranches();
      fetchUsers();
      fetchActivities();
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

  useEffect(() => {
    if (isBranch && branches.length > 0) {
      const mb = branches.find(b => b.name === currentUser?.branch);
      if (mb) {
        setMyDriveLink(mb.activityDriveLink || '');
      }
    }
  }, [branches, isBranch, currentUser]);

  const handleSaveDriveLink = async () => {
    if (!currentUser?.branch) return;
    setSavingDriveLink(true);
    setSaveSuccess(false);
    try {
      const mb = branches.find(b => b.name === currentUser.branch);
      if (mb) {
        await updateDoc(doc(db, 'branches', mb.id), {
          activityDriveLink: myDriveLink.trim(),
          updatedAt: Date.now()
        });
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
        fetchBranches();
      } else {
        // Create branch doc if missing
        await addDoc(collection(db, 'branches'), {
          name: currentUser.branch,
          activityDriveLink: myDriveLink.trim(),
          createdAt: Date.now()
        });
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
        fetchBranches();
      }
    } catch (e) {
      console.error(e);
      alert('Không thể cập nhật link Drive. Vui lòng thử lại.');
    } finally {
      setSavingDriveLink(false);
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

  const COLORS = [
    '#2563eb', // blue
    '#059669', // emerald
    '#d97706', // amber
    '#7c3aed', // violet
    '#db2777', // pink
    '#ea580c', // orange
    '#e11d48', // rose
    '#0d9488', // teal
    '#0891b2', // cyan
    '#4f46e5'  // indigo
  ];

  const getBranchStats = () => {
    const statsMap: { [key: string]: number } = {};
    const knownBranches = branches.map(b => b.name);

    knownBranches.forEach(b => {
      statsMap[b] = 0;
    });

    let totalDoanVien = 0;
    usersList.forEach(usr => {
      if (usr.role === 'doanvien' && usr.branch) {
        const bName = usr.branch.trim();
        if (bName && knownBranches.includes(bName)) {
          statsMap[bName] = (statsMap[bName] || 0) + 1;
          totalDoanVien++;
        }
      }
    });

    const chartData = Object.entries(statsMap)
      .map(([name, value]) => ({ name: `Chi đoàn ${name}`, value }))
      .filter(item => item.value > 0)
      .sort((a, b) => b.value - a.value);

    return { chartData, totalDoanVien };
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
        activityType: activityType || 'tructiep',
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
      setActivityType('tructiep');
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

      

  const handleReject = async (id: string, actName: string, actTarget: string) => {
    if (!isAdmin) return;
    if (!window.confirm(`Bạn có chắc muốn từ chối đề xuất hoạt động "${actName}"?`)) return;
    try {
      await updateDoc(doc(db, 'activities', id), {
        status: 'rejected',
        updatedAt: Date.now()
      });
      fetchActivities();
    } catch (err) {
      console.error(err);
    }
  };

  const getActivityTypeLabel = (act: Activity) => {
    if (act.activityType) {
      switch (act.activityType) {
        case 'online': return 'ONLINE';
        case 'tructiep': return 'TRỰC TIẾP';
        case 'diachido': return 'ĐỊA CHỈ ĐỎ';
        case 'chunhatxanh': return 'CHỦ NHẬT XANH';
        case 'tinhnguyen': return 'TÌNH NGUYỆN';
        default: return act.activityType.toUpperCase();
      }
    }
    const nameLower = (act.name || '').toLowerCase();
    if (nameLower.includes('online') || nameLower.includes('trực tuyến') || nameLower.includes('quản lý') || nameLower.includes('webinar') || nameLower.includes('quiz') || nameLower.includes('form')) return 'ONLINE';
    if (nameLower.includes('chủ nhật xanh') || nameLower.includes('lao động') || nameLower.includes('môi trường') || nameLower.includes('dọn dẹp')) return 'CHỦ NHẬT XANH';
    if (nameLower.includes('địa chỉ đỏ') || nameLower.includes('về nguồn') || nameLower.includes('di tích') || nameLower.includes('đền') || nameLower.includes('bảo tàng') || nameLower.includes('dấu chân tuổi trẻ')) return 'ĐỊA CHỈ ĐỎ';
    if (nameLower.includes('tình nguyện') || nameLower.includes('xuân tình nguyện') || nameLower.includes('mùa hè xanh') || nameLower.includes('hiến máu') || nameLower.includes('chiến dịch')) return 'TÌNH NGUYỆN';
    return 'TRỰC TIẾP';
  };

  const getActivityTypeColor = (typeLabel: string) => {
    switch (typeLabel) {
      case 'ONLINE': return 'bg-blue-600 text-white';
      case 'TRỰC TIẾP': return 'bg-emerald-700 text-white';
      case 'ĐỊA CHỈ ĐỎ': return 'bg-red-700 text-white';
      case 'CHỦ NHẬT XANH': return 'bg-green-600 text-white';
      case 'TÌNH NGUYỆN': return 'bg-orange-600 text-white';
      default: return 'bg-slate-600 text-white';
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
    if ((!isAdmin && !isBranch) || !newUsername) return;
    
    setCreatingAccount(true);
    try {
      const activeRole = isAdmin ? newRole : 'doanvien';
      const activeBranch = isAdmin ? newBranch.trim() : (currentUser?.branch || '').trim();

      if (activeRole === 'doanvien') {
        const cleanUname = newUsername.trim();
        const docRef = doc(db, 'users', `profile_${cleanUname.toLowerCase()}`);
        await setDoc(docRef, {
          username: cleanUname,
          mssv: cleanUname,
          email: `${cleanUname}@student.hcmus.edu.vn`,
          name: newName.trim(),
          role: 'doanvien',
          branch: activeBranch,
          createdAt: Date.now()
        }, { merge: true });
        alert(`Đã tạo hồ sơ Đoàn viên cho ${newName} (${cleanUname}).\nĐoàn viên sẽ tự đăng nhập bằng Google!`);
      } else if (isAdmin && activeRole === 'chidoan') {
        const targetBranch = activeBranch;
        if (!targetBranch) {
          alert('Vui lòng chọn hoặc nhập tên Chi đoàn!');
          setCreatingAccount(false);
          return;
        }

        const duplicate = usersList.find((u: any) => {
          const uBranch = (u.branch || '').toLowerCase().trim();
          const searchBranch = targetBranch.toLowerCase().trim();
          return (u.role === 'chidoan' || u.email?.includes('chidoan') || u.authEmail?.includes('chidoan')) && uBranch === searchBranch;
        });

        if (duplicate) {
          alert(`Chi đoàn "${targetBranch}" đã có tài khoản quản lý trên hệ thống! Mỗi Chi đoàn chỉ được phép có 01 tài khoản Chi đoàn.`);
          setCreatingAccount(false);
          return;
        }

        const rawUname = newUsername.trim().toLowerCase();
        const username = rawUname.endsWith('.fetel') ? rawUname : `${rawUname}.fetel`;
        const authEmail = `${username}@chidoan.fetel`;
        
        let secondaryApp;
        try {
          secondaryApp = getApp("SecondaryAppInstance");
        } catch {
          secondaryApp = initializeApp(firebaseConfig, "SecondaryAppInstance");
        }
        const secondaryAuth = getAuth(secondaryApp);
        const userCred = await createUserWithEmailAndPassword(secondaryAuth, authEmail, "Abc@123");
        await signOut(secondaryAuth);

        await setDoc(doc(db, 'users', userCred.user.uid), {
          email: '',
          authEmail: authEmail,
          username: username,
          name: newName.trim() || `Chi đoàn ${targetBranch}`,
          role: 'chidoan',
          branch: targetBranch,
          createdAt: Date.now()
        });
        alert(`Tạo tài khoản Chi đoàn thành công!\nTên đăng nhập: ${username}\nMật khẩu: Abc@123`);
      } else if (isAdmin && activeRole === 'admin') {
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
          branch: activeBranch || 'Đoàn khoa ĐTVT',
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
    let csvContent = "";
    if (isBranch) {
      csvContent = `STT,Họ tên,MSSV,Lớp\n1,Đặng Vũ Thiên Ân,26300001,${currentUser?.branch || ''}\n2,Đào Xuân Anh,26300002,${currentUser?.branch || ''}\n3,Huỳnh Kỳ Anh,26300003,${currentUser?.branch || ''}\n`;
    } else {
      csvContent = "STT,Họ tên,MSSV,Lớp,Vai trò\n1,Đặng Vũ Thiên Ân,26300001,26ICD,doanvien\n2,Đào Xuân Anh,26300002,26ICD,doanvien\n3,Bí thư chi đoàn 1,chidoan1,Chi đoàn 1,chidoan\n";
    }
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", isBranch ? `Mau_Danh_Sach_Doan_Vien_${currentUser?.branch || ''}.csv` : "Mau_Danh_Sach_Tai_Khoan.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleBulkImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || (!isAdmin && !isBranch)) return;
    
    setCreatingAccount(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async function(results) {
        const rows = results.data as any[];
        let count = 0;
        
        try {
           let secondaryApp;
           try {
             secondaryApp = getApp("SecondaryAppInstanceBulk");
           } catch {
             secondaryApp = initializeApp(firebaseConfig, "SecondaryAppInstanceBulk");
           }
           const secondaryAuth = getAuth(secondaryApp);

           for (const row of rows) {
              // Normalize keys to find matchings safely (handles BOM, spaces, casing)
              const cleanRow = {};
              Object.keys(row).forEach(k => {
                const cleanKey = k.replace(/^\uFEFF/, '').trim().toLowerCase();
                cleanRow[cleanKey] = row[k];
              });

              const getVal = (keywords) => {
                const foundKey = Object.keys(cleanRow).find(k => 
                  keywords.some(kw => k.includes(kw))
                );
                return foundKey ? cleanRow[foundKey]?.toString().trim() : '';
              };

              let usernameStr = getVal(['mssv', 'tên đăng nhập', 'ten dang nhap', 'username']);
              if (!usernameStr) continue;

              const newNameStr = getVal(['họ tên', 'ho ten', 'họ và tên', 'ho va ten', 'name']) || 'No Name';
              const newRoleStr = isAdmin ? (getVal(['vai trò', 'vai tro', 'role']) || 'doanvien') : 'doanvien';
              const newBranchStr = isAdmin ? (getVal(['lớp', 'lop', 'đơn vị', 'don vi', 'branch']) || '') : (currentUser?.branch || '');

              if (newRoleStr === 'doanvien') {
                let targetDocId = 'profile_' + usernameStr.toLowerCase();
                let existingUserFound = false;

                // Check if user already exists with mssv field (active user with google login etc.)
                const qMssv = query(collection(db, 'users'), where('mssv', '==', usernameStr));
                const qSnap = await getDocs(qMssv);
                if (!qSnap.empty) {
                  targetDocId = qSnap.docs[0].id;
                  existingUserFound = true;
                } else {
                  // Fallback: check by username field
                  const qUname = query(collection(db, 'users'), where('username', '==', usernameStr));
                  const qSnap2 = await getDocs(qUname);
                  if (!qSnap2.empty) {
                    targetDocId = qSnap2.docs[0].id;
                    existingUserFound = true;
                  }
                }

                if (existingUserFound) {
                  // Update/Merge the existing active user's data
                  await updateDoc(doc(db, 'users', targetDocId), {
                    name: newNameStr,
                    branch: newBranchStr,
                    updatedAt: Date.now()
                  });
                } else {
                  // Update or create the profile placeholder
                  const docRef = doc(db, 'users', targetDocId);
                  await setDoc(docRef, {
                    username: usernameStr,
                    mssv: usernameStr,
                    email: usernameStr + '@student.hcmus.edu.vn',
                    name: newNameStr,
                    role: 'doanvien',
                    branch: newBranchStr,
                    createdAt: Date.now()
                  }, { merge: true });
                }
                count++;
             } else if (isAdmin && newRoleStr === 'chidoan') {
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
           alert(`Đã cập nhật/import thành công ${count} hồ sơ đoàn viên!`);
           fetchUsers();
        } catch (err) {
            console.error(err);
            alert("Lỗi import: " + (err?.message || "Vui lòng kiểm tra định dạng file."));
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

  const confirmDeleteUser = async () => {
    if (!deletingUser) return;
    const nameStr = deletingUser.name || deletingUser.email || deletingUser.username || deletingUser.id;
    try {
      await deleteDoc(doc(db, 'users', deletingUser.id));
      setUsersList(prev => prev.filter(item => item.id !== deletingUser.id));
      setDeletingUser(null);
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
            {isAdmin && (
              <button 
                onClick={() => setActiveTab('tracking')}
                className={`pb-2 shrink-0 text-xs font-bold uppercase tracking-wide border-b-2 transition ${activeTab === 'tracking' ? 'border-white text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
              >
                Bảng hoạt động
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 p-4 space-y-4 overflow-y-auto pb-10">
        
        {isBranch && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-xl shadow-sm border border-blue-200">
            <h3 className="text-sm font-bold text-blue-900 mb-1 flex items-center gap-1.5">
              📁 Link Drive Tổng Hợp Hoạt Động (Chi đoàn {currentUser?.branch})
            </h3>
            <p className="text-[11px] text-slate-600 mb-3">
              Nhập đường dẫn Google Drive chứa báo cáo và minh chứng tổng hợp hoạt động của Chi đoàn bạn để Đoàn khoa theo dõi và duyệt trực tuyến.
            </p>
            <div className="flex gap-2">
              <input 
                type="url" 
                placeholder="https://drive.google.com/drive/folders/..." 
                className="flex-1 text-xs p-2.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                value={myDriveLink}
                onChange={e => setMyDriveLink(e.target.value)}
              />
              <button 
                onClick={handleSaveDriveLink}
                disabled={savingDriveLink}
                className="bg-blue-600 hover:bg-blue-700 text-white px-5 rounded-lg font-bold text-xs shrink-0 cursor-pointer transition disabled:opacity-50"
              >
                {savingDriveLink ? 'ĐANG LƯU...' : 'LƯU LINK'}
              </button>
            </div>
            {saveSuccess && (
              <p className="text-[10px] text-emerald-600 font-bold mt-1.5 flex items-center gap-1">
                <Check size={12} /> Đã cập nhật link Drive thành công!
              </p>
            )}
          </div>
        )}
        
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
                <input type="number" className="w-full text-sm p-2 bg-slate-50 border border-slate-200 rounded-lg" value={pointsParticipant} onChange={e => setPointsParticipant(Number(e.target.value))} min={0} required />
              </div>
              <div className="w-1/2">
                <label className="text-[10px] font-semibold text-slate-500 uppercase ml-1 block">ĐRL Tổ chức</label>
                <input type="number" className="w-full text-sm p-2 bg-slate-50 border border-slate-200 rounded-lg" value={pointsOrganizer} onChange={e => setPointsOrganizer(Number(e.target.value))} min={0} required />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase ml-1 block mb-1">Loại hoạt động</label>
              <select 
                className="w-full text-sm p-2 bg-slate-50 border border-slate-200 rounded-lg font-medium focus:outline-none focus:bg-white focus:border-blue-500" 
                value={activityType} 
                onChange={e => setActivityType(e.target.value)}
              >
                <option value="tructiep">TRỰC TIẾP (Mặc định)</option>
                <option value="online">ONLINE</option>
                <option value="diachido">ĐỊA CHỈ ĐỎ</option>
                <option value="chunhatxanh">CHỦ NHẬT XANH</option>
                <option value="tinhnguyen">TÌNH NGUYỆN</option>
              </select>
            </div>

            {/* Temporarily hidden "Mục / Tiêu chí ĐRL" field as requested */}
            {/*
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase ml-1 block mb-1">Mục / Tiêu chí ĐRL</label>
              <select className="w-full text-sm p-2 bg-slate-50 border border-slate-200 rounded-lg font-medium" value={drlCategory} onChange={e => setDrlCategory(e.target.value)}>
                <option value="Mục 1: Trách nhiệm chấp hành pháp luật và nội quy, quy chế của nhà trường">Mục 1: Trách nhiệm chấp hành pháp luật và nội quy, quy chế của nhà trường</option>
                <option value="Mục 3: Trách nhiệm tham gia các hoạt động chính trị, xã hội, văn hóa, văn nghệ, thể thao, phòng chống tội phạm, tệ nạn xã hội">Mục 3: Trách nhiệm tham gia các hoạt động chính trị, xã hội, văn hóa, văn nghệ, thể thao, phòng chống tội phạm, tệ nạn xã hội</option>
                <option value="Mục 4: Trách nhiệm công dân trong quan hệ cộng đồng">Mục 4: Trách nhiệm công dân trong quan hệ cộng đồng</option>
              </select>
            </div>
            */}

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
                    {branches.map(b => (
                      <option key={b.id} value={b.name}>{b.name}</option>
                    ))}
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
                     <p className="text-[9px] text-slate-500 mb-0.5">Bắt đầu: {formatDateToDDMMYYYY(act.startTime)}</p>
                     <p className="text-[9px] text-slate-500 mb-1">Kết thúc: {formatDateToDDMMYYYY(act.endTime)}</p>
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
            {/* Thống kê Đoàn viên */}
            {(() => {
              const { chartData, totalDoanVien } = getBranchStats();
              return (
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4 pb-3 border-b border-slate-100">
                    <div>
                      <h3 className="text-sm font-bold text-slate-800 flex items-center">
                        <Users size={18} className="mr-2 text-blue-600"/> Thống kê Đoàn viên theo Chi đoàn
                      </h3>
                      <p className="text-[11px] text-slate-500 mt-0.5">Phân tích mật độ đoàn viên giữa các chi đoàn trực thuộc Khoa</p>
                    </div>
                    <div className="bg-blue-50 text-blue-700 font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 shadow-sm border border-blue-100 shrink-0">
                      Tổng số: <span className="text-sm font-extrabold">{totalDoanVien}</span> đoàn viên
                    </div>
                  </div>

                  {chartData.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-xs italic">
                      Chưa có dữ liệu đoàn viên để hiển thị biểu đồ.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                      <div className="lg:col-span-5 flex justify-center">
                        <div className="w-full max-w-[280px] h-[260px] relative">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={chartData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={85}
                                paddingAngle={3}
                                dataKey="value"
                              >
                                {chartData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                              </Pie>
                              <Tooltip 
                                contentStyle={{ 
                                  backgroundColor: '#fff', 
                                  border: '1px solid #e2e8f0',
                                  borderRadius: '12px',
                                  fontSize: '11px',
                                  fontWeight: '600',
                                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                                }}
                                formatter={(value: number) => [`${value} đoàn viên`, 'Số lượng']}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                          {/* Nhãn trung tâm của biểu đồ donut */}
                          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none mt-1">
                            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Đoàn viên</span>
                            <span className="text-2xl font-black text-slate-800">{totalDoanVien}</span>
                          </div>
                        </div>
                      </div>

                      <div className="lg:col-span-7 space-y-2 max-h-[260px] overflow-y-auto pr-2 no-scrollbar">
                        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 grid grid-cols-12 px-2">
                          <span className="col-span-7">Chi đoàn</span>
                          <span className="col-span-2 text-right">Số lượng</span>
                          <span className="col-span-3 text-right">Tỷ lệ</span>
                        </div>
                        <div className="space-y-1.5">
                          {chartData.map((item, index) => {
                            const percent = totalDoanVien > 0 ? ((item.value / totalDoanVien) * 100).toFixed(1) : '0';
                            const color = COLORS[index % COLORS.length];
                            return (
                              <div key={item.name} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100/50 transition-colors text-xs font-semibold text-slate-700 grid grid-cols-12">
                                <div className="col-span-7 flex items-center gap-2">
                                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                                  <span className="truncate">{item.name}</span>
                                </div>
                                <span className="col-span-2 text-right font-bold text-slate-800">{item.value}</span>
                                <div className="col-span-3 text-right flex items-center justify-end gap-1.5">
                                  <span className="text-[10px] text-slate-400 font-medium">({percent}%)</span>
                                  <div className="w-12 bg-slate-200 h-1.5 rounded-full overflow-hidden shrink-0 hidden sm:block">
                                    <div className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: color }} />
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

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
                  <div key={b.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col justify-between">
                    <div className="flex justify-between items-center mb-2">
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
                        <span className="font-extrabold text-xs text-slate-800">{b.name}</span>
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

                    <div className="border-t border-slate-200/60 pt-2.5 mt-1.5">
                      {b.activityDriveLink ? (
                        <a 
                          href={b.activityDriveLink} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-[10px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 hover:text-blue-700 px-2.5 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition w-full shadow-2xs cursor-pointer"
                        >
                          <ExternalLink size={12} /> Xem Drive tổng hợp
                        </a>
                      ) : (
                        <div className="text-[10px] text-slate-400 italic text-center py-1 bg-slate-100/50 rounded-lg">Chưa cập nhật Drive hoạt động</div>
                      )}
                    </div>
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

            {(isAdmin || isBranch) && (
              <>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                  <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center">
                    <Users size={16} className="mr-1.5 text-blue-600"/> {isBranch ? 'Thêm Đoàn viên mới' : 'Tạo tài khoản mới'}
                  </h3>
                  <form onSubmit={handleCreateAccount} className="space-y-3">
                     <input 
                       type="text" placeholder={isBranch ? "MSSV (Tên đăng nhập)" : "MSSV / Tên đăng nhập"} 
                       className="w-full text-sm p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none" 
                       value={newUsername} onChange={e => setNewUsername(e.target.value)} required 
                     />
                     <input 
                       type="text" placeholder="Họ và tên" 
                       className="w-full text-sm p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none" 
                       value={newName} onChange={e => setNewName(e.target.value)} required 
                     />
                     {isAdmin && (
                       <>
                         <select 
                           className="w-full text-sm p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none" 
                           value={newRole} onChange={e => setNewRole(e.target.value)}
                         >
                            <option value="chidoan">Bí thư / Quản lý Chi đoàn</option>
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
                       </>
                     )}
                     <button 
                       type="submit" disabled={creatingAccount}
                       className="w-full bg-[#1d4ed8] text-white font-bold text-xs py-2.5 rounded-lg hover:bg-blue-800 disabled:opacity-70 cursor-pointer"
                     >
                       {creatingAccount ? 'ĐANG TẠO...' : isBranch ? 'THÊM ĐOÀN VIÊN' : 'TẠO TÀI KHOẢN (MẬT KHẨU: Abc@123)'}
                     </button>
                  </form>
                </div>

                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                  <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center">
                    <Upload size={16} className="mr-1.5 text-blue-600"/> Import {isBranch ? 'Đoàn viên' : 'Hàng Loạt'} (CSV)
                  </h3>
                  <p className="text-xs text-slate-500 mb-3">Tải mẫu CSV và sử dụng đúng định dạng để cập nhật danh sách thông tin đoàn viên lớp của bạn vào hệ thống.</p>
                  
                  <div className="flex gap-2">
                     <button type="button" onClick={downloadAccountTemplate} className="text-[10px] text-emerald-600 font-bold flex items-center border border-emerald-200 bg-emerald-50 px-3 py-2 rounded-lg justify-center flex-1 cursor-pointer">
                       <FileSpreadsheet size={14} className="mr-1.5" /> Tải mẫu CSV
                     </button>
                     <label className="text-[10px] text-blue-600 font-bold flex items-center border border-blue-200 bg-blue-50 px-3 py-2 rounded-lg cursor-pointer justify-center flex-1">
                       <Upload size={14} className="mr-1.5" /> Upload CSV
                       <input type="file" accept=".csv" className="hidden" onChange={handleBulkImport} disabled={creatingAccount} />
                     </label>
                  </div>
                  {creatingAccount && <div className="text-xs text-center mt-2 text-blue-600 font-medium">Đang tiến hành cập nhật/import dữ liệu đoàn viên, xin vui lòng đợi...</div>}
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
                    {branches.map(b => (
                      <option key={b.id} value={b.name}>Chi đoàn {b.name}</option>
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
                            <button onClick={() => setDeletingUser(u)} className="p-1.5 text-red-600 bg-red-50 hover:bg-red-100 rounded text-[10px] font-bold flex items-center shrink-0">
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
                                <button onClick={() => setDeletingUser(u)} className="p-1.5 text-red-600 bg-red-50 hover:bg-red-100 rounded text-[10px] font-bold flex items-center shrink-0">
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
                                <button onClick={() => setDeletingUser(u)} className="p-1 text-red-600 hover:bg-red-50 rounded" title="Xóa tài khoản">
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

        {activeTab === 'tracking' && isAdmin && (
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 animate-fadeIn">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-5 pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-black text-slate-800 flex items-center gap-1.5 uppercase tracking-wide">
                  📊 Bảng theo dõi & quản lý hoạt động Chi đoàn
                </h3>
                <p className="text-[11px] text-slate-500 mt-1 font-medium">
                  Quản lý trạng thái và timeline tổ chức hoạt động chính thức và dự kiến của các Chi đoàn trực thuộc.
                </p>
              </div>
              
              {/* Quick stats */}
              <div className="flex gap-2 text-[11px] font-bold">
                <span className="bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200/60 shadow-xs">
                  🏫 {branches.length} Chi đoàn
                </span>
                <span className="bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg border border-emerald-200/60 shadow-xs">
                  🟢 {activities.filter(a => a.status === 'approved').length} Đã tổ chức
                </span>
                <span className="bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg border border-indigo-200/60 shadow-xs">
                  🔵 {activities.filter(a => a.status === 'pending').length} Dự kiến
                </span>
              </div>
            </div>

            {/* Filter controls */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5 p-3.5 bg-slate-50/80 rounded-xl border border-slate-100">
              <div>
                <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5 ml-0.5">Học kỳ</label>
                <select 
                  value={trackingSemester} 
                  onChange={e => setTrackingSemester(e.target.value)}
                  className="w-full text-xs p-2.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 font-bold text-slate-700"
                >
                  <option value="all">Tất cả Học kỳ</option>
                  <option value="1">Học kỳ 1</option>
                  <option value="2">Học kỳ 2</option>
                  <option value="3">Học kỳ hè</option>
                </select>
              </div>
              <div>
                <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5 ml-0.5">Năm học</label>
                <select 
                  value={trackingYear} 
                  onChange={e => setTrackingYear(e.target.value)}
                  className="w-full text-xs p-2.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 font-bold text-slate-700"
                >
                  <option value="all">Tất cả Năm học</option>
                  <option value="2025-2026">2025-2026</option>
                  <option value="2026-2027">2026-2027</option>
                </select>
              </div>
              <div>
                <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5 ml-0.5">Tìm kiếm Chi đoàn</label>
                <input 
                  type="text" 
                  placeholder="Nhập tên lớp..."
                  value={trackingSearch}
                  onChange={e => setTrackingSearch(e.target.value)}
                  className="w-full text-xs p-2.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 font-medium text-slate-700"
                />
              </div>
            </div>

            {/* Legend / Guide */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-4 p-3 bg-slate-50 rounded-xl border border-slate-100 text-[10.5px] font-bold text-slate-600">
              <span className="uppercase tracking-wider text-[9px] text-slate-400 font-extrabold">Ghi chú màu sắc:</span>
              <span className="flex items-center gap-1.5 text-emerald-700">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block shadow-xs"></span>
                Đang hoạt động (Xanh lá)
              </span>
              <span className="flex items-center gap-1.5 text-rose-700">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block shadow-xs"></span>
                Đã qua ngày thực hiện (Đỏ)
              </span>
              <span className="flex items-center gap-1.5 text-blue-700">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block shadow-xs"></span>
                Chưa bắt đầu / Đề xuất (Xanh dương)
              </span>
            </div>

            {/* Excel Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs bg-slate-50/20">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="bg-slate-100/90 border-b border-slate-200 text-slate-700 font-extrabold uppercase tracking-wider text-[9.5px]">
                    <tr>
                      <th className="p-3 border-r border-slate-200 w-[110px] text-center bg-slate-50" rowSpan={2}>CHI ĐOÀN</th>
                      <th className="p-3 border-r border-slate-200 w-[150px] text-center bg-slate-50" rowSpan={2}>NGƯỜI PHỤ TRÁCH</th>
                      <th className="p-3 border-r border-slate-200 text-center bg-emerald-100/50 text-emerald-800" colSpan={3}>HOẠT ĐỘNG ĐÃ/ĐANG TỔ CHỨC</th>
                      <th className="p-3 text-center bg-indigo-100/50 text-indigo-800" colSpan={3}>HOẠT ĐỘNG DỰ KIẾN TỔ CHỨC</th>
                    </tr>
                    <tr>
                      <th className="p-2.5 border-r border-slate-200 bg-emerald-50/30 text-emerald-900">TÊN HOẠT ĐỘNG</th>
                      <th className="p-2 border-r border-slate-200 bg-emerald-50/30 text-emerald-900 w-[100px] text-center">BẮT ĐẦU</th>
                      <th className="p-2 border-r border-slate-200 bg-emerald-50/30 text-emerald-900 w-[100px] text-center">KẾT THÚC</th>
                      <th className="p-2.5 border-r border-slate-200 bg-indigo-50/30 text-indigo-900">TÊN HOẠT ĐỘNG DỰ KIẾN</th>
                      <th className="p-2 border-r border-slate-200 bg-indigo-50/30 text-indigo-900 w-[110px] text-center">THỜI GIAN DỰ KIẾN</th>
                      <th className="p-2 bg-indigo-50/30 text-indigo-900 w-[120px] text-center">PHÂN LOẠI CHỦ ĐỀ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-medium text-slate-700 bg-white">
                    {(() => {
                      const now = Date.now();
                      const sortedBranches = [...branches].sort((a, b) => a.name.localeCompare(b.name));
                      const filteredBranches = sortedBranches.filter(b => 
                        b.name.toLowerCase().includes(trackingSearch.trim().toLowerCase())
                      );

                      if (filteredBranches.length === 0) {
                        return (
                          <tr>
                            <td colSpan={8} className="p-8 text-center text-slate-400 italic font-medium">
                              Không tìm thấy Chi đoàn nào phù hợp.
                            </td>
                          </tr>
                        );
                      }

                      const getRoleRank = (roleStr = '') => {
                        const r = roleStr.toLowerCase();
                        if (r.includes('bí thư') && !r.includes('phó bí')) return 1;
                        if (r.includes('phó bí')) return 2;
                        if (r.includes('thường vụ') || r.includes('btv')) return 3;
                        if (r.includes('chấp hành') || r.includes('bch') || r.includes('ủy viên') || r.includes('uv')) return 4;
                        return 5;
                      };

                      return filteredBranches.map(branch => {
                        // Find branch leader
                        const cdBch = usersList.filter(u => 
                          u.branch && 
                          u.branch.trim().toLowerCase() === branch.name.trim().toLowerCase() && 
                          u.branchRole && 
                          u.branchRole.trim() !== ''
                        );
                        
                        let leaderName = 'CHƯA CÓ BCH';
                        if (cdBch.length > 0) {
                          cdBch.sort((a, b) => getRoleRank(a.branchRole) - getRoleRank(b.branchRole));
                          leaderName = cdBch[0].name.toUpperCase();
                        }

                        // Filter approved acts
                        const approvedActs = activities.filter(a => {
                          const belongs = a.branch === branch.name || (a.branches && a.branches.includes(branch.name));
                          const isApproved = a.status === 'approved';
                          const semMatch = trackingSemester === 'all' || a.semester === Number(trackingSemester);
                          const yearMatch = trackingYear === 'all' || a.academicYear === trackingYear;
                          return belongs && isApproved && semMatch && yearMatch;
                        });

                        // Filter pending acts
                        const pendingActs = activities.filter(a => {
                          const belongs = a.branch === branch.name || (a.branches && a.branches.includes(branch.name));
                          const isPending = a.status === 'pending';
                          const semMatch = trackingSemester === 'all' || a.semester === Number(trackingSemester);
                          const yearMatch = trackingYear === 'all' || a.academicYear === trackingYear;
                          return belongs && isPending && semMatch && yearMatch;
                        });

                        const rowCount = Math.max(approvedActs.length, pendingActs.length, 1);
                        const rows = [];

                        for (let i = 0; i < rowCount; i++) {
                          const appAct = approvedActs[i];
                          const penAct = pendingActs[i];

                          const startStr = appAct ? formatDateToDDMMYYYY(appAct.startTime) : '';
                          const endStr = appAct ? formatDateToDDMMYYYY(appAct.endTime) : '';
                          const pendTimeStr = penAct ? `${formatDateToDDMMYYYY(penAct.startTime)}${penAct.endTime !== penAct.startTime ? ' - ' + formatDateToDDMMYYYY(penAct.endTime) : ''}` : '';

                          const penType = penAct ? getActivityTypeLabel(penAct) : '';
                          const penColor = penAct ? getActivityTypeColor(penType) : '';

                          let appStatusClass = '';
                          if (appAct) {
                            if (now > appAct.endTime) {
                              appStatusClass = 'bg-rose-500 text-white font-semibold rounded px-2 py-1 text-center shadow-xs block text-[10px] uppercase tracking-wide';
                            } else if (now >= appAct.startTime && now <= appAct.endTime) {
                              appStatusClass = 'bg-emerald-500 text-white font-semibold rounded px-2 py-1 text-center shadow-xs block text-[10px] uppercase tracking-wide';
                            } else {
                              appStatusClass = 'bg-blue-500 text-white font-semibold rounded px-2 py-1 text-center shadow-xs block text-[10px] uppercase tracking-wide';
                            }
                          }

                          rows.push(
                            <tr key={`${branch.name}-${i}`} className="hover:bg-slate-50 transition border-b border-slate-100">
                              {i === 0 && (
                                <>
                                  <td className="p-3 border-r border-slate-200 font-extrabold text-slate-800 text-center align-middle bg-slate-50/40 text-[11px]" rowSpan={rowCount}>
                                    {branch.name}
                                  </td>
                                  <td className="p-3 border-r border-slate-200 font-black text-slate-600 align-middle text-center bg-slate-50/40 text-[10.5px] uppercase tracking-wider" rowSpan={rowCount}>
                                    {leaderName}
                                  </td>
                                </>
                              )}

                              {/* Approved */}
                              <td className="p-2.5 border-r border-slate-100 align-middle min-w-[150px]">
                                {appAct ? (
                                  <div className={appStatusClass}>
                                    {appAct.name}
                                  </div>
                                ) : (
                                  <span className="text-slate-300 italic block text-center">-</span>
                                )}
                              </td>
                              <td className="p-2 border-r border-slate-100 align-middle text-center font-bold text-slate-500 text-[10px]">
                                {startStr || <span className="text-slate-300">-</span>}
                              </td>
                              <td className="p-2 border-r border-slate-200 align-middle text-center font-bold text-slate-500 text-[10px]">
                                {endStr || <span className="text-slate-300">-</span>}
                              </td>

                              {/* Pending */}
                              <td className="p-2.5 border-r border-slate-100 align-middle min-w-[160px]">
                                {penAct ? (
                                  <div className="flex justify-between items-center bg-indigo-50/70 border border-indigo-100 text-indigo-900 rounded px-2.5 py-1.5 font-bold shadow-xs text-[10.5px]">
                                    <span>{penAct.name}</span>
                                    <div className="flex gap-1 ml-2 shrink-0">
                                      <button 
                                        onClick={() => handleApprove(penAct.id, penAct.name, penAct.targetAudience || 'all')}
                                        className="p-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded shadow-sm cursor-pointer transition"
                                        title="Duyệt ngay"
                                      >
                                        <Check size={9} />
                                      </button>
                                      <button 
                                        onClick={() => handleReject(penAct.id, penAct.name, penAct.targetAudience || 'all')}
                                        className="p-1 bg-rose-600 hover:bg-rose-700 text-white rounded shadow-sm cursor-pointer transition"
                                        title="Từ chối"
                                      >
                                        <X size={9} />
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-slate-300 italic block text-center">-</span>
                                )}
                              </td>
                              <td className="p-2 border-r border-slate-100 align-middle text-center font-bold text-slate-500 text-[10px]">
                                {pendTimeStr || <span className="text-slate-300">-</span>}
                              </td>
                              <td className="p-2 align-middle text-center">
                                {penAct ? (
                                  <span className={`inline-block px-2.5 py-1 text-[9px] font-black uppercase rounded-full shadow-xs ${penColor}`}>
                                    {penType}
                                  </span>
                                ) : (
                                  <span className="text-slate-300 italic block text-center">-</span>
                                )}
                              </td>
                            </tr>
                          );
                        }
                        return rows;
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
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

      {deletingUser && (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-xl p-5 border border-slate-100">
            <h3 className="font-bold text-slate-800 text-base mb-2">Xác nhận xóa tài khoản</h3>
            <p className="text-xs text-slate-600 mb-5">
              Bạn có chắc chắn muốn xóa vĩnh viễn tài khoản <span className="font-bold text-slate-900">{deletingUser.name || deletingUser.email || deletingUser.username || deletingUser.id}</span> khỏi hệ thống? Thao tác này không thể khôi phục.
            </p>
            <div className="flex space-x-3">
              <button 
                type="button" 
                onClick={() => setDeletingUser(null)} 
                className="flex-1 py-2.5 rounded-xl font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs transition cursor-pointer"
              >
                Hủy
              </button>
              <button 
                type="button" 
                onClick={confirmDeleteUser} 
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