import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { User, CreditCard, Users, CheckCircle2, AlertCircle } from 'lucide-react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';

const DEFAULT_BRANCHES = [
  '25ICD1', '25DTV1', '25DTV2', '25DTV_DKD',
  '26ICD1', '26DTV1', '26DTV2', '26DTV_DKD'
];

export default function OnboardingModal() {
  const { currentUser, updateUserProfile } = useAuth();
  
  const [name, setName] = useState(currentUser?.name || currentUser?.displayName || '');
  const [mssv, setMssv] = useState(currentUser?.mssv || '');
  const [branch, setBranch] = useState(currentUser?.branch || '');
  const [branchesList, setBranchesList] = useState<string[]>(DEFAULT_BRANCHES);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchBranches = async () => {
      try {
        const q = query(collection(db, 'branches'), orderBy('name', 'asc'));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          const list = snapshot.docs.map(doc => doc.data().name || doc.id).filter(Boolean);
          // Merge with defaults to ensure no loss
          const merged = Array.from(new Set([...list, ...DEFAULT_BRANCHES]));
          setBranchesList(merged);
        }
      } catch (err) {
        console.error('Error fetching branches:', err);
      }
    };
    fetchBranches();
  }, []);

  // If user is admin/chidoan or collective account or already completed info, don't show modal
  if (!currentUser) return null;
  const userEmail = (currentUser.email || '').toLowerCase();
  const isAdminOrBch = 
    currentUser.role === 'admin' || 
    currentUser.role === 'chidoan' || 
    userEmail === 'dkdtvt.hcmus@gmail.com' || 
    userEmail.startsWith('chidoan') ||
    userEmail.startsWith('cd') ||
    userEmail.includes('admin');

  if (isAdminOrBch) return null;
  if (currentUser.mssv && currentUser.branch && currentUser.name) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      return setError('Vui lòng nhập Họ và tên');
    }
    if (!mssv.trim()) {
      return setError('Vui lòng nhập Mã số sinh viên (MSSV)');
    }
    if (!branch.trim()) {
      return setError('Vui lòng chọn Chi đoàn');
    }

    setSaving(true);
    try {
      await updateUserProfile({
        name: name.trim(),
        mssv: mssv.trim(),
        branch: branch.trim(),
      });
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Cập nhật thông tin thất bại. Vui lòng thử lại.');
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
          <h2 className="text-lg font-bold text-slate-800">Cập nhật thông tin Đoàn viên</h2>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            Để liên kết với dữ liệu điểm danh và thông tin cá nhân trên hệ thống, vui lòng bổ sung đầy đủ thông tin bên dưới.
          </p>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 p-3 rounded-xl flex items-start text-red-600 border border-red-100 text-[11px] leading-relaxed">
            <AlertCircle size={14} className="mr-2 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase ml-1">
              Họ và tên Đoàn viên
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <User size={16} />
              </div>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all text-xs text-slate-800 font-medium"
                placeholder="Nguyễn Văn A"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase ml-1">
              Mã số sinh viên (MSSV)
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <CreditCard size={16} />
              </div>
              <input
                type="text"
                required
                value={mssv}
                onChange={(e) => setMssv(e.target.value)}
                className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all text-xs text-slate-800 font-medium"
                placeholder="Ví dụ: 22120001"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase ml-1">
              Chi đoàn trực thuộc
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Users size={16} />
              </div>
              <select
                required
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                className="w-full pl-10 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all text-xs text-slate-800 font-medium appearance-none cursor-pointer"
              >
                <option value="">-- Chọn Chi đoàn --</option>
                {branchesList.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold uppercase tracking-wide text-xs drop-shadow-md transition active:scale-[0.98] disabled:opacity-70 mt-2 cursor-pointer"
          >
            {saving ? 'Đang lưu...' : 'Hoàn tất & Liên kết tài khoản'}
          </button>
        </form>
      </div>
    </div>
  );
}
