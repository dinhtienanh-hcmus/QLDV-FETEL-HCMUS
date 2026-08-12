import React, { useState, useEffect } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth';
import { collection, query, getDocs, doc, setDoc, orderBy } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { Lock, AlertCircle, User as UserIcon, LogIn, UserPlus, Users } from 'lucide-react';

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
      if (isSignUp) {
        const finalBranch = (selectedBranch === 'OTHER' ? customBranch : selectedBranch).trim();
        if (!finalBranch) {
          setError('Vui lòng chọn hoặc nhập tên Chi đoàn.');
          setLoading(false);
          return;
        }

        // 1. Check if a Chi đoàn account already exists for this branch
        const usersSnap = await getDocs(collection(db, 'users'));
        const searchBranchLower = finalBranch.toLowerCase();
        const duplicate = usersSnap.docs.find(d => {
          const u = d.data();
          const uBranch = (u.branch || '').toLowerCase().trim();
          const uEmail = (u.email || u.authEmail || '').toLowerCase();
          return (u.role === 'chidoan' || uEmail.includes('chidoan')) && uBranch === searchBranchLower;
        });

        if (duplicate) {
          setError(`Chi đoàn "${finalBranch}" đã có tài khoản quản lý trên hệ thống. Mỗi Chi đoàn chỉ được cấp 01 tài khoản Chi đoàn.`);
          setLoading(false);
          return;
        }

        // 2. Create account with standardized email username
        const cleanBranchUname = finalBranch.toLowerCase().replace(/\s+/g, '');
        const authEmail = `${cleanBranchUname}.fetel@chidoan.fetel`;
        const userCred = await createUserWithEmailAndPassword(auth, authEmail, password || 'Abc@123');

        // 3. Save user doc in Firestore
        await setDoc(doc(db, 'users', userCred.user.uid), {
          email: '',
          authEmail: authEmail,
          username: `${cleanBranchUname}.fetel`,
          name: `BCH Chi đoàn ${finalBranch}`,
          role: 'chidoan',
          branch: finalBranch,
          createdAt: Date.now()
        });

        setMessage(`Tạo tài khoản thành công cho Chi đoàn ${finalBranch}! Tên đăng nhập: ${cleanBranchUname}.fetel`);
      } else {
        const email = getEmail(loginId);
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      console.error(err);
      let errMsg = err.message || 'Đã có lỗi xảy ra';
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        errMsg = 'Tài khoản hoặc mật khẩu không chính xác.';
      } else if (err.code === 'auth/email-already-in-use') {
        errMsg = 'Chi đoàn này hoặc email này đã có tài khoản đăng ký.';
      } else if (err.code === 'auth/weak-password') {
        errMsg = 'Mật khẩu phải có ít nhất 6 ký tự.';
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
        setError(`Không tìm thấy tài khoản với email ${getEmail(loginId)}. Bạn có thể chọn "Tạo tài khoản" hoặc đăng nhập bằng Google.`);
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
                💡 <strong>Lưu ý:</strong> Ở lần đăng nhập đầu tiên, hệ thống sẽ yêu cầu bạn xác nhận <strong>Họ tên</strong>, <strong>MSSV</strong> và <strong>Chi đoàn</strong> để liên kết chính xác hồ sơ đã import.
              </div>
            </div>
          ) : (
            <div>
              <div className="flex bg-slate-100 p-1 rounded-xl mb-4">
                <button
                  type="button"
                  onClick={() => { setIsSignUp(false); setError(''); setMessage(''); }}
                  className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg transition-all ${!isSignUp ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Đăng nhập
                </button>
                <button
                  type="button"
                  onClick={() => { setIsSignUp(true); setError(''); setMessage(''); }}
                  className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg transition-all ${isSignUp ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Tạo tài khoản
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3.5">
                {isSignUp ? (
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1 uppercase ml-1">
                      Chọn Chi đoàn trực thuộc
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Users size={16} />
                      </div>
                      <select
                        value={selectedBranch}
                        onChange={(e) => setSelectedBranch(e.target.value)}
                        className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all text-xs text-slate-800 font-semibold cursor-pointer"
                      >
                        {branchOptions.map((bName) => (
                          <option key={bName} value={bName}>
                            Chi đoàn {bName}
                          </option>
                        ))}
                        <option value="OTHER">-- Chi đoàn khác (Nhập tên)... --</option>
                      </select>
                    </div>

                    {selectedBranch === 'OTHER' && (
                      <div className="mt-2.5">
                        <input
                          type="text"
                          required
                          value={customBranch}
                          onChange={(e) => setCustomBranch(e.target.value)}
                          placeholder="Nhập tên Chi đoàn (VD: 27ICD1, 27DTV1...)"
                          className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all text-xs text-slate-800"
                        />
                      </div>
                    )}
                    <p className="text-[10px] text-slate-500 mt-1 ml-1 leading-normal">
                      Mỗi Chi đoàn chỉ được phép có <strong>01 tài khoản duy nhất</strong>. Nếu Chi đoàn đã chọn đã tồn tại, hệ thống sẽ ngăn khởi tạo trùng lặp.
                    </p>
                  </div>
                ) : (
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
                )}

                <div>
                  <div className="flex justify-between items-end mb-1 ml-1">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase">Mật khẩu</label>
                    {!isSignUp && (
                      <button type="button" onClick={handlePasswordReset} className="text-[10px] text-blue-600 font-bold bg-transparent border-none cursor-pointer focus:outline-none p-0 flex items-center hover:text-blue-800">
                        Quên mật khẩu?
                      </button>
                    )}
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
                  className="w-full bg-[#1d4ed8] text-white py-3 rounded-xl font-bold uppercase tracking-wide text-xs drop-shadow-md hover:bg-blue-800 transition active:scale-[0.98] disabled:opacity-70 flex justify-center items-center gap-2 mt-2"
                >
                  {loading ? (
                    'Đang xử lý...'
                  ) : isSignUp ? (
                    <>
                      <UserPlus size={15} /> Tạo tài khoản Chi đoàn
                    </>
                  ) : (
                    <>
                      <LogIn size={15} /> Đăng nhập
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
    </div>
  );
}

