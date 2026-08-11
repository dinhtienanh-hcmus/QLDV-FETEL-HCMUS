import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, orderBy, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import QRCode from 'react-qr-code';
import { 
  QrCode, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Users, 
  UserCheck, 
  Search, 
  Trash2, 
  ListPlus, 
  Clock, 
  Sparkles, 
  X
} from 'lucide-react';

interface Activity {
  id: string;
  name: string;
  targetAudience: string;
  startTime?: string;
  location?: string;
  branch?: string;
  branches?: string[];
  creatorId?: string;
}

interface AttendedStudent {
  id: string;
  userId: string;
  name: string;
  mssv: string;
  branch: string;
  scannedAt: number;
}

interface ProcessResult {
  totalParsed: number;
  successCount: number;
  alreadyAttendedCount: number;
  notFoundList: string[];
}

export default function ScanScreen() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedActivity, setSelectedActivity] = useState<string>('');
  
  // Dynamic QR Code states (10 seconds timer)
  const [qrToken, setQrToken] = useState<number>(Date.now());
  const [timeLeft, setTimeLeft] = useState<number>(10);

  // Manual & Bulk Student Entry states
  const [inputTab, setInputTab] = useState<'single' | 'bulk'>('single');
  const [manualMSSV, setManualMSSV] = useState('');
  const [bulkMSSVText, setBulkMSSVText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [processResult, setProcessResult] = useState<ProcessResult | null>(null);

  // Attended students list states
  const [attendedList, setAttendedList] = useState<AttendedStudent[]>([]);
  const [loadingAttended, setLoadingAttended] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const { currentUser } = useAuth();

  // 1. Real-time activities listener
  useEffect(() => {
    if (!currentUser?.uid) return;
    const q = query(collection(db, 'activities'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const acts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Activity));
      
      const filtered = acts.filter(a => {
        // Tài khoản Đoàn Khoa (admin): được quét tất cả hoạt động
        if (currentUser?.role === 'admin') {
          return true;
        }
        // Tài khoản Chi đoàn: chỉ chọn các hoạt động do Chi đoàn mình tổ chức / dành cho Chi đoàn
        const userBranch = currentUser?.branch;
        if (!userBranch) return false;

        const isBranchOrganizer = a.branch === userBranch || 
                                  (Array.isArray(a.branches) && a.branches.includes(userBranch));
        const isTargetBranch = a.targetAudience === userBranch;
        const isCreator = a.creatorId === currentUser?.uid;

        return isBranchOrganizer || isTargetBranch || isCreator;
      });
      
      setActivities(filtered);
      setSelectedActivity(prev => {
        if (prev && filtered.some(a => a.id === prev)) return prev;
        return filtered.length > 0 ? filtered[0].id : '';
      });
    }, (err) => {
      console.error("Error listening to activities:", err);
    });

    return () => unsubscribe();
  }, [currentUser?.uid, currentUser?.role, currentUser?.branch]);

  // 10-second timer for Dynamic QR Code
  useEffect(() => {
    if (!selectedActivity) return;

    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          setQrToken(Date.now());
          return 10;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [selectedActivity]);

  // 2. Real-time attended list listener whenever selectedActivity changes
  useEffect(() => {
    if (!selectedActivity) {
      setAttendedList([]);
      return;
    }

    setQrToken(Date.now());
    setTimeLeft(10);
    setLoadingAttended(true);

    let unsubReg: (() => void) | null = null;

    const setupListener = async () => {
      try {
        // Fetch users map once for name/mssv lookup
        const usersSnap = await getDocs(collection(db, 'users'));
        const userMapById = new Map<string, { name: string; mssv: string; branch: string }>();
        usersSnap.forEach(uDoc => {
          const data = uDoc.data();
          userMapById.set(uDoc.id, {
            name: data.name || 'Đoàn viên',
            mssv: data.mssv || '---',
            branch: data.branch || 'N/A'
          });
        });

        // Listen in real-time to registrations
        const regRef = collection(db, 'activities', selectedActivity, 'registrations');
        unsubReg = onSnapshot(regRef, (regSnap) => {
          const list: AttendedStudent[] = [];
          regSnap.forEach(rDoc => {
            const rData = rDoc.data();
            if (rData.status === 'attended') {
              const uInfo = userMapById.get(rDoc.id) || { name: 'Chưa cập nhật', mssv: '---', branch: '---' };
              list.push({
                id: rDoc.id,
                userId: rDoc.id,
                name: uInfo.name,
                mssv: uInfo.mssv,
                branch: uInfo.branch,
                scannedAt: rData.scannedAt || Date.now()
              });
            }
          });

          list.sort((a, b) => b.scannedAt - a.scannedAt);
          setAttendedList(list);
          setLoadingAttended(false);
        }, (err) => {
          console.error("Error listening to registrations:", err);
          setLoadingAttended(false);
        });

      } catch (err) {
        console.error("Error setting up registration listener:", err);
        setLoadingAttended(false);
      }
    };

    setupListener();

    return () => {
      if (unsubReg) unsubReg();
    };
  }, [selectedActivity]);

  const handleRefreshQR = () => {
    setQrToken(Date.now());
    setTimeLeft(10);
  };

  const handleProcessMSSVs = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedActivity) {
      alert("Vui lòng chọn hoạt động trước khi điểm danh!");
      return;
    }

    const rawInput = inputTab === 'single' ? manualMSSV : bulkMSSVText;
    const cleanList: string[] = Array.from(
      new Set(
        rawInput
          .split(/[\s,;\n\r]+/)
          .map((s: string) => s.trim().toUpperCase())
          .filter(Boolean)
      )
    );

    if (cleanList.length === 0) {
      alert("Vui lòng nhập ít nhất một MSSV!");
      return;
    }

    setIsSubmitting(true);
    let successCount = 0;
    let alreadyAttendedCount = 0;
    const notFoundList: string[] = [];

    try {
      // 1. Get all users for MSSV matching
      const usersSnap = await getDocs(collection(db, 'users'));
      const userMapByMssv = new Map<string, { id: string; name: string; mssv: string; branch: string }>();
      usersSnap.forEach(uDoc => {
        const data = uDoc.data();
        if (data.mssv) {
          userMapByMssv.set(String(data.mssv).trim().toUpperCase(), {
            id: uDoc.id,
            name: data.name || 'Đoàn viên',
            mssv: data.mssv,
            branch: data.branch || 'N/A'
          });
        }
      });

      // 2. Fetch existing attended user IDs
      const regSnap = await getDocs(collection(db, 'activities', selectedActivity, 'registrations'));
      const attendedUserIds = new Set<string>();
      regSnap.forEach(rDoc => {
        if (rDoc.data().status === 'attended') {
          attendedUserIds.add(rDoc.id);
        }
      });

      // 3. Process each MSSV in input list
      for (const mssv of cleanList) {
        const matchedUser = userMapByMssv.get(mssv);
        if (!matchedUser) {
          notFoundList.push(mssv);
          continue;
        }

        if (attendedUserIds.has(matchedUser.id)) {
          alreadyAttendedCount++;
        } else {
          const regRef = doc(db, 'activities', selectedActivity, 'registrations', matchedUser.id);
          await setDoc(regRef, {
            userId: matchedUser.id,
            status: 'attended',
            scannedAt: Date.now(),
            scannedBy: currentUser?.uid || 'admin'
          }, { merge: true });
          
          attendedUserIds.add(matchedUser.id);
          successCount++;
        }
      }

      setProcessResult({
        totalParsed: cleanList.length,
        successCount,
        alreadyAttendedCount,
        notFoundList
      });

      setManualMSSV('');
      setBulkMSSVText('');
    } catch (err) {
      console.error("Error processing attendance:", err);
      alert("Lỗi hệ thống khi ghi nhận điểm danh.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteAttendance = async (userId: string, name: string) => {
    if (!window.confirm(`Bạn có chắc muốn hủy điểm danh của sinh viên ${name}?`)) return;
    try {
      await deleteDoc(doc(db, 'activities', selectedActivity, 'registrations', userId));
      setAttendedList(prev => prev.filter(item => item.userId !== userId));
    } catch (err) {
      console.error("Error deleting attendance:", err);
      alert("Không thể hủy điểm danh.");
    }
  };

  const currentActivityObj = activities.find(a => a.id === selectedActivity);

  const filteredAttendedList = attendedList.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.mssv.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.branch.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const qrPayload = selectedActivity 
    ? JSON.stringify({
        activityId: selectedActivity,
        activityName: currentActivityObj?.name || '',
        token: qrToken,
        updatedAt: new Date(qrToken).toISOString()
      })
    : '';

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="bg-emerald-700 text-white p-5 pt-8 shrink-0 shadow-md">
        <div className="flex items-center space-x-2">
          <QrCode className="w-6 h-6 text-emerald-200" />
          <h2 className="text-lg font-bold">Mã QR & Điểm danh Hoạt động</h2>
        </div>
        <p className="text-xs text-emerald-100 opacity-80 mt-1">
          Mã QR tự động đổi sau mỗi 10s và quản lý danh sách sinh viên tham gia
        </p>
      </div>

      <div className="flex-1 p-4 md:p-6 space-y-6 overflow-y-auto pb-12">
        {/* Activity Selection Card */}
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
          <label className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2 block flex items-center">
            <Sparkles size={14} className="mr-1.5 text-emerald-600" />
            Chọn hoạt động điểm danh
          </label>
          <select 
            className="w-full text-sm p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 font-semibold text-slate-800"
            value={selectedActivity} 
            onChange={e => setSelectedActivity(e.target.value)}
          >
            <option value="" disabled>-- Chọn hoạt động --</option>
            {activities.map(act => (
              <option key={act.id} value={act.id}>
                {act.name} ({act.targetAudience === 'all' ? 'Toàn khoa' : `Chi đoàn ${act.targetAudience}`})
              </option>
            ))}
          </select>

          {currentActivityObj && (
            <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-lg font-medium border border-emerald-100">
                Đối tượng: {currentActivityObj.targetAudience === 'all' ? 'Toàn khoa' : `Chi đoàn ${currentActivityObj.targetAudience}`}
              </span>
              {currentActivityObj.location && (
                <span className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg font-medium">
                  📍 {currentActivityObj.location}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Grid: Dynamic QR Code & Manual Input */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Dynamic QR Code Box */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center text-center justify-between">
            <div className="w-full flex items-center justify-between mb-4">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center">
                <QrCode size={16} className="mr-1.5 text-emerald-600" />
                Mã QR Điểm danh (10s/lần)
              </span>
              <button
                type="button"
                onClick={handleRefreshQR}
                className="flex items-center space-x-1 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1.5 rounded-lg border border-emerald-200 transition cursor-pointer"
                title="Tạo mã QR mới ngay lập tức"
              >
                <RefreshCw size={13} className="animate-spin-slow" />
                <span>Đổi mã ngay</span>
              </button>
            </div>

            {selectedActivity ? (
              <div className="flex flex-col items-center my-2 w-full">
                {/* QR Display Frame */}
                <div className="p-4 bg-white border-2 border-emerald-500/20 rounded-2xl shadow-md relative group">
                  <QRCode value={qrPayload} size={200} fgColor="#0f172a" level="Q" />
                </div>

                {/* Timer Bar & Badge */}
                <div className="w-full max-w-xs mt-4">
                  <div className="flex justify-between items-center text-xs font-bold mb-1.5 text-slate-600">
                    <span className="flex items-center text-emerald-700">
                      <Clock size={13} className="mr-1" /> Tự động đổi mã sau:
                    </span>
                    <span className="text-emerald-700 font-mono text-sm bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                      {String(timeLeft).padStart(2, '0')}s
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
                    <div 
                      className="bg-emerald-600 h-full transition-all duration-1000 ease-linear rounded-full"
                      style={{ width: `${(timeLeft / 10) * 100}%` }}
                    />
                  </div>
                </div>

                <p className="text-[11px] text-slate-500 mt-4 leading-relaxed max-w-xs">
                  Hiển thị màn hình/máy chiếu này để sinh viên quét mã xác nhận tham gia hoạt động. Mã được làm mới tự động để tránh chia sẻ trái phép.
                </p>
              </div>
            ) : (
              <div className="py-12 text-slate-400 text-xs flex flex-col items-center">
                <QrCode size={48} className="text-slate-300 mb-2" />
                <span>Vui lòng chọn một hoạt động ở trên để hiển thị mã QR</span>
              </div>
            )}
          </div>

          {/* Right: Manual / Bulk Input Box */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center">
                <ListPlus size={16} className="mr-1.5 text-emerald-600" />
                Nhập danh sách sinh viên
              </span>

              {/* Tab Switcher */}
              <div className="flex bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setInputTab('single')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                    inputTab === 'single'
                      ? 'bg-white text-emerald-700 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  1 MSSV
                </button>
                <button
                  type="button"
                  onClick={() => setInputTab('bulk')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                    inputTab === 'bulk'
                      ? 'bg-white text-emerald-700 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Nhiều MSSV
                </button>
              </div>
            </div>

            <form onSubmit={handleProcessMSSVs} className="flex-1 flex flex-col justify-between space-y-4">
              {inputTab === 'single' ? (
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1.5 block">
                    Nhập MSSV sinh viên cần điểm danh:
                  </label>
                  <input
                    type="text"
                    placeholder="Ví dụ: 21120001"
                    className="w-full text-sm p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 font-semibold"
                    value={manualMSSV}
                    onChange={e => setManualMSSV(e.target.value)}
                  />
                  <p className="text-[11px] text-slate-400 mt-2">
                    Nhập đúng mã số sinh viên để ghi nhận tham gia nhanh.
                  </p>
                </div>
              ) : (
                <div className="flex-1 flex flex-col">
                  <label className="text-xs font-medium text-slate-600 mb-1.5 block">
                    Dán danh sách MSSV (phân cách bằng dấu phẩy, khoảng trắng hoặc xuống dòng):
                  </label>
                  <textarea
                    rows={5}
                    placeholder={`21120001\n21120002\n21120003, 21120004`}
                    className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 font-mono resize-none flex-1"
                    value={bulkMSSVText}
                    onChange={e => setBulkMSSVText(e.target.value)}
                  />
                  <p className="text-[11px] text-slate-400 mt-2">
                    Có thể copy trực tiếp từ Excel hoặc danh sách điểm danh lớp.
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting || !selectedActivity}
                className="w-full py-3 bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-md transition flex items-center justify-center space-x-2 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw size={15} className="animate-spin" />
                    <span>Đang xử lý điểm danh...</span>
                  </>
                ) : (
                  <>
                    <UserCheck size={16} />
                    <span>
                      {inputTab === 'single' ? 'Ghi nhận điểm danh' : 'Ghi nhận danh sách sinh viên'}
                    </span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Process Results Modal */}
        {processResult && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-in zoom-in duration-150">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="font-bold text-slate-800 text-base flex items-center text-emerald-700">
                  <CheckCircle2 size={20} className="mr-2" /> Kết quả ghi nhận điểm danh
                </h3>
                <button
                  onClick={() => setProcessResult(null)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="py-4 space-y-3 text-xs">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                    <div className="text-lg font-bold text-emerald-700">{processResult.successCount}</div>
                    <div className="text-[10px] text-emerald-800 font-medium">Thành công</div>
                  </div>
                  <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
                    <div className="text-lg font-bold text-blue-700">{processResult.alreadyAttendedCount}</div>
                    <div className="text-[10px] text-blue-800 font-medium">Đã có từ trước</div>
                  </div>
                  <div className="p-3 bg-amber-50 rounded-xl border border-amber-100">
                    <div className="text-lg font-bold text-amber-700">{processResult.notFoundList.length}</div>
                    <div className="text-[10px] text-amber-800 font-medium">Không tìm thấy</div>
                  </div>
                </div>

                {processResult.notFoundList.length > 0 && (
                  <div className="p-3 bg-red-50 rounded-xl border border-red-100 text-red-800">
                    <div className="font-bold mb-1 text-[11px] flex items-center">
                      <AlertCircle size={13} className="mr-1" /> MSSV không tìm thấy trong hệ thống:
                    </div>
                    <div className="font-mono text-[10px] bg-white p-2 rounded-lg border border-red-200 max-h-24 overflow-y-auto break-all">
                      {processResult.notFoundList.join(', ')}
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={() => setProcessResult(null)}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl text-xs transition cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        )}

        {/* Attended Students List Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center space-x-2">
              <Users size={18} className="text-emerald-600" />
              <h3 className="font-bold text-slate-800 text-sm">
                Danh sách tham gia ({attendedList.length} sinh viên)
              </h3>
            </div>

            <div className="relative w-full md:w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm tên, MSSV, chi đoàn..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            {loadingAttended ? (
              <div className="p-8 text-center text-xs text-slate-500 flex items-center justify-center space-x-2">
                <RefreshCw size={16} className="animate-spin text-emerald-600" />
                <span>Đang tải danh sách điểm danh...</span>
              </div>
            ) : filteredAttendedList.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 italic">
                {searchTerm ? 'Không tìm thấy kết quả phù hợp.' : 'Chưa có sinh viên nào điểm danh cho hoạt động này.'}
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100/70 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4 w-12 text-center">STT</th>
                    <th className="py-3 px-4">Họ và tên</th>
                    <th className="py-3 px-4">MSSV</th>
                    <th className="py-3 px-4">Chi đoàn</th>
                    <th className="py-3 px-4">Thời gian</th>
                    <th className="py-3 px-4 text-center w-16">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAttendedList.map((st, index) => (
                    <tr key={st.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-2.5 px-4 text-center font-medium text-slate-400">{index + 1}</td>
                      <td className="py-2.5 px-4 font-bold text-slate-800">{st.name}</td>
                      <td className="py-2.5 px-4 font-mono font-medium text-slate-600">{st.mssv}</td>
                      <td className="py-2.5 px-4">
                        <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-medium text-[11px]">
                          {st.branch}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-slate-500 text-[11px]">
                        {new Date(st.scannedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteAttendance(st.userId, st.name)}
                          className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition cursor-pointer"
                          title="Hủy điểm danh"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
