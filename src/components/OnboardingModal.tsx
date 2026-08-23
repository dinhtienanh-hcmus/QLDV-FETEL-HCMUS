import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { CreditCard, CheckCircle2, AlertCircle, Search, RefreshCw, User, Users } from 'lucide-react';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface FoundProfile {
  name: string;
  mssv: string;
  branch: string;
}

export default function OnboardingModal() {
  const { currentUser, updateUserProfile } = useAuth();
  
  const [mssv, setMssv] = useState('');
  const [searching, setSearching] = useState(false);
  const [foundProfile, setFoundProfile] = useState<FoundProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // If user is admin/chidoan or collective account or already completed info, don't show modal
  if (!currentUser) return null;
  const userEmail = (currentUser.email || '').toLowerCase();
  const isAdminOrBch = 
    currentUser.role === 'admin' || 
    currentUser.role === 'chidoan' || 
    userEmail === 'dkdtvt.hcmus@gmail.com' || 
    userEmail.endsWith('@chidoan.fetel') ||
    userEmail.includes('chidoan') ||
    userEmail.includes('admin') ||
    userEmail.endsWith('.fetel') ||
    userEmail.includes('.fetel@') ||
    userEmail.startsWith('cd');

  if (isAdminOrBch) return null;
  if (currentUser.mssv && currentUser.branch && currentUser.name) return null;

  const handleSearchProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const searchMssv = mssv.trim().toLowerCase();
    if (!searchMssv) {
      return setError('Vui lòng nhập Mã số sinh viên (MSSV)');
    }

    setSearching(true);
    setError('');
    setFoundProfile(null);

    try {
      // 1. Try to fetch direct document `profile_${mssv}` (format used by CSV Bulk Import)
      const docRef = doc(db, 'users', `profile_${searchMssv}`);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const d = docSnap.data();
        setFoundProfile({
          name: d.name || 'Không rõ họ tên',
          branch: d.branch || 'Chưa phân chi đoàn',
          mssv: d.mssv || mssv.trim()
        });
        return;
      }

      // 2. Query users collection where mssv field matches
      const q = query(collection(db, 'users'), where('mssv', '==', mssv.trim()));
      const querySnap = await getDocs(q);
      if (!querySnap.empty) {
        const d = querySnap.docs[0].data();
        setFoundProfile({
          name: d.name || 'Không rõ họ tên',
          branch: d.branch || 'Chưa phân chi đoàn',
          mssv: d.mssv || mssv.trim()
        });
        return;
      }

      // 3. Query users collection where username matches
      const q2 = query(collection(db, 'users'), where('username', '==', mssv.trim()));
      const querySnap2 = await getDocs(q2);
      if (!querySnap2.empty) {
        const d = querySnap2.docs[0].data();
        setFoundProfile({
          name: d.name || 'Không rõ họ tên',
          branch: d.branch || 'Chưa phân chi đoàn',
          mssv: d.mssv || mssv.trim()
        });
        return;
      }

      setError('Không tìm thấy MSSV này trong danh sách đã được import. Vui lòng kiểm tra lại hoặc liên hệ Chi đoàn / Đoàn khoa để được hỗ trợ.');
    } catch (err: any) {
      console.error('Error finding profile:', err);
      setError('Đã xảy ra lỗi khi tìm kiếm thông tin. Vui lòng thử lại.');
    } finally {
      setSearching(false);
    }
  };

  const handleConfirmProfile = async () => {
    if (!foundProfile) return;
    setSaving(true);
    setError('');
    try {
      await updateUserProfile({
        name: foundProfile.name,
        mssv: foundProfile.mssv,
        branch: foundProfile.branch,
      });
    } catch (err: any) {
      console.error('Error linking profile:', err);
      setError(err.message || 'Liên kết tài khoản thất bại. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-inner">
            <CheckCircle2 size={24} />
          </div>
          <h2 className="text-lg font-bold text-slate-800">Liên kết tài khoản Đoàn viên</h2>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            Ở lần đăng nhập đầu tiên, vui lòng nhập MSSV để hệ thống tự động đối chiếu, điền Họ tên và Chi đoàn trực thuộc từ danh sách lớp.
          </p>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 p-3 rounded-xl flex items-start text-red-600 border border-red-100 text-[11px] leading-relaxed">
            <AlertCircle size={14} className="mr-2 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {!foundProfile ? (
          <form onSubmit={handleSearchProfile} className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase ml-1">
                Mã số sinh viên (MSSV) của bạn
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <CreditCard size={16} />
                </div>
                <input
                  type="text"
                  required
                  disabled={searching}
                  value={mssv}
                  onChange={(e) => setMssv(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all text-xs text-slate-800 font-bold"
                  placeholder="Ví dụ: 22120001"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={searching}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold uppercase tracking-wide text-xs drop-shadow-md transition active:scale-[0.98] disabled:opacity-70 mt-2 cursor-pointer flex items-center justify-center gap-1.5"
            >
              {searching ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  Đang tìm kiếm hồ sơ...
                </>
              ) : (
                <>
                  <Search size={14} />
                  Tìm kiếm thông tin
                </>
              )}
            </button>
          </form>
        ) : (
          <div className="space-y-5">
            <div className="bg-gradient-to-r from-emerald-50/50 to-teal-50/50 border border-emerald-200 p-4 rounded-2xl">
              <span className="text-[10px] font-extrabold text-emerald-800 uppercase tracking-wider block mb-2">
                ✨ Đã tìm thấy thông tin phù hợp:
              </span>
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2">
                  <User size={14} className="text-emerald-600 shrink-0" />
                  <span className="text-slate-500 font-medium">Họ tên:</span>
                  <span className="font-bold text-slate-800">{foundProfile.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <CreditCard size={14} className="text-emerald-600 shrink-0" />
                  <span className="text-slate-500 font-medium">MSSV:</span>
                  <span className="font-extrabold text-slate-800">{foundProfile.mssv}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Users size={14} className="text-emerald-600 shrink-0" />
                  <span className="text-slate-500 font-medium">Chi đoàn:</span>
                  <span className="font-extrabold text-blue-800 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">{foundProfile.branch}</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <button
                onClick={handleConfirmProfile}
                disabled={saving}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl font-bold uppercase tracking-wide text-xs drop-shadow-md transition active:scale-[0.98] disabled:opacity-70 cursor-pointer flex items-center justify-center gap-1.5"
              >
                {saving ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    Đang liên kết tài khoản...
                  </>
                ) : (
                  'Xác nhận & Hoàn tất liên kết'
                )}
              </button>
              
              <button
                onClick={() => {
                  setFoundProfile(null);
                  setError('');
                }}
                disabled={saving}
                className="w-full text-slate-500 hover:text-slate-800 hover:bg-slate-50 py-2 rounded-xl text-center font-bold text-xs transition cursor-pointer"
              >
                Nhập lại MSSV khác
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
