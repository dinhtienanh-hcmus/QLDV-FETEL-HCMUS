import React, { useState, useEffect } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { collection, query, getDocs, doc, setDoc, getDoc, orderBy } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { Lock, AlertCircle, User as UserIcon, LogIn, UserPlus, Users, CheckCircle2 } from 'lucide-react';

const DEFAULT_BRANCHES = [
  '25ICD1', '25DTV1', '25DTV2', '25DTV_DKD',
  '26ICD1', '26DTV1', '26DTV2', '26DTV_DKD'
];

export default function LoginScreen() {
  const [activeTab, setActiveTab] = useState<'doanvien' | 'bch'>('doanvien');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loginId, setLoginId] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('25ICD1');
  const [customBranch, setCustomBranch] = useState('');
  const [branchOptions, setBranchOptions] = useState<string[]>(DEFAULT_BRANCHES);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  // Chi đoàn Google Setup Modal states
  const [pendingGoogleUser, setPendingGoogleUser] = useState<any>(null);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [setupBranch, setSetupBranch] = useState('25ICD1');
  const [customSetupBranch, setCustomSetupBranch] = useState('');
  const [setupError, setSetupError] = useState('');
  const [setupLoading, setSetupLoading] = useState(false);

  useEffect(() => {
    const fetchBranches = async () => {
      try {
        const q = query(collection(db, 'branches'), orderBy('name', 'asc'));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const fetchedNames = snap.docs.map(d => d.data().name as string);
          const combined = Array.from(new Set([...fetchedNames, ...DEFAULT_BRANCHES]));
          setBranchOptions(combined);
        }
      } catch (err) {
        console.error('Error loading branches:', err);
      }
    };
    fetchBranches();
  }, []);

  const getEmail = (id: string) => {
    const trimmed = id.trim().toLowerCase();
    if (trimmed.includes('@')) return trimmed;
    
    if (trimmed === 'admin') {
      return 'dkdtvt.hcmus@gmail.com';
    }

    // Chi đoàn usernames (e.g. 25dtv1.fetel or 25dtv1)
    if (trimmed.endsWith('.fetel') || !/^\d+$/.test(trimmed)) {
      const uname = trimmed.endsWith('.fetel') ? trimmed : `${trimmed}.fetel`;
      return `${uname}@chidoan.fetel`;
    }
    
    // Map MSSV (toàn số)
    return `${trimmed}@student.hcmus.edu.vn`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      const email = getEmail(loginId);
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      console.error(err);
      let errMsg = err.message || 'Đã có lỗi xảy ra';
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        errMsg = 'Tài khoản hoặc mật khẩu không chính xác.';
      } else if (err.code === 'auth/wrong-password') {
        errMsg = 'Mật khẩu không chính xác.';
      }
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error(err);
      if (err.code !== 'auth/popup-closed-by-user') {
        setError(err.message || 'Đăng nhập Google thất bại');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignInForBranch = async () => {
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const userCred = await signInWithPopup(auth, provider);
      const user = userCred.user;

      // Check if user already has doc with chidoan or admin role
      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists()) {
        const data = userDocSnap.data();
        if (data.role === 'chidoan' || data.role === 'admin') {
          // Already assigned role Chi đoàn or Admin
          return;
        }
      }

      // Not assigned Chi đoàn role yet -> Open Branch Selection Modal
      setPendingGoogleUser(user);
      setShowSetupModal(true);
    } catch (err: any) {
      console.error(err);
      if (err.code !== 'auth/popup-closed-by-user') {
        setError(err.message || 'Đăng nhập Google thất bại');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmBranchSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingGoogleUser) return;

    setSetupError('');
    setSetupLoading(true);

    const finalBranch = (setupBranch === 'OTHER' ? customSetupBranch : setupBranch).trim();
    if (!finalBranch) {
      setSetupError('Vui lòng chọn hoặc nhập tên Chi đoàn.');
      setSetupLoading(false);
      return;
    }

    try {
      // 1. Check for duplicate branch
      const usersSnap = await getDocs(collection(db, 'users'));
      const searchBranchLower = finalBranch.toLowerCase().trim();
      const duplicate = usersSnap.docs.find(d => {
        if (d.id === pendingGoogleUser.uid) return false;
        const u = d.data();
        const uBranch = (u.branch || '').toLowerCase().trim();
        const uEmail = (u.email || u.authEmail || '').toLowerCase();
        return (u.role === 'chidoan' || uEmail.includes('chidoan')) && uBranch === searchBranchLower;
      });

      if (duplicate) {
        setSetupError(`Chi đoàn "${finalBranch}" đã có tài khoản quản lý trên hệ thống! Mỗi Chi đoàn chỉ được phép cấp 01 tài khoản Chi đoàn.`);
        setSetupLoading(false);
        return;
      }

      // 2. Grant Chi đoàn role to this Google account
      await setDoc(doc(db, 'users', pendingGoogleUser.uid), {
        email: pendingGoogleUser.email || '',
        authEmail: pendingGoogleUser.email || '',
        name: `BCH Chi đoàn ${finalBranch}`,
        role: 'chidoan',
        branch: finalBranch,
        committeeRole: 'Chi đoàn',
        createdAt: Date.now(),
        updatedAt: Date.now()
      }, { merge: true });

      setShowSetupModal(false);
      setPendingGoogleUser(null);
      window.location.reload();
    } catch (err: any) {
      console.error(err);
      setSetupError(err.message || 'Lỗi thiết lập tài khoản Chi đoàn.');
    } finally {
      setSetupLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!loginId) {
      return setError('Vui lòng nhập Email, MSSV hoặc tên tài khoản để nhận liên kết đặt lại mật khẩu.');
    }
    try {
      setMessage('');
      setError('');
      const email = getEmail(loginId);
      await sendPasswordResetEmail(auth, email);
      setMessage(`Đường dẫn đặt lại mật khẩu đã gửi đến ${email}. Vui lòng kiểm tra hộp thư (kể cả thư rác / Spam).`);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/user-not-found') {
        setError(`Không tìm thấy tài khoản với email ${getEmail(loginId)}.`);
      } else if (err.code === 'auth/invalid-email') {
        setError('Địa chỉ email không hợp lệ.');
      } else {
        setError(err.message || 'Không thể gửi email đặt lại mật khẩu.');
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 relative overflow-hidden">
      <div className="absolute top-0 w-full h-[40%] bg-[#1d4ed8] rounded-b-[40px] drop-shadow-xl z-0"></div>
      
      <div className="flex-1 px-6 z-10 flex flex-col justify-center py-8 no-scrollbar overflow-y-auto w-full max-w-md mx-auto">
        <div className="mb-6 text-center text-white mx-auto">
          <div className="bg-white/95 backdrop-blur-sm inline-flex items-center justify-center gap-3.5 px-4 py-2.5 rounded-[999px] shadow-xl mb-4 shadow-blue-900/20 border border-white/20">
             <div className="h-10 w-auto flex items-center justify-center">
                <img src="https://lh3.googleusercontent.com/d/1C0ixDWE5Sh1AsHpYt9PHKbxIcWAbAPUe" referrerPolicy="no-referrer" alt="Khoa Điển tử - Viễn thông" className="h-full w-auto object-contain drop-shadow-sm" />
             </div>
             <div className="h-10 w-10 flex items-center justify-center">
                <img src="https://lh3.googleusercontent.com/d/1m-QuYuCQoo8CzPFis0fBdKM2TNM49Yyg" referrerPolicy="no-referrer" alt="Đoàn Thanh Niên" className="h-full w-full object-contain drop-shadow-sm" />
             </div>
             <div className="h-10 w-10 flex items-center justify-center">
                <img src="https://lh3.googleusercontent.com/d/1FzS7uBuKIT4HkRkkq6h5lPc_XLh3RBEa" referrerPolicy="no-referrer" alt="Hội Sinh Viên" className="h-full w-full object-contain drop-shadow-sm" />
             </div>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">FETEL@HCMUS</h1>
          <p className="text-xs text-blue-100 mt-2 opacity-90 leading-relaxed font-medium">Sổ tay Đoàn viên - Hội viên trực tuyến</p>
        </div>

        <div className="bg-white rounded-3xl p-6 shadow-xl border border-slate-100">
          {/* Main Role Tabs */}
          <div className="flex bg-slate-100 p-1.5 rounded-2xl mb-6">
            <button
              type="button"
              onClick={() => { setActiveTab('doanvien'); setError(''); setMessage(''); }}
              className={`flex-1 py-2.5 px-3 text-xs font-bold rounded-xl transition-all ${activeTab === 'doanvien' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Đoàn viên / Sinh viên
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('bch'); setError(''); setMessage(''); }}
              className={`flex-1 py-2.5 px-3 text-xs font-bold rounded-xl transition-all ${activeTab === 'bch' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Chi đoàn / Admin
            </button>
          </div>

          {error && (
            <div className="mb-4 bg-red-50 p-3 rounded-xl flex items-start text-red-600 border border-red-100 text-[11px] leading-relaxed">
              <AlertCircle size={14} className="mr-2 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {message && (
            <div className="mb-4 bg-green-50 p-3 rounded-xl flex items-start text-green-700 border border-green-100 text-[11px] leading-relaxed">
              <span>{message}</span>
            </div>
          )}

          {activeTab === 'doanvien' ? (
            <div className="space-y-4">
              <div className="text-center py-2">
                <h2 className="text-base font-bold text-slate-800">Cổng đăng nhập Đoàn viên</h2>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                  Đoàn viên đăng nhập trực tiếp bằng <strong>Gmail cá nhân</strong>. Không cần sử dụng email sinh viên HCMUS.
                </p>
              </div>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3.5 rounded-xl font-bold text-xs transition active:scale-[0.98] disabled:opacity-70 flex justify-center items-center gap-2 shadow-md shadow-blue-500/20"
              >
                <svg className="w-4 h-4 bg-white rounded-full p-0.5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                Đăng nhập nhanh bằng Google
              </button>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-[10px] text-slate-500 leading-normal">
                💡 <strong>Lưu ý:</strong> Ở lần đăng nhập đầu tiên, hệ thống sẽ chỉ yêu cầu bạn nhập <strong>MSSV</strong> để tự động tìm kiếm và liên kết chính xác hồ sơ đã import.
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-center py-1">
                <h2 className="text-base font-bold text-slate-800">Cổng Quản lý Chi đoàn & Admin</h2>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                  Đăng nhập nhanh bằng <strong>Google</strong> để quản lý Chi đoàn của bạn.
                </p>
              </div>

              <button
                type="button"
                onClick={handleGoogleSignInForBranch}
                disabled={loading}
                className="w-full bg-[#1d4ed8] hover:bg-blue-800 text-white py-3.5 rounded-xl font-bold text-xs transition active:scale-[0.98] disabled:opacity-70 flex justify-center items-center gap-2 shadow-md shadow-blue-600/20"
              >
                <svg className="w-4 h-4 bg-white rounded-full p-0.5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                Đăng nhập bằng Google (Chi đoàn)
              </button>

              <div className="relative my-3 flex items-center justify-center">
                <div className="border-t border-slate-200 w-full"></div>
                <span className="bg-white px-3 text-[10px] text-slate-400 uppercase font-semibold relative">hoặc đăng nhập bằng Mật khẩu</span>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1 uppercase ml-1">
                    Mã Chi đoàn / Tên đăng nhập / Email
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <UserIcon size={16} />
                    </div>
                    <input
                      type="text"
                      required
                      value={loginId}
                      onChange={(e) => setLoginId(e.target.value)}
                      className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all text-xs text-slate-800 font-medium"
                      placeholder="Ví dụ: 25dtv1.fetel, admin..."
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-end mb-1 ml-1">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase">Mật khẩu</label>
                    <button type="button" onClick={handlePasswordReset} className="text-[10px] text-blue-600 font-bold bg-transparent border-none cursor-pointer focus:outline-none p-0 flex items-center hover:text-blue-800">
                      Quên mật khẩu?
                    </button>
                  </div>
                  
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Lock size={16} />
                    </div>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all text-xs text-slate-800 font-medium"
                      placeholder="••••••••"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-slate-800 text-white py-3 rounded-xl font-bold uppercase tracking-wide text-xs drop-shadow-md hover:bg-slate-900 transition active:scale-[0.98] disabled:opacity-70 flex justify-center items-center gap-2 mt-2"
                >
                  {loading ? (
                    'Đang xử lý...'
                  ) : (
                    <>
                      <LogIn size={15} /> Đăng nhập bằng ID & Mật khẩu
                    </>
                  )}
                </button>
              </form>
            </div>
          )}
        </div>

        <div className="mt-8 text-center text-[9px] text-slate-400 shrink-0 opacity-80 leading-relaxed drop-shadow-sm pb-2">
           &copy; {new Date().getFullYear()} Bản quyền thuộc về Đoàn khoa Điện tử - Viễn thông,<br/>Trường Đại học Khoa học tự nhiên, ĐHQG-HCM<br/>
           Công trình thanh niên nhiệm kỳ 2025 - 2027
        </div>
      </div>

      {/* Modal Setup Chi đoàn Google User */}
      {showSetupModal && pendingGoogleUser && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="text-center mb-5">
              <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-inner">
                <Users size={24} />
              </div>
              <h2 className="text-base font-bold text-slate-800">Chọn Chi đoàn Quản lý</h2>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Tài khoản Google <strong className="text-slate-700">{pendingGoogleUser.email}</strong> chưa liên kết với Chi đoàn nào. Vui lòng chọn Chi đoàn của bạn để kích hoạt quyền quản lý.
              </p>
            </div>

            {setupError && (
              <div className="mb-4 bg-red-50 p-3 rounded-xl flex items-start text-red-600 border border-red-100 text-[11px] leading-relaxed">
                <AlertCircle size={14} className="mr-2 shrink-0 mt-0.5" />
                <span>{setupError}</span>
              </div>
            )}

            <form onSubmit={handleConfirmBranchSetup} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase ml-1">
                  Chi đoàn trực thuộc
                </label>
                <select
                  value={setupBranch}
                  onChange={(e) => setSetupBranch(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 text-xs text-slate-800 font-semibold cursor-pointer"
                >
                  {branchOptions.map((b) => (
                    <option key={b} value={b}>
                      Chi đoàn {b}
                    </option>
                  ))}
                  <option value="OTHER">-- Chi đoàn khác (Nhập tên)... --</option>
                </select>

                {setupBranch === 'OTHER' && (
                  <div className="mt-2.5">
                    <input
                      type="text"
                      required
                      value={customSetupBranch}
                      onChange={(e) => setCustomSetupBranch(e.target.value)}
                      placeholder="Nhập tên Chi đoàn (VD: 27ICD1, 27DTV1...)"
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 text-xs text-slate-800"
                    />
                  </div>
                )}
                <p className="text-[10px] text-slate-500 mt-1.5 ml-1 leading-normal">
                  Mỗi Chi đoàn chỉ được cấp <strong>01 tài khoản quản lý duy nhất</strong>. Nếu Chi đoàn đã chọn đã có tài khoản khác quản lý, hệ thống sẽ chặn khởi tạo trùng lặp.
                </p>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowSetupModal(false);
                    setPendingGoogleUser(null);
                    signOut(auth);
                  }}
                  className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={setupLoading}
                  className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition disabled:opacity-70 shadow-md shadow-blue-500/20"
                >
                  {setupLoading ? 'Đang lưu...' : 'Xác nhận cấp quyền'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


