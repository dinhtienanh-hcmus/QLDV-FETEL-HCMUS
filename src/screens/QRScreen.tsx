import React, { useEffect, useState, useRef } from 'react';
import QRCode from 'react-qr-code';
import { 
  QrCode, 
  Scan, 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  Camera, 
  RefreshCw, 
  Calendar, 
  Sparkles, 
  ShieldCheck
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { collection, query, getDocs, doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Html5Qrcode } from 'html5-qrcode';

interface UserActivity {
  id: string;
  name: string;
  time: string;
  status: 'registered' | 'attended';
}

interface ScanFeedback {
  type: 'success' | 'error' | 'warning';
  title: string;
  message: string;
  activityName?: string;
}

export default function QRScreen() {
  const { currentUser } = useAuth();
  const displayName = currentUser?.name || currentUser?.email?.split('@')[0] || 'Người dùng';

  const [activeTab, setActiveTab] = useState<'scan' | 'myqr'>('scan');
  const [userActivities, setUserActivities] = useState<UserActivity[]>([]);

  // Camera scanner states
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isProcessingScan, setIsProcessingScan] = useState(false);
  const [feedback, setFeedback] = useState<ScanFeedback | null>(null);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!currentUser?.uid) return;

    fetchUserActivities();

    // Listen to activities collection changes in real-time
    const q = query(collection(db, 'activities'));
    const unsubscribe = onSnapshot(q, () => {
      fetchUserActivities();
    }, (err) => {
      console.error("Error listening to user activities:", err);
    });

    return () => unsubscribe();
  }, [currentUser?.uid]);

  // Clean up camera on unmount or tab switch
  useEffect(() => {
    return () => {
      stopCameraScanner();
    };
  }, []);

  const fetchUserActivities = async () => {
    if (!currentUser?.uid) return;
    try {
      const q = query(collection(db, 'activities'));
      const snapshot = await getDocs(q);
      const acts: UserActivity[] = [];

      for (const actDoc of snapshot.docs) {
        const actData = actDoc.data();
        const regSnap = await getDoc(doc(db, 'activities', actDoc.id, 'registrations', currentUser.uid));

        if (regSnap.exists()) {
          const regData = regSnap.data();
          if (regData.status === 'attended') {
            acts.push({
              id: actDoc.id,
              name: actData.name,
              time: actData.startTime 
                ? new Date(actData.startTime).toLocaleDateString('vi-VN') 
                : 'N/A',
              status: 'attended',
            });
          }
        }
      }
      setUserActivities(acts);
    } catch (err) {
      console.error("Error fetching user activities:", err);
    }
  };

  const startCameraScanner = async () => {
    setCameraError(null);
    setIsCameraActive(true);

    // Wait for DOM container render
    setTimeout(async () => {
      try {
        if (!scannerRef.current) {
          scannerRef.current = new Html5Qrcode('reader-stream');
        }

        await scannerRef.current.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 220, height: 220 },
          },
          (decodedText) => {
            handleScanSuccess(decodedText);
          },
          () => {
            // Frame scan error - safe to ignore
          }
        );
      } catch (err) {
        console.error("Error starting camera:", err);
        setCameraError("Không thể bật camera. Bạn có thể sử dụng tính năng 'Tải ảnh QR' bên dưới.");
        setIsCameraActive(false);
      }
    }, 150);
  };

  const stopCameraScanner = async () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      try {
        await scannerRef.current.stop();
        await scannerRef.current.clear();
      } catch (err) {
        console.error("Error stopping scanner:", err);
      }
    }
    setIsCameraActive(false);
  };

  const handleScanSuccess = async (rawQrContent: string) => {
    if (isProcessingScan) return;
    setIsProcessingScan(true);
    await stopCameraScanner();

    try {
      let activityId = '';
      let activityName = '';

      // Try to parse JSON from 10s dynamic QR code
      try {
        const parsed = JSON.parse(rawQrContent);
        activityId = parsed.activityId || '';
        activityName = parsed.activityName || '';
      } catch {
        // Fallback: raw QR text string might be the activity ID
        activityId = rawQrContent.trim();
      }

      if (!activityId) {
        setFeedback({
          type: 'error',
          title: 'Mã QR không hợp lệ',
          message: 'Dữ liệu mã QR không đúng định dạng hoạt động của Đoàn khoa.'
        });
        setIsProcessingScan(false);
        return;
      }

      // Check if activity exists in Firestore
      const actDocRef = doc(db, 'activities', activityId);
      const actSnap = await getDoc(actDocRef);

      if (!actSnap.exists()) {
        setFeedback({
          type: 'error',
          title: 'Hoạt động không tồn tại',
          message: 'Mã QR này không tương ứng với bất kỳ hoạt động nào trong hệ thống.'
        });
        setIsProcessingScan(false);
        return;
      }

      const actData = actSnap.data();
      const realActName = activityName || actData.name || 'Hoạt động Đoàn';

      // Check existing registration
      const regRef = doc(db, 'activities', activityId, 'registrations', currentUser!.uid);
      const regSnap = await getDoc(regRef);

      if (regSnap.exists() && regSnap.data().status === 'attended') {
        setFeedback({
          type: 'warning',
          title: 'Đã điểm danh trước đó',
          message: `Bạn đã hoàn thành điểm danh hoạt động này rồi.`,
          activityName: realActName
        });
      } else {
        // Mark attendance in Firestore
        await setDoc(regRef, {
          userId: currentUser!.uid,
          status: 'attended',
          scannedAt: Date.now(),
          scannedBy: 'self_qr_scan'
        }, { merge: true });

        setFeedback({
          type: 'success',
          title: 'Điểm danh thành công!',
          message: `Xác nhận điểm danh thành công cho Đoàn viên ${displayName}.`,
          activityName: realActName
        });

        // Refresh attendance history
        fetchUserActivities();
      }
    } catch (err) {
      console.error("Error processing QR scan:", err);
      setFeedback({
        type: 'error',
        title: 'Lỗi điểm danh',
        message: 'Đã xảy ra lỗi kết nối khi ghi nhận điểm danh. Vui lòng thử lại.'
      });
    } finally {
      setIsProcessingScan(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsProcessingScan(true);
      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode('reader-stream-hidden');
      }
      const decodedText = await scannerRef.current.scanFile(file, true);
      await handleScanSuccess(decodedText);
    } catch (err) {
      console.error("Error reading QR from image file:", err);
      setFeedback({
        type: 'error',
        title: 'Không thể đọc mã QR',
        message: 'Không tìm thấy mã QR hợp lệ trong hình ảnh tải lên. Vui lòng thử hình ảnh khác.'
      });
      setIsProcessingScan(false);
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-y-auto">
      {/* Hidden container for file scanning */}
      <div id="reader-stream-hidden" className="hidden"></div>

      {/* Header */}
      <div className="bg-blue-800 text-white p-5 pt-8 shrink-0 shadow-md">
        <div className="flex items-center space-x-2">
          <Scan className="w-6 h-6 text-blue-200" />
          <h2 className="text-lg font-bold">Điểm danh Hoạt động</h2>
        </div>
        <p className="text-xs text-blue-100 opacity-80 mt-1">
          Quét mã QR hoạt động hoặc trình mã cá nhân để ghi nhận tham gia
        </p>

        {/* Tab Selector */}
        <div className="flex bg-blue-900/60 p-1 rounded-xl mt-4 border border-blue-700/50">
          <button
            type="button"
            onClick={() => {
              stopCameraScanner();
              setActiveTab('scan');
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition flex items-center justify-center space-x-1.5 cursor-pointer ${
              activeTab === 'scan'
                ? 'bg-white text-blue-900 shadow-sm'
                : 'text-blue-200 hover:text-white'
            }`}
          >
            <Camera size={15} />
            <span>Quét mã điểm danh</span>
          </button>
          <button
            type="button"
            onClick={() => {
              stopCameraScanner();
              setActiveTab('myqr');
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition flex items-center justify-center space-x-1.5 cursor-pointer ${
              activeTab === 'myqr'
                ? 'bg-white text-blue-900 shadow-sm'
                : 'text-blue-200 hover:text-white'
            }`}
          >
            <QrCode size={15} />
            <span>Mã QR Cá nhân</span>
          </button>
        </div>
      </div>

      <div className="flex-1 p-4 md:p-6 space-y-6">
        {/* TAB 1: SCAN QR CODE */}
        {activeTab === 'scan' && (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center text-center">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-1 flex items-center">
              <Sparkles size={16} className="text-blue-600 mr-1.5" />
              Quét Mã QR Hoạt Động
            </h3>
            <p className="text-xs text-slate-500 mb-5 max-w-xs">
              Đưa máy ảnh về phía mã QR hoạt động hiển thị trên màn hình/máy chiếu sự kiện để điểm danh.
            </p>

            {/* Camera View Box */}
            <div className="w-full max-w-sm bg-slate-900 rounded-2xl overflow-hidden shadow-inner border border-slate-800 relative min-h-[260px] flex flex-col items-center justify-center">
              <div 
                id="reader-stream" 
                className={`w-full h-full overflow-hidden ${!isCameraActive ? 'hidden' : 'block'}`}
              ></div>

              {!isCameraActive && (
                <div className="p-6 flex flex-col items-center text-slate-400">
                  <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-3 text-blue-400">
                    <Camera size={32} />
                  </div>
                  <span className="text-xs font-medium mb-4 text-slate-300">Camera chưa bật</span>
                  <button
                    type="button"
                    onClick={startCameraScanner}
                    className="py-2.5 px-5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center space-x-2 cursor-pointer"
                  >
                    <Camera size={15} />
                    <span>Bật Camera quét mã</span>
                  </button>
                </div>
              )}

              {isCameraActive && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10">
                  <button
                    type="button"
                    onClick={stopCameraScanner}
                    className="py-1.5 px-4 bg-red-600/90 hover:bg-red-700 text-white font-bold text-xs rounded-lg shadow transition cursor-pointer backdrop-blur-sm"
                  >
                    Tắt Camera
                  </button>
                </div>
              )}
            </div>

            {cameraError && (
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs text-left w-full max-w-sm flex items-start space-x-2">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span>{cameraError}</span>
              </div>
            )}

            {/* Alternative: Upload Image */}
            <div className="w-full max-w-sm mt-5 pt-4 border-t border-slate-100 flex flex-col items-center">
              <span className="text-xs font-semibold text-slate-500 mb-2">Hoặc tải lên hình ảnh có chứa mã QR:</span>
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessingScan}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 transition flex items-center justify-center space-x-2 cursor-pointer"
              >
                {isProcessingScan ? (
                  <>
                    <RefreshCw size={15} className="animate-spin text-blue-600" />
                    <span>Đang đọc ảnh...</span>
                  </>
                ) : (
                  <>
                    <Upload size={15} className="text-blue-600" />
                    <span>Tải ảnh mã QR từ thiết bị</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: MY PERSONAL QR CARD */}
        {activeTab === 'myqr' && (
          <div className="space-y-4">
            {/* Profile Card */}
            <div className="w-full p-5 bg-gradient-to-br from-blue-700 to-blue-900 rounded-2xl text-white relative overflow-hidden shadow-md">
              <div className="absolute -right-4 -top-4 w-28 h-28 bg-white/10 rounded-full blur-sm"></div>
              <div className="flex items-center space-x-3.5 mb-4 relative z-10">
                <div className="w-12 h-12 rounded-full bg-white/20 border-2 border-white/40 flex items-center justify-center overflow-hidden shrink-0 shadow">
                  <img 
                    src={currentUser?.photoURL || "https://upload.wikimedia.org/wikipedia/vi/thumb/9/90/Huy_Hi%E1%BB%87u_%C4%90o%C3%A0n.png/1200px-Huy_Hi%E1%BB%87u_%C4%90o%C3%A0n.png"} 
                    alt="Avatar" 
                    className="w-full h-full object-cover" 
                  />
                </div>
                <div>
                  <div className="text-sm font-bold line-clamp-1">{displayName}</div>
                  <div className="text-xs text-blue-200 font-mono">MSSV: {currentUser?.mssv || '---'}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs pt-3 border-t border-white/15 relative z-10">
                <div><span className="opacity-70">Chi đoàn:</span> <strong className="font-semibold">{currentUser?.branch || 'Chưa cập nhật'}</strong></div>
                <div><span className="opacity-70">Chức vụ:</span> <strong className="font-semibold">{currentUser?.role === 'doanvien' ? 'Đoàn viên' : currentUser?.role === 'chidoan' ? 'BCH Chi đoàn' : currentUser?.role === 'admin' ? 'BCH Đoàn khoa' : 'Đoàn viên'}</strong></div>
              </div>
            </div>

            {/* Personal QR Display */}
            <div className="flex flex-col items-center p-6 bg-white border border-slate-200 rounded-2xl w-full shadow-sm text-center">
              <div className="p-3 bg-white border border-slate-100 rounded-2xl shadow-sm mb-3">
                <QRCode value={currentUser?.mssv || '000'} size={170} fgColor="#0f172a" level="Q" />
              </div>
              <div className="text-xs font-bold text-slate-800">{displayName} - {currentUser?.mssv || '---'}</div>
              <p className="text-[11px] text-slate-500 font-medium italic mt-1">
                Trình mã QR này để Ban Chấp Hành quét điểm danh thủ công khi cần.
              </p>
            </div>
          </div>
        )}

        {/* FEEDBACK MODAL */}
        {feedback && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 text-center animate-in zoom-in duration-150">
              {feedback.type === 'success' && (
                <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 size={28} />
                </div>
              )}
              {feedback.type === 'warning' && (
                <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-3">
                  <ShieldCheck size={28} />
                </div>
              )}
              {feedback.type === 'error' && (
                <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-3">
                  <AlertCircle size={28} />
                </div>
              )}

              <h3 className="font-bold text-slate-800 text-base mb-1">{feedback.title}</h3>
              {feedback.activityName && (
                <div className="text-xs font-bold text-blue-800 bg-blue-50 py-1 px-3 rounded-lg border border-blue-100 my-2 inline-block">
                  {feedback.activityName}
                </div>
              )}
              <p className="text-xs text-slate-600 mb-5 leading-relaxed">{feedback.message}</p>

              <button
                type="button"
                onClick={() => setFeedback(null)}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl text-xs transition cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        )}

        {/* ATTENDANCE & REGISTRATION HISTORY */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center">
              <Calendar size={15} className="mr-1.5 text-blue-600" />
              Lịch sử tham gia Hoạt động ({userActivities.length})
            </h3>
            <button
              type="button"
              onClick={fetchUserActivities}
              className="text-[11px] text-blue-600 font-bold hover:underline flex items-center"
            >
              <RefreshCw size={12} className="mr-1" /> Cập nhật
            </button>
          </div>

          <div className="space-y-2.5">
            {userActivities.length === 0 ? (
              <div className="text-xs text-slate-400 italic py-4 text-center">
                Bạn chưa điểm danh tham gia hoạt động nào.
              </div>
            ) : (
              userActivities.map(item => (
                <div 
                  key={item.id} 
                  className="flex justify-between items-center p-3 border border-slate-100 rounded-xl bg-slate-50/70 hover:bg-slate-50 transition"
                >
                  <div className="flex-1 pr-3">
                    <div className="text-xs font-bold text-slate-800 line-clamp-2 leading-snug">{item.name}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">Ngày: {item.time}</div>
                  </div>
                  <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-lg shrink-0 border border-emerald-200 flex items-center">
                    <CheckCircle2 size={12} className="mr-1" /> ĐÃ THAM GIA
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
