import { Bell, LogOut, CalendarCheck2, KeyRound, X, CheckCircle2, Camera, Upload } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db, auth } from '../lib/firebase';
import { collection, query, getDocs, doc, setDoc, deleteDoc, orderBy, getDoc } from 'firebase/firestore';
import { updatePassword } from 'firebase/auth';
import { isTermExpired, formatDateToDDMMYYYY } from '../utils/termUtils';

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
  semester?: number;
  academicYear?: string;
  status: string;
  attended?: boolean;
  scannedAt?: number;
  description?: string;
  imageUrl?: string;
  branch?: string;
  organizerDetails?: Organizer[];
  isCooperating?: boolean;
  cooperatingBranches?: string[];
  otherCooperators?: string;
  branches?: string[];
}

interface Notification {
  id: string;
  title: string;
  message: string;
  createdAt: number;
}

export default function HomeScreen() {
  const [campaigns, setCampaigns] = useState<Activity[]>([]);
  const [activityTab, setActivityTab] = useState<'ongoing' | 'attended'>('ongoing');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [dismissedNotifs, setDismissedNotifs] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('dismissedNotifs');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const markAllAsRead = () => {
    setDismissedNotifs(prev => {
      const allIds = notifications.map(n => n.id);
      const newNotifs = Array.from(new Set([...prev, ...allIds]));
      localStorage.setItem('dismissedNotifs', JSON.stringify(newNotifs));
      return newNotifs;
    });
  };

  const handleDismissNotif = (id: string) => {
    setDismissedNotifs(prev => {
      const newNotifs = [...prev, id];
      localStorage.setItem('dismissedNotifs', JSON.stringify(newNotifs));
      return newNotifs;
    });
  };

  const [bchMembers, setBchMembers] = useState<any[]>([]);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [previewAvatar, setPreviewAvatar] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const { logout, currentUser, updateUserAvatar } = useAuth();
  
  const isDoanKhoaAccount = currentUser?.role === 'admin';
  
  // Filter BCH Đoàn khoa and BCH Chi đoàn (excluding expired terms/periods)
  const bchDoanKhoa = bchMembers.filter(m => {
    if (!m.committeeRole || m.committeeRole.trim() === '') return false;
    if (isTermExpired(m.committeeTerm) || isTermExpired(m.committeePeriod)) return false;
    const r = m.committeeRole.toLowerCase();
    // Exclude pure Chi doan specific roles unless it also mentions Đoàn khoa or BTV/Thường vụ
    if (r.includes('chi đoàn') && !r.includes('đoàn khoa') && !r.includes('btv') && !r.includes('thường vụ')) {
      return false;
    }
    return true;
  });

  const bchChiDoan = !isDoanKhoaAccount && currentUser?.branch
    ? bchMembers.filter(m => {
        const isUserBranch = (m.branch || '').toLowerCase() === (currentUser.branch || '').toLowerCase();
        if (!isUserBranch) return false;
        if (isTermExpired(m.branchTerm)) return false;

        const branchRole = (m.branchRole || '').trim();
        const committeeRole = (m.committeeRole || '').trim().toLowerCase();

        return branchRole !== '' || committeeRole.includes('chi đoàn') || m.role === 'chidoan';
      }).map(m => ({
        ...m,
        // Override committeeRole for the Chi đoàn section view so it shows their Chi đoàn title
        committeeRole: m.branchRole || (m.committeeRole && m.committeeRole.toLowerCase().includes('chi đoàn') ? m.committeeRole : 'Bí thư Chi đoàn')
      }))
    : [];

  // Use current user's email if available, fallback
  const displayName = currentUser?.name || currentUser?.email?.split('@')[0] || 'Người dùng';

  useEffect(() => {
    fetchBchMembers();
    fetchActivities();
    fetchNotifications();
  }, [currentUser]);

  const fetchBchMembers = async () => {
    try {
      const q = query(collection(db, 'users'));
      const snapshot = await getDocs(q);
      const allUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
      
      // Step 1: Merge profiles by identity across all users (email > mssv > name)
      const userMap = new Map<string, any>();

      for (const u of allUsers) {
        const cleanEmail = (u.email || '').trim().toLowerCase();
        const cleanName = (u.name || '').trim().toLowerCase();
        const cleanMssv = (u.mssv || u.username || '').trim().toLowerCase();

        const key = cleanEmail || (cleanMssv ? `mssv_${cleanMssv}` : (cleanName ? `name_${cleanName}` : u.id));

        if (!userMap.has(key)) {
          userMap.set(key, {
            ...u,
            name: u.name || '',
            committeeRole: u.committeeRole || '',
            branchRole: u.branchRole || '',
            branch: u.branch || 'Đoàn khoa ĐTVT',
            avatar: u.avatar || u.photoURL || (u.id === currentUser?.uid ? currentUser?.avatar : ''),
          });
        } else {
          const existing = userMap.get(key);
          userMap.set(key, {
            ...existing,
            ...u,
            name: u.name || existing.name,
            avatar: u.avatar || u.photoURL || existing.avatar || (u.id === currentUser?.uid ? currentUser?.avatar : ''),
            committeeRole: u.committeeRole || existing.committeeRole || '',
            branchRole: u.branchRole || existing.branchRole || '',
            committeeTerm: u.committeeTerm || existing.committeeTerm,
            branch: u.branch || existing.branch || 'Đoàn khoa ĐTVT',
          });
        }
      }

      // Step 2: Inject current logged-in user details if matched
      if (currentUser) {
        const cEmail = (currentUser.email || '').toLowerCase();
        const cName = (currentUser.name || '').toLowerCase();
        const cKey = cEmail || (cName ? `name_${cName}` : currentUser.uid);

        if (userMap.has(cKey)) {
          const ex = userMap.get(cKey);
          userMap.set(cKey, {
            ...ex,
            avatar: currentUser.avatar || ex.avatar,
            name: currentUser.name || ex.name,
            committeeRole: currentUser.committeeRole || ex.committeeRole || '',
            branchRole: currentUser.branchRole || ex.branchRole || '',
          });
        }
      }

      // Step 3: Filter for valid BCH members (either Đoàn khoa or Chi đoàn)
      const mergedList = Array.from(userMap.values());
      const bch = mergedList.filter(u => 
        (u.committeeRole && u.committeeRole.trim() !== '') || 
        (u.branchRole && u.branchRole.trim() !== '')
      );

      setBchMembers(bch);
    } catch (e) {
      console.error(e);
    }
  };

  const getRoleRank = (roleStr: string = '') => {
    const r = roleStr.toLowerCase();
    if (r.includes('bí thư') && !r.includes('phó bí thư') && !r.includes('phó bí')) return 1;
    if (r.includes('phó bí thư') || r.includes('phó bí')) return 2;
    if (r.includes('thường vụ') || r.includes('btv')) return 3;
    if (r.includes('chấp hành') || r.includes('bch') || r.includes('ủy viên') || r.includes('uv')) return 4;
    return 5;
  };

  const renderBchSection = (members: any[], colorType: 'blue' | 'emerald') => {
    const validMembers = members.filter(m => m.committeeRole && m.committeeRole.trim() !== '');

    // Sort by rank: Bí thư (1) -> Phó Bí thư (2) -> BTV (3) -> UV BCH (4)
    const sorted = [...validMembers].sort((a, b) => getRoleRank(a.committeeRole) - getRoleRank(b.committeeRole));

    const biThuList = sorted.filter(m => getRoleRank(m.committeeRole) === 1);
    const phoBiThuList = sorted.filter(m => getRoleRank(m.committeeRole) === 2);
    const btvList = sorted.filter(m => getRoleRank(m.committeeRole) === 3);
    const uvBchList = sorted.filter(m => getRoleRank(m.committeeRole) === 4);
    const otherList = sorted.filter(m => getRoleRank(m.committeeRole) === 5);

    const borderClass = colorType === 'blue' ? 'border-[#1d4ed8]' : 'border-emerald-600';
    const bgClass = colorType === 'blue' ? 'bg-blue-100' : 'bg-emerald-100';
    const textClass = colorType === 'blue' ? 'text-[#1d4ed8]' : 'text-emerald-700';

    if (validMembers.length === 0) {
      return <p className="text-xs text-slate-400 italic">Chưa có dữ liệu Ban Chấp hành.</p>;
    }

    return (
      <div className="flex items-stretch space-x-3 overflow-x-auto no-scrollbar pb-2 pt-1">
        {/* 1. Bí thư */}
        {biThuList.map(m => (
          <div key={m.id || m.mssv || m.name} className="flex flex-col items-center justify-between min-w-[110px] px-3 shrink-0 bg-slate-50/80 py-2.5 rounded-2xl border border-slate-200/60">
            <div className="flex flex-col items-center w-full">
              <img 
                src={m.avatar || "https://upload.wikimedia.org/wikipedia/vi/thumb/9/90/Huy_Hi%E1%BB%87u_%C4%90o%C3%A0n.png/1200px-Huy_Hi%E1%BB%87u_%C4%90o%C3%A0n.png"} 
                alt={m.name} 
                className={`w-12 h-12 ${bgClass} rounded-full border-2 ${borderClass} object-cover shadow-xs`} 
              />
              <span className="text-[11px] mt-1.5 font-bold text-slate-800 text-center whitespace-nowrap px-0.5" title={m.name}>
                {m.name}
              </span>
            </div>
            <span className={`text-[9px] ${textClass} font-extrabold uppercase text-center mt-2 pt-1.5 border-t border-slate-200/80 w-full tracking-tight whitespace-nowrap`}>
              BÍ THƯ
            </span>
          </div>
        ))}

        {/* 2. Phó Bí thư */}
        {phoBiThuList.map(m => (
          <div key={m.id || m.mssv || m.name} className="flex flex-col items-center justify-between min-w-[110px] px-3 shrink-0 bg-slate-50/80 py-2.5 rounded-2xl border border-slate-200/60">
            <div className="flex flex-col items-center w-full">
              <img 
                src={m.avatar || "https://upload.wikimedia.org/wikipedia/vi/thumb/9/90/Huy_Hi%E1%BB%87u_%C4%90o%C3%A0n.png/1200px-Huy_Hi%E1%BB%87u_%C4%90o%C3%A0n.png"} 
                alt={m.name} 
                className={`w-12 h-12 ${bgClass} rounded-full border-2 ${borderClass} object-cover shadow-xs`} 
              />
              <span className="text-[11px] mt-1.5 font-bold text-slate-800 text-center whitespace-nowrap px-0.5" title={m.name}>
                {m.name}
              </span>
            </div>
            <span className={`text-[9px] ${textClass} font-extrabold uppercase text-center mt-2 pt-1.5 border-t border-slate-200/80 w-full tracking-tight whitespace-nowrap`}>
              PHÓ BÍ THƯ
            </span>
          </div>
        ))}

        {/* 3. Ủy viên Ban Thường vụ Group */}
        {btvList.length > 0 && (
          <div className="flex flex-col items-center justify-between shrink-0 bg-slate-50/80 py-2.5 px-1 rounded-2xl border border-slate-200/60">
            <div className="flex items-start space-x-1">
              {btvList.map(m => (
                <div key={m.id || m.mssv || m.name} className="flex flex-col items-center min-w-[105px] px-2 shrink-0">
                  <img 
                    src={m.avatar || "https://upload.wikimedia.org/wikipedia/vi/thumb/9/90/Huy_Hi%E1%BB%87u_%C4%90o%C3%A0n.png/1200px-Huy_Hi%E1%BB%87u_%C4%90o%C3%A0n.png"} 
                    alt={m.name} 
                    className={`w-12 h-12 ${bgClass} rounded-full border-2 ${borderClass} object-cover shadow-xs`} 
                  />
                  <span className="text-[11px] mt-1.5 font-bold text-slate-800 text-center whitespace-nowrap px-0.5" title={m.name}>
                    {m.name}
                  </span>
                </div>
              ))}
            </div>
            <span className={`text-[9px] ${textClass} font-extrabold uppercase text-center mt-2 pt-1.5 border-t border-slate-200/80 w-full tracking-tight whitespace-nowrap px-2`}>
              ỦY VIÊN BAN THƯỜNG VỤ
            </span>
          </div>
        )}

        {/* 4. UV BCH Group */}
        {uvBchList.length > 0 && (
          <div className="flex flex-col items-center justify-between shrink-0 bg-slate-50/80 py-2.5 px-1 rounded-2xl border border-slate-200/60">
            <div className="flex items-start space-x-1">
              {uvBchList.map(m => (
                <div key={m.id || m.mssv || m.name} className="flex flex-col items-center min-w-[105px] px-2 shrink-0">
                  <img 
                    src={m.avatar || "https://upload.wikimedia.org/wikipedia/vi/thumb/9/90/Huy_Hi%E1%BB%87u_%C4%90o%C3%A0n.png/1200px-Huy_Hi%E1%BB%87u_%C4%90o%C3%A0n.png"} 
                    alt={m.name} 
                    className={`w-12 h-12 ${bgClass} rounded-full border-2 ${borderClass} object-cover shadow-xs`} 
                  />
                  <span className="text-[11px] mt-1.5 font-bold text-slate-800 text-center whitespace-nowrap px-0.5" title={m.name}>
                    {m.name}
                  </span>
                </div>
              ))}
            </div>
            <span className={`text-[9px] ${textClass} font-extrabold uppercase text-center mt-2 pt-1.5 border-t border-slate-200/80 w-full tracking-tight whitespace-nowrap px-2`}>
              ỦY VIÊN BAN CHẤP HÀNH
            </span>
          </div>
        )}

        {/* 5. Custom / Other Roles */}
        {otherList.map(m => (
          <div key={m.id || m.mssv || m.name} className="flex flex-col items-center justify-between min-w-[110px] px-3 shrink-0 bg-slate-50/80 py-2.5 rounded-2xl border border-slate-200/60">
            <div className="flex flex-col items-center w-full">
              <img 
                src={m.avatar || "https://upload.wikimedia.org/wikipedia/vi/thumb/9/90/Huy_Hi%E1%BB%87u_%C4%90o%C3%A0n.png/1200px-Huy_Hi%E1%BB%87u_%C4%90o%C3%A0n.png"} 
                alt={m.name} 
                className={`w-12 h-12 ${bgClass} rounded-full border-2 ${borderClass} object-cover shadow-xs`} 
              />
              <span className="text-[11px] mt-1.5 font-bold text-slate-800 text-center whitespace-nowrap px-0.5" title={m.name}>
                {m.name}
              </span>
            </div>
            <span className={`text-[9px] ${textClass} font-extrabold uppercase text-center mt-2 pt-1.5 border-t border-slate-200/80 w-full tracking-tight whitespace-nowrap px-1`}>
              {m.committeeRole.toUpperCase()}
            </span>
          </div>
        ))}
      </div>
    );
  };

  const fetchNotifications = async () => {
    if (!currentUser) return;
    try {
      const q = query(collection(db, 'notifications'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const notifs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Notification));
      setNotifications(notifs);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchActivities = async () => {
    if (!currentUser) return;
    try {
      const q = query(collection(db, 'activities'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const acts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Activity));
      
      // Filter activities based on branch or 'all'
      const visibleActs = acts.filter(a => {
        if (a.status !== 'approved') return false;
        if (currentUser.role === 'admin') return true;
        const matchesBranchTarget = a.targetAudience === 'all' || a.targetAudience === currentUser.branch || a.targetAudience === 'chidoan';
        const isCooperator = a.branches && a.branches.includes(currentUser.branch || '');
        return matchesBranchTarget || isCooperator;
      });

      // Check attendance status for each activity
      const finalized = await Promise.all(visibleActs.map(async act => {
         const regRef = doc(db, 'activities', act.id, 'registrations', currentUser.uid);
         const regSnap = await getDoc(regRef);
         const regData = regSnap.exists() ? regSnap.data() : null;
         const isAttended = regData?.status === 'attended';
         return { 
           ...act, 
           attended: !!isAttended, 
           scannedAt: regData?.scannedAt 
         };
      }));
      
      setCampaigns(finalized);
    } catch (err) {
      console.error(err);
    }
  };

  const ongoingCampaigns = campaigns.filter(c => !c.attended);
  const attendedCampaigns = campaigns.filter(c => c.attended);

  const handlePasswordSubmit = async (e: any) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    
    setPasswordError('');
    setPasswordSuccess(false);

    if (newPassword.length < 6) {
      setPasswordError('Mật khẩu phải chứa ít nhất 6 ký tự.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Mật khẩu xác nhận không khớp.');
      return;
    }

    try {
      await updatePassword(auth.currentUser, newPassword);
      setPasswordSuccess(true);
      setTimeout(() => {
        setShowPasswordModal(false);
        setPasswordSuccess(false);
        setNewPassword('');
        setConfirmPassword('');
      }, 2000);
    } catch (err: any) {
      if (err.code === 'auth/requires-recent-login') {
        setPasswordError('Vui lòng đăng xuất và đăng nhập lại để thực hiện thay đổi.');
      } else {
        setPasswordError(err.message || 'Lỗi đổi mật khẩu');
      }
    }
  };

  const getRoleDisplay = () => {
    if (currentUser?.role === 'admin') return 'Ban Chấp hành';
    if (currentUser?.role === 'chidoan') return 'Đoàn khoa Điện tử - Viễn thông';
    return currentUser?.branch || 'Đoàn viên';
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header Area */}
      <div className="bg-[#1d4ed8] text-white p-6 pt-10 shrink-0 relative">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-3">
            <div 
              className="relative group cursor-pointer shrink-0" 
              onClick={() => setShowAvatarModal(true)} 
              title="Đổi ảnh đại diện (như Facebook)"
            >
              <img 
                src={currentUser?.avatar || "https://upload.wikimedia.org/wikipedia/vi/thumb/9/90/Huy_Hi%E1%BB%87u_%C4%90o%C3%A0n.png/1200px-Huy_Hi%E1%BB%87u_%C4%90o%C3%A0n.png"} 
                alt="Avatar" 
                className="w-12 h-12 rounded-full border-2 border-white/80 object-cover shadow bg-blue-100" 
              />
              <div className="absolute bottom-0 right-0 bg-blue-600 text-white p-1 rounded-full border border-white shadow">
                <Camera size={10} />
              </div>
            </div>
            <div>
              <div className="text-xs opacity-80 uppercase tracking-widest">Chào mừng bạn</div>
              <div className="text-xl font-bold line-clamp-1">{displayName}</div>
              <div className="text-[10px] bg-white/20 inline-block px-2 py-0.5 mt-1 rounded text-white flex items-center font-medium">
                {getRoleDisplay()}
              </div>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={() => setShowNotificationModal(true)} className="p-2 bg-white/20 rounded-full hover:bg-white/30 transition border-none cursor-pointer flex shrink-0">
              <Bell size={18} className="text-white" />
              {notifications.filter(n => !dismissedNotifs.includes(n.id)).length > 0 && (
                <span className="absolute top-9 right-[100px] w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-[#1d4ed8]"></span>
              )}
            </button>
            <button onClick={() => setShowPasswordModal(true)} className="p-2 bg-white/20 rounded-full hover:bg-white/30 transition border-none cursor-pointer flex shrink-0" title="Đổi mật khẩu">
              <KeyRound size={18} className="text-white" />
            </button>
            <button onClick={logout} className="p-2 bg-white/20 rounded-full hover:bg-red-500/80 transition border-none cursor-pointer flex shrink-0" title="Đăng xuất">
              <LogOut size={18} className="text-white" />
            </button>
          </div>
        </div>
      </div>

        <div className="flex-1 p-4 space-y-4 overflow-y-auto no-scrollbar pb-10">
          {notifications.filter(n => !dismissedNotifs.includes(n.id)).length > 0 && (
            <div className="mb-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">Thông báo mới</h3>
              <div className="space-y-2">
                {notifications.filter(n => !dismissedNotifs.includes(n.id)).slice(0, 2).map(n => (
                  <div key={n.id} className="bg-yellow-50 border border-yellow-200 p-3 rounded-xl border-l-4 border-l-yellow-400 relative">
                    <div className="text-[11px] font-bold text-yellow-800 pr-4">{n.title}</div>
                    <div className="text-[10px] text-yellow-700 mt-0.5">{n.message}</div>
                  </div>
                ))}
              </div>
              {notifications.filter(n => !dismissedNotifs.includes(n.id)).length > 2 && (
                <button 
                  onClick={() => setShowNotificationModal(true)}
                  className="mt-3 w-full block text-center py-2 bg-yellow-100 hover:bg-yellow-200 text-yellow-800 text-[10px] font-bold rounded-lg border border-yellow-200 uppercase"
                >
                  +{notifications.filter(n => !dismissedNotifs.includes(n.id)).length - 2} thông báo mới
                </button>
              )}
            </div>
          )}

          {/* BCH Đoàn Khoa Section */}
        <div>
          <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">Ban Chấp hành Đoàn khoa</h3>
          {renderBchSection(bchDoanKhoa, 'blue')}
        </div>

        {/* BCH Chi Đoàn Section (Chỉ hiển thị cho Đoàn viên/Chi đoàn, không áp dụng cho Đoàn khoa) */}
        {!isDoanKhoaAccount && (
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">
              Ban Chấp hành {currentUser?.branch || 'Chi đoàn'}
            </h3>
            {renderBchSection(bchChiDoan, 'emerald')}
          </div>
        )}

        {/* Activity Section */}
        <div>
          <div className="flex bg-slate-100 p-1 rounded-xl mb-3 border border-slate-200">
            <button
              type="button"
              onClick={() => setActivityTab('ongoing')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer ${
                activityTab === 'ongoing'
                  ? 'bg-white text-[#1d4ed8] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>🔥 Hoạt động đang diễn ra</span>
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${activityTab === 'ongoing' ? 'bg-blue-100 text-[#1d4ed8]' : 'bg-slate-200 text-slate-600'}`}>
                {ongoingCampaigns.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActivityTab('attended')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer ${
                activityTab === 'attended'
                  ? 'bg-white text-emerald-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>✅ Hoạt động đã tham gia</span>
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${activityTab === 'attended' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                {attendedCampaigns.length}
              </span>
            </button>
          </div>

          <div className="space-y-3">
            {(activityTab === 'ongoing' ? ongoingCampaigns : attendedCampaigns).length === 0 ? (
              <div className="text-center py-8 px-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <CalendarCheck2 size={32} className="mx-auto text-slate-300 mb-2" />
                <p className="text-xs font-medium text-slate-500 italic">
                  {activityTab === 'ongoing'
                    ? 'Hiện chưa có hoạt động nào đang diễn ra.'
                    : 'Bạn chưa có hoạt động nào đã điểm danh tham gia.'}
                </p>
              </div>
            ) : (
              (activityTab === 'ongoing' ? ongoingCampaigns : attendedCampaigns).map(campaign => (
                <div
                  key={campaign.id}
                  onClick={() => setSelectedActivity(campaign)}
                  className={`p-4 rounded-2xl border cursor-pointer hover:shadow-md transition bg-white ${
                    campaign.attended ? 'border-emerald-200 hover:border-emerald-300' : 'border-blue-100 hover:border-blue-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2.5 rounded-xl shrink-0 ${campaign.attended ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-[#1d4ed8]'}`}>
                      <CalendarCheck2 size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h4 className="text-sm sm:text-base font-bold text-slate-900 leading-snug">
                          {campaign.name}
                        </h4>
                        {campaign.semester && campaign.academicYear && (
                          <span className="shrink-0 text-[10px] sm:text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                            HK{campaign.semester} ({campaign.academicYear})
                          </span>
                        )}
                      </div>

                      {/* Mốc thời gian - Highlighted larger font */}
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 text-xs font-semibold text-slate-700 my-2 bg-slate-50 p-2 rounded-xl border border-slate-100">
                        <div className="flex items-center gap-1">
                          <span className="text-blue-600 font-bold">📅 Bắt đầu:</span>
                          <span className="font-bold text-slate-800">{formatDateToDDMMYYYY(campaign.startTime)}</span>
                        </div>
                        <span className="hidden sm:inline text-slate-300">•</span>
                        <div className="flex items-center gap-1">
                          <span className="text-red-600 font-bold">🏁 Kết thúc:</span>
                          <span className="font-bold text-slate-800">{formatDateToDDMMYYYY(campaign.endTime)}</span>
                        </div>
                      </div>

                      {/* Điểm rèn luyện - Prominent Banner */}
                      <div className="mt-2 bg-gradient-to-r from-purple-50 via-indigo-50 to-blue-50 border border-purple-200/80 p-2.5 rounded-xl shadow-2xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs uppercase font-extrabold text-purple-800 tracking-wider flex items-center gap-1">
                            <span>✨</span> Điểm rèn luyện cộng:
                          </span>
                          <span className="bg-purple-600 text-white font-extrabold text-xs sm:text-sm px-2.5 py-0.5 rounded-lg shadow-xs">
                            +{campaign.pointsParticipant} ĐRL
                          </span>
                        </div>
                      </div>

                      {/* Status indicator */}
                      {campaign.attended ? (
                        <div className="mt-2.5 flex items-center justify-center gap-1.5 py-1.5 px-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-700">
                          <CheckCircle2 size={16} />
                          <span>Đã tham gia điểm danh ({formatDateToDDMMYYYY(campaign.scannedAt || Date.now())})</span>
                        </div>
                      ) : (
                        <div className="mt-2.5 text-center py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600">
                          📌 Quét mã QR tại sự kiện để tích lũy điểm rèn luyện
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {selectedActivity && (
        <div className="absolute inset-0 bg-black/60 z-50 flex flex-col items-center pt-10 pb-4 px-4 overflow-y-auto">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center p-4 border-b border-slate-100 shrink-0">
              <h3 className="font-bold text-slate-800 text-sm sm:text-base">{selectedActivity.name}</h3>
              <button onClick={() => setSelectedActivity(null)} className="p-1 hover:bg-slate-100 rounded-full text-slate-500 cursor-pointer">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
              {selectedActivity.imageUrl && (
                <div className="w-full rounded-xl overflow-hidden mb-4 bg-slate-50 flex items-center justify-center max-h-64 border border-slate-100 p-2">
                  <img 
                    src={selectedActivity.imageUrl} 
                    alt={selectedActivity.name} 
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'https://placehold.co/600x400/f8fafc/94a3b8?text=Image+Not+Found';
                    }}
                  />
                </div>
              )}
              
              <div className="space-y-3">
                <div className="bg-gradient-to-r from-purple-50 to-indigo-50 p-3.5 rounded-2xl border border-purple-200 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs uppercase font-extrabold text-purple-800">Điểm Rèn Luyện (ĐRL)</span>
                    <span className="font-extrabold text-purple-700 text-sm sm:text-base bg-white border border-purple-200 px-3 py-1 rounded-xl shadow-2xs">
                      +{selectedActivity.pointsParticipant} ĐRL
                    </span>
                  </div>
                </div>

                <div className="bg-blue-50/70 p-3.5 rounded-2xl border border-blue-100 space-y-2 text-sm font-medium text-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 text-xs font-bold uppercase">📅 Thời gian bắt đầu:</span>
                    <span className="font-bold text-blue-900">{formatDateToDDMMYYYY(selectedActivity.startTime)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-blue-100/70 pt-2">
                    <span className="text-slate-500 text-xs font-bold uppercase">🏁 Thời gian kết thúc:</span>
                    <span className="font-bold text-red-700">{formatDateToDDMMYYYY(selectedActivity.endTime)}</span>
                  </div>
                </div>

                {selectedActivity.organizerDetails && selectedActivity.organizerDetails.filter(o => o.role === 'Trưởng ban' || o.role === 'Đồng Trưởng ban').length > 0 && (
                  <div className="bg-emerald-50/50 p-3 rounded-xl border border-emerald-100/50">
                    <h4 className="text-[10px] font-bold text-emerald-800 uppercase mb-2">Ban tổ chức đại diện</h4>
                    <div className="space-y-2">
                      {selectedActivity.organizerDetails.filter(o => o.role === 'Trưởng ban' || o.role === 'Đồng Trưởng ban').map((org, i) => (
                        <div key={i} className="flex justify-between items-center text-xs bg-white p-2 border border-slate-100 rounded-lg shadow-sm">
                           <span className="font-bold text-slate-700">{org.name} <span className="text-[10px] font-normal text-slate-500 ml-1">({org.mssv})</span></span>
                           <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded">{org.role}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase mb-2 px-1">Nội dung hoạt động</h4>
                  <div className="text-xs sm:text-sm text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-xl whitespace-pre-wrap">
                    {selectedActivity.description || 'Chưa có thông tin mô tả chi tiết cho hoạt động này.'}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="p-4 border-t border-slate-100 shrink-0">
              {selectedActivity.attended ? (
                <div className="w-full py-3 text-xs sm:text-sm rounded-xl font-bold uppercase border border-emerald-200 text-emerald-700 bg-emerald-50 flex items-center justify-center gap-2">
                  <CheckCircle2 size={18} /> Đã hoàn thành điểm danh tham gia
                </div>
              ) : (
                <div className="w-full py-3 text-xs sm:text-sm rounded-xl font-bold uppercase bg-blue-50 text-blue-800 border border-blue-200 flex items-center justify-center gap-2">
                  📌 Quét mã QR tại sự kiện để ghi nhận điểm danh
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showNotificationModal && (
        <div className="absolute inset-0 bg-black/60 z-50 flex flex-col items-center pt-20 pb-4 px-4 overflow-y-auto">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[80vh]">
            <div className="flex justify-between items-center p-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">Tất cả thông báo</h3>
              <button onClick={() => { setShowNotificationModal(false); markAllAsRead(); }} className="p-1 hover:bg-slate-100 rounded-full text-slate-500">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
              {notifications.length === 0 ? (
                <p className="text-center text-slate-500 text-xs italic py-8">Không có thông báo nào.</p>
              ) : (
                notifications.map(n => (
                  <div key={n.id} className="bg-white border border-slate-200 p-3 rounded-xl shadow-sm relative">
                    {!dismissedNotifs.includes(n.id) && (
                      <span className="absolute top-3 right-3 w-2 h-2 bg-red-500 rounded-full"></span>
                    )}
                    <div className="text-[11px] font-bold text-slate-800 pr-4">{n.title}</div>
                    <div className="text-[10px] text-slate-600 mt-1">{n.message}</div>
                    <div className="text-[8px] text-slate-400 mt-2">{new Date(n.createdAt).toLocaleString('vi-VN')}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {showPasswordModal && (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-xl p-5 border border-slate-100">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-slate-800 flex items-center">
                <KeyRound size={16} className="mr-2 text-[#1d4ed8]" /> Đổi mật khẩu
              </h3>
              <button disabled={passwordSuccess} onClick={() => setShowPasswordModal(false)} className="p-1 hover:bg-slate-100 rounded-full text-slate-500">
                <X size={18} />
              </button>
            </div>

            {passwordSuccess ? (
              <div className="flex flex-col items-center justify-center py-6">
                <CheckCircle2 size={40} className="text-emerald-500 mb-3" />
                <p className="text-sm font-bold text-emerald-600">Đổi mật khẩu thành công!</p>
                <p className="text-xs text-slate-500 mt-1">Đang đóng...</p>
              </div>
            ) : (
              <form onSubmit={handlePasswordSubmit} className="space-y-3">
                {passwordError && (
                  <div className="text-[10px] text-red-600 bg-red-50 p-2 rounded-lg border border-red-100">
                    {passwordError}
                  </div>
                )}
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase mb-1 block">Mật khẩu mới</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:outline-none focus:border-[#1d4ed8] focus:ring-1 focus:ring-[#1d4ed8] bg-slate-50"
                    placeholder="Tối thiểu 6 ký tự"
                    required
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase mb-1 block">Xác nhận mật khẩu</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:outline-none focus:border-[#1d4ed8] focus:ring-1 focus:ring-[#1d4ed8] bg-slate-50"
                    placeholder="Nhập lại mật khẩu mới"
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-[#1d4ed8] hover:bg-blue-800 text-white font-bold py-2.5 rounded-xl transition text-xs mt-2"
                >
                  Xác nhận đổi
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {showAvatarModal && (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-xl p-5 border border-slate-100">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-slate-800 flex items-center">
                <Camera size={18} className="mr-2 text-[#1d4ed8]" /> Thay đổi ảnh đại diện
              </h3>
              <button onClick={() => { setShowAvatarModal(false); setPreviewAvatar(null); }} className="p-1 hover:bg-slate-100 rounded-full text-slate-500">
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col items-center py-2 space-y-4">
              <div className="relative group">
                <img 
                  src={previewAvatar || currentUser?.avatar || "https://upload.wikimedia.org/wikipedia/vi/thumb/9/90/Huy_Hi%E1%BB%87u_%C4%90o%C3%A0n.png/1200px-Huy_Hi%E1%BB%87u_%C4%90o%C3%A0n.png"} 
                  alt="Avatar Preview" 
                  className="w-28 h-28 rounded-full object-cover border-4 border-[#1d4ed8] shadow-md bg-slate-100"
                />
                <label className="absolute bottom-1 right-1 bg-[#1d4ed8] text-white p-2 rounded-full cursor-pointer hover:bg-blue-800 transition shadow-lg border-2 border-white">
                  <Camera size={16} />
                  <input 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          setPreviewAvatar(ev.target?.result as string);
                        };
                        reader.readAsDataURL(file);
                      }
                    }} 
                  />
                </label>
              </div>

              <div className="text-center">
                <p className="text-xs text-slate-500">Tải ảnh đại diện mới từ thiết bị của bạn (tương tự Facebook)</p>
              </div>

              <label className="w-full bg-blue-50 border border-blue-200 hover:bg-blue-100 text-[#1d4ed8] font-bold py-2.5 rounded-xl transition text-xs flex items-center justify-center cursor-pointer shadow-sm">
                <Upload size={14} className="mr-2" /> Chọn ảnh từ thiết bị
                <input 
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        setPreviewAvatar(ev.target?.result as string);
                      };
                      reader.readAsDataURL(file);
                    }
                  }} 
                />
              </label>

              {previewAvatar && (
                <button
                  onClick={async () => {
                    try {
                      await updateUserAvatar(previewAvatar);
                      setShowAvatarModal(false);
                      setPreviewAvatar(null);
                      alert('Cập nhật ảnh đại diện thành công!');
                      fetchBchMembers();
                    } catch (err) {
                      console.error(err);
                      alert('Không thể lưu ảnh đại diện.');
                    }
                  }}
                  className="w-full bg-[#1d4ed8] hover:bg-blue-800 text-white font-bold py-2.5 rounded-xl transition text-xs shadow-md"
                >
                  Lưu ảnh đại diện
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
