import React, { useState, useEffect } from 'react';
import { Home, QrCode, BookOpen, Settings, ScanLine, User as UserIcon } from 'lucide-react';
import HomeScreen from './screens/HomeScreen';
import QRScreen from './screens/QRScreen';
import HandbookScreen from './screens/HandbookScreen';
import LoginScreen from './screens/LoginScreen';
import AdminScreen from './screens/AdminScreen';
import ScanScreen from './screens/ScanScreen';
import OnboardingModal from './components/OnboardingModal';
import { AuthProvider, useAuth } from './contexts/AuthContext';

function AppContent() {
  const [currentTab, setCurrentTab] = useState<'home' | 'qr' | 'handbook' | 'admin' | 'scan'>('home');
  const { currentUser } = useAuth();

  const isAdmin = currentUser?.role === 'admin';
  const isBranch = currentUser?.role === 'chidoan';
  const isDoanVien = currentUser?.role === 'doanvien' || !currentUser?.role;
  const canScan = isAdmin || isBranch;

  // Prevent accessing unauthorized tabs
  useEffect(() => {
    if (isDoanVien && currentTab === 'admin') setCurrentTab('home');
    if (isDoanVien && currentTab === 'scan') setCurrentTab('home');
    if (!isDoanVien && currentTab === 'qr') setCurrentTab('home');
  }, [currentUser, currentTab]);

  if (!currentUser) {
    return (
      <div 
        className="w-full min-h-screen relative flex items-center justify-center p-3 sm:p-6 overflow-x-hidden overflow-y-auto selection:bg-red-200"
        style={{ backgroundColor: '#FDF6EA' }}
      >
        {/* Full-width responsive panoramic background layer */}
        <div 
          className="fixed inset-0 w-full h-full pointer-events-none z-0 bg-no-repeat
                     bg-[length:100%_auto] bg-top
                     landscape:bg-cover landscape:bg-center
                     lg:bg-cover lg:bg-center"
          style={{ backgroundImage: `url('/background.webp')` }}
        />

        {/* Decorative red footer accent matching the bottom of the panorama banner */}
        <div className="fixed bottom-0 left-0 right-0 h-2 sm:h-3 bg-gradient-to-r from-red-700 via-red-600 to-rose-700 pointer-events-none z-0" />

        {/* Soft ambient overlay */}
        <div className="fixed inset-0 bg-slate-900/5 pointer-events-none z-0" />

        {/* Centered Login Card */}
        <div className="w-full max-w-md bg-white/95 backdrop-blur-md shadow-2xl rounded-3xl overflow-hidden border border-white/70 relative z-10 my-auto">
          <LoginScreen />
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-center items-center h-screen w-full bg-slate-50 font-sans selection:bg-red-200 overflow-hidden">
      <div className="w-full h-full max-w-[1400px] flex flex-col md:flex-row bg-white relative overflow-hidden shadow-2xl">
        {/* Desktop Sidebar Navigation */}
        <div className="hidden md:flex w-64 bg-slate-900 border-r border-slate-800 flex-col py-6 shrink-0 z-20">
          <div className="px-6 mb-8 flex items-center">
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center p-1.5 shadow-lg mr-3">
               <img src="/logo_doan.png" alt="Logo Đoàn" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="text-white font-bold text-lg leading-tight">FETEL@HCMUS</h1>
              <p className="text-red-200 text-[10px]">Hệ thống Quản lý Đoàn</p>
            </div>
          </div>

          <div className="flex-1 px-4 flex flex-col gap-1.5">
            <SidebarItem icon={Home} label="Trang chủ" isActive={currentTab === 'home'} onClick={() => setCurrentTab('home')} />
            {isDoanVien && (
              <SidebarItem icon={UserIcon} label="Điểm danh & Cá nhân" isActive={currentTab === 'qr'} onClick={() => setCurrentTab('qr')} />
            )}
            <SidebarItem icon={BookOpen} label="Sổ tay Đoàn viên" isActive={currentTab === 'handbook'} onClick={() => setCurrentTab('handbook')} />
            {canScan && (
              <SidebarItem icon={ScanLine} label="Điểm danh HĐ" isActive={currentTab === 'scan'} onClick={() => setCurrentTab('scan')} />
            )}
            {(isAdmin || isBranch) && (
              <SidebarItem icon={Settings} label="Quản lý Đoàn" isActive={currentTab === 'admin'} onClick={() => setCurrentTab('admin')} />
            )}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto no-scrollbar relative w-full h-full bg-slate-50 flex flex-col z-10">
          <div className="w-full max-w-5xl mx-auto h-full bg-white sm:shadow-lg sm:border-x border-slate-100 flex flex-col overflow-hidden relative">
            {currentTab === 'home' && <HomeScreen />}
            {currentTab === 'qr' && isDoanVien && <QRScreen />}
            {currentTab === 'handbook' && <HandbookScreen />}
            {currentTab === 'admin' && (isAdmin || isBranch) && <AdminScreen />}
            {currentTab === 'scan' && canScan && <ScanScreen />}
          </div>
        </div>

        {/* Mobile Bottom Navigation */}
        <div className="md:hidden h-[60px] border-t border-slate-100 bg-white flex items-center px-2 shrink-0 z-20">
          <TabItem icon={Home} label="Trang chủ" isActive={currentTab === 'home'} onClick={() => setCurrentTab('home')} />
          {isDoanVien && (
            <TabItem icon={UserIcon} label="Cá nhân" isActive={currentTab === 'qr'} onClick={() => setCurrentTab('qr')} />
          )}
          <TabItem icon={BookOpen} label="Sổ tay" isActive={currentTab === 'handbook'} onClick={() => setCurrentTab('handbook')} />
          {canScan && (
            <TabItem icon={ScanLine} label="Điểm danh" isActive={currentTab === 'scan'} onClick={() => setCurrentTab('scan')} />
          )}
          {(isAdmin || isBranch) && (
            <TabItem icon={Settings} label="QL Đoàn" isActive={currentTab === 'admin'} onClick={() => setCurrentTab('admin')} />
          )}
        </div>

        {/* Đoàn viên Onboarding / Information completion Modal */}
        <OnboardingModal />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

interface NavItemProps {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  label: string;
  isActive: boolean;
  onClick: () => void;
}

function SidebarItem({ icon: Icon, label, isActive, onClick }: NavItemProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center px-4 py-3 rounded-xl transition-all duration-200 border-none justify-start w-full cursor-pointer focus:outline-none ${
        isActive ? 'bg-red-600 text-white shadow-md shadow-red-900/30' : 'bg-transparent text-slate-300 hover:text-white hover:bg-slate-800'
      }`}
    >
      <Icon size={20} strokeWidth={isActive ? 2.5 : 2} className="mr-3" />
      <span className={`text-sm ${isActive ? 'font-bold' : 'font-medium'}`}>
        {label}
      </span>
    </button>
  );
}

function TabItem({ icon: Icon, label, isActive, onClick }: NavItemProps) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex flex-col items-center justify-center py-1 transition-all duration-200 bg-transparent border-none cursor-pointer focus:outline-none ${
        isActive ? 'text-red-600' : 'text-slate-300 hover:text-slate-400'
      }`}
    >
      <Icon size={20} strokeWidth={isActive ? 2.5 : 2} className="mb-1" />
      <span className={`text-[9px] ${isActive ? 'font-bold' : ''}`}>
        {label}
      </span>
    </button>
  );
}

