import React, { useState, useEffect, useMemo } from 'react';
import { collection, addDoc, getDocs, getDoc, query, orderBy, deleteDoc, doc, updateDoc, setDoc, writeBatch } from 'firebase/firestore';
import { db, firebaseConfig, isQuotaExceededError, isOfflineOrNetworkError } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { PlusCircle, Trash2, Users, FileSpreadsheet, Check, X, Bell, Upload, List, Edit2, Camera, ExternalLink, QrCode, CheckCircle2, Clock, RefreshCw, Link2, Unlink, Sparkles, Settings, Mail, Send, Paperclip, FileText, Download, CheckSquare, Square, CornerUpRight, Inbox, Eye, AlertCircle, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { initializeApp, getApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import Papa from 'papaparse';
import { isTermExpired, filterActiveTerms, DEFAULT_DOAN_KHOA_TERMS, DEFAULT_DOAN_KHOA_PERIODS, DEFAULT_CHI_DOAN_TERMS, formatDateToDDMMYYYY } from '../utils/termUtils';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { getGoogleSheetsAccessToken, hasCachedToken, createTrackingSpreadsheet, syncTrackingSpreadsheet, extractSpreadsheetId } from '../lib/googleSheets';
import { getGmailAccessToken, getCachedGmailToken, getCachedGmailEmail, hasCachedGmailToken, setCachedGmailToken, fetchRecentEmails, fetchAttachmentContent, sendBulkNotificationEmail, GmailMessageSummary, EmailAttachment } from '../lib/gmail';
import { matchStudentTo25ICD } from '../data/canonicalRoster';
import { compressImage } from '../utils/imageCompressor';

const VIETNAMESE_REPAIR_MAP: Record<string, string> = {
  'Ph?m': 'Phạm', 'Nguy?n': 'Nguyễn', 'B?o': 'Bảo', 'H?i': 'Hải', 'Ðang': 'Đăng', 'Qu?c': 'Quốc',
  'Hu?nh': 'Huỳnh', 'Ng?c': 'Ngọc', 'Phu?c': 'Phước', 'T?n': 'Tấn', 'Tu?n': 'Tuấn', 'Th?nh': 'Thịnh',
  'Ð?c': 'Đức', 'Vi?n': 'Viễn', 'M? Ái': 'Mỹ Ái', 'Nh?t': 'Nhật', 'H?ng': 'Hùng', 'Cu?ng': 'Cường',
  'Luu': 'Lưu', 'C?m': 'Cẩm', 'Ðào': 'Đào', 'Huong': 'Hương', 'Ki?t': 'Kiệt', 'Vi?t': 'Việt',
  'Tâm': 'Tâm', 'Ð?': 'Đỗ', 'Thành': 'Thành', 'Ð?t': 'Đạt', 'Ðông': 'Đông', 'M?c': 'Mạc',
  'H?u': 'Hữu', 'M?nh': 'Mạnh', 'Võ': 'Võ', 'Vuong': 'Vương', 'M? M?': 'Mỹ Mỹ', 'K? Nam': 'Kỳ Nam',
  'Qu?nh': 'Quỳnh', 'Vũ': 'Vũ', 'Nhân': 'Nhân', 'Ti?n': 'Tiến', 'Tri?t': 'Triết', 'Dương': 'Dương',
  'Ðình': 'Đình', 'T?t': 'Tất', 'Ðoàn': 'Đoàn', 'Kh?i': 'Khải', 'Trường': 'Trường', 'Truong': 'Trương',
  'Tru?ng': 'Trường', 'Th?': 'Thị', 'Lu?t': 'Luật', 'Nghia': 'Nghĩa', 'Th?ng': 'Thắng', 'Ðang Khoa': 'Đăng Khoa',
  'Tr?n': 'Trần', 'H?': 'Hồ', 'V?': 'Vũ', 'M?': 'Mỹ', 'Kh?nh': 'Khánh', 'Cát': 'Cát', 'Nhu': 'Như'
};

function repairVietnameseName(raw: string): string {
  if (!raw) return '';
  let res = raw.trim();
  for (const [k, v] of Object.entries(VIETNAMESE_REPAIR_MAP)) {
    res = res.split(k).join(v);
  }
  return res.replace(/Ð/g, 'Đ').trim();
}

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
  allowBranchScan?: boolean;
  allowedScanBranches?: string[];
}

export default function AdminScreen() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const { currentUser } = useAuth();
  
  const [name, setName] = useState('');
  const [startTimeStr, setStartTimeStr] = useState('');
  const [endTimeStr, setEndTimeStr] = useState('');
  const [pointsParticipant, setPointsParticipant] = useState(2);
  const [pointsOrganizer, setPointsOrganizer] = useState(5);
  const drlCategory = 'Mục 3: Trách nhiệm tham gia các hoạt động chính trị, xã hội, văn hóa, văn nghệ, thể thao, phòng chống tội phạm, tệ nạn xã hội';
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

  // Ủy quyền cho Chi đoàn điểm danh / mở mã QR đối với hoạt động Đoàn khoa
  const [allowBranchScan, setAllowBranchScan] = useState(true);
  const [scanBranchScope, setScanBranchScope] = useState<'all' | 'custom'>('all');
  const [allowedScanBranches, setAllowedScanBranches] = useState<string[]>([]);

  // Modal cấu hình quyền điểm danh cho hoạt động đã tạo
  const [editingScanPermAct, setEditingScanPermAct] = useState<Activity | null>(null);
  const [permAllowBranchScan, setPermAllowBranchScan] = useState(true);
  const [permScanScope, setPermScanScope] = useState<'all' | 'custom'>('all');
  const [permScanBranches, setPermScanBranches] = useState<string[]>([]);

  const isAdmin = currentUser?.role === 'admin';
  const isBranch = currentUser?.role === 'chidoan';

  const isUserInMyBranch = (u: any) => {
    if (isAdmin) {
      return true;
    }
    if (isBranch) {
      const myBranch = (currentUser?.branch || '').trim().toLowerCase();
      if (!myBranch) return true;
      const uBranch = (u.branch || '').trim().toLowerCase();
      const isSameBranch = uBranch === myBranch || uBranch.includes(myBranch) || myBranch.includes(uBranch);
      return isSameBranch && (u.role === 'doanvien' || !u.role || u.role === 'chidoan');
    }
    return true;
  };

  const [activeTab, setActiveTab] = useState<'activities' | 'users' | 'bch' | 'handbook' | 'branches' | 'tracking' | 'notifications'>('activities');
  const [trackingSemester, setTrackingSemester] = useState<string>('all');
  const [trackingYear, setTrackingYear] = useState<string>('2026-2027');
  const [trackingSearch, setTrackingSearch] = useState<string>('');
  const [activityType, setActivityType] = useState<string>('tructiep');
  const [usersList, setUsersList] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [selectedBranchFilter, setSelectedBranchFilter] = useState('');
  const [searchBch, setSearchBch] = useState('');
  const [userPage, setUserPage] = useState(1);
  const [isCleaningUsers, setIsCleaningUsers] = useState(false);
  const [cleanResultMsg, setCleanResultMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const USERS_PER_PAGE = 25;

  const filteredUsersList = useMemo(() => {
    return usersList.filter((u: any) => {
      if (!isUserInMyBranch(u)) return false;
      if (isAdmin && selectedBranchFilter && (u.branch || '').toLowerCase() !== selectedBranchFilter.toLowerCase()) {
        return false;
      }
      const q = userSearch.toLowerCase().trim();
      if (!q) return true;
      const nameIsNumeric = /^\d{6,10}$/.test(String(u.name || '').trim());
      const mssvHasText = !/^\d{6,10}$/.test(String(u.mssv || '').trim()) && String(u.mssv || '').trim().length > 0;
      const isFlipped = nameIsNumeric && mssvHasText;
      const displayName = isFlipped ? u.mssv : (u.name || '');
      const displayMssv = isFlipped ? u.name : (u.mssv || u.username || '');

      return (
        displayName.toLowerCase().includes(q) ||
        displayMssv.toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.branch || '').toLowerCase().includes(q)
      );
    });
  }, [usersList, isAdmin, isBranch, currentUser?.branch, selectedBranchFilter, userSearch]);

  const totalUserPages = Math.max(1, Math.ceil(filteredUsersList.length / USERS_PER_PAGE));
  const currentPageSafe = Math.min(Math.max(1, userPage), totalUserPages);
  const paginatedUsers = useMemo(() => {
    const start = (currentPageSafe - 1) * USERS_PER_PAGE;
    return filteredUsersList.slice(start, start + USERS_PER_PAGE);
  }, [filteredUsersList, currentPageSafe]);

  useEffect(() => {
    setUserPage(1);
  }, [userSearch, selectedBranchFilter]);

  // Gmail & Announcements State
  const [gmailConnectedEmail, setGmailConnectedEmail] = useState<string | null>(() => getCachedGmailEmail());
  const [isConnectingGmail, setIsConnectingGmail] = useState(false);
  const [isFetchingEmails, setIsFetchingEmails] = useState(false);
  const [recentEmails, setRecentEmails] = useState<GmailMessageSummary[]>([]);
  const [emailSearchQuery, setEmailSearchQuery] = useState('from:doantruong OR "Đoàn trường" OR "Thông báo" OR "KHTN"');
  const [selectedEmailSource, setSelectedEmailSource] = useState<GmailMessageSummary | null>(null);

  // Compose / Forward state
  const [announceTitle, setAnnounceTitle] = useState('');
  const [announceBody, setAnnounceBody] = useState('');
  const [announceTarget, setAnnounceTarget] = useState<'branches' | 'all' | 'custom'>('branches');
  const [selectedBranchesForMail, setSelectedBranchesForMail] = useState<string[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<Array<{ filename: string; mimeType: string; size: number; dataBase64?: string; attachmentId?: string; messageId?: string }>>([]);
  const [customRecipients, setCustomRecipients] = useState<string[]>([]);
  const [newRecipientInput, setNewRecipientInput] = useState('');
  const [sendViaInApp, setSendViaInApp] = useState(true);
  const [sendViaGmail, setSendViaGmail] = useState(true);

  // Sending status & confirmation modal
  const [showSendConfirmModal, setShowSendConfirmModal] = useState(false);
  const [isSendingAnnouncement, setIsSendingAnnouncement] = useState(false);
  const [sendResultMsg, setSendResultMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  // Historical announcements list
  const [announcementsList, setAnnouncementsList] = useState<any[]>([]);
  const [loadingAnnouncements, setLoadingAnnouncements] = useState(false);

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
  const [driveErrorMsg, setDriveErrorMsg] = useState('');

  const DEFAULT_BRANCHES = [
    '25ICD', '25DTV1', '25DTV2', '25DTV_DKD',
    '26ICD', '26DTV1', '26DTV2', '26DTV_DKD'
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

  interface CsvParsedRecord {
    stt: string;
    mssv: string;
    name: string;
    branch: string;
    role: 'doanvien' | 'chidoan';
    isExisting: boolean;
    existingId?: string;
  }

  interface CsvPreviewState {
    fileName: string;
    records: CsvParsedRecord[];
    totalNew: number;
    totalExisting: number;
    branchesList: string[];
  }

  const [csvPreview, setCsvPreview] = useState<CsvPreviewState | null>(null);
  const [isImportingConfirmed, setIsImportingConfirmed] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);

  // Google Sheets Integration
  const [sheetsConfig, setSheetsConfig] = useState<{
    spreadsheetId?: string;
    spreadsheetUrl?: string;
    title?: string;
    lastSyncedAt?: number;
    autoSyncOnApprove?: boolean;
    syncedBy?: string;
  } | null>(null);
  const [isConnectingSheets, setIsConnectingSheets] = useState(false);
  const [isSyncingSheets, setIsSyncingSheets] = useState(false);
  const [sheetsSyncSuccessMsg, setSheetsSyncSuccessMsg] = useState('');
  const [sheetsSyncErrorMsg, setSheetsSyncErrorMsg] = useState('');
  const [showLinkCustomModal, setShowLinkCustomModal] = useState(false);
  const [customSheetInput, setCustomSheetInput] = useState('');

  useEffect(() => {
    if (sheetsSyncSuccessMsg) {
      const timer = setTimeout(() => setSheetsSyncSuccessMsg(''), 6000);
      return () => clearTimeout(timer);
    }
  }, [sheetsSyncSuccessMsg]);

  useEffect(() => {
    try {
      const cachedUsers = localStorage.getItem('cached_admin_users');
      if (cachedUsers) {
        const parsed = JSON.parse(cachedUsers);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const normalized = parsed.map((u: any) => {
            const nameIsNumeric = /^\d{6,10}$/.test(String(u.name || '').trim());
            const mssvHasText = !/^\d{6,10}$/.test(String(u.mssv || '').trim()) && String(u.mssv || '').trim().length > 0;
            if (nameIsNumeric && mssvHasText) {
              return {
                ...u,
                name: u.mssv,
                mssv: u.name,
                username: u.name,
                email: (u.email && u.email.includes('@student.hcmus.edu.vn')) ? '' : u.email
              };
            }
            if (u.email && u.email.includes('@student.hcmus.edu.vn')) {
              return { ...u, email: '' };
            }
            return u;
          });
          setUsersList(normalized);
        }
      }
      const cachedActs = localStorage.getItem('cached_admin_activities');
      if (cachedActs) setActivities(JSON.parse(cachedActs));
      const cachedBranches = localStorage.getItem('cached_admin_branches');
      if (cachedBranches) setBranches(JSON.parse(cachedBranches));
      const cachedTerms = localStorage.getItem('cached_bch_terms');
      if (cachedTerms) {
        try {
          const parsedTerms = JSON.parse(cachedTerms);
          if (Array.isArray(parsedTerms.doanKhoaTerms)) setDoanKhoaTerms(parsedTerms.doanKhoaTerms);
          if (Array.isArray(parsedTerms.doanKhoaPeriods)) setDoanKhoaPeriods(parsedTerms.doanKhoaPeriods);
          if (Array.isArray(parsedTerms.chiDoanTerms)) setChiDoanTerms(parsedTerms.chiDoanTerms);
        } catch {}
      }
      const cachedSheets = localStorage.getItem('cached_sheets_config');
      if (cachedSheets) {
        try {
          setSheetsConfig(JSON.parse(cachedSheets));
        } catch {}
      }
    } catch {}
    fetchActivities();
    fetchUsers();
    fetchBchTerms();
    fetchSheetsConfig();
    if (isAdmin || isBranch) {
      fetchBranches();
    }
    if (isAdmin) {
      fetchHandbookTopics();
      fetchAnnouncements();
    }
  }, [currentUser?.uid, isAdmin, isBranch]);

  const fetchBchTerms = async () => {
    let dkTerms = DEFAULT_DOAN_KHOA_TERMS;
    let dkPeriods = DEFAULT_DOAN_KHOA_PERIODS;
    let cdTerms = DEFAULT_CHI_DOAN_TERMS;

    try {
      const termsDocRef = doc(db, 'system', 'bch_terms');
      const termsDocSnap = await getDoc(termsDocRef);

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

      try {
        localStorage.setItem('cached_bch_terms', JSON.stringify({
          doanKhoaTerms: activeDkTerms,
          doanKhoaPeriods: activeDkPeriods,
          chiDoanTerms: activeCdTerms,
        }));
      } catch {}

      // Only sync to Firestore if admin and active list cleaned
      if (isAdmin) {
        try {
          await setDoc(termsDocRef, {
            doanKhoaTerms: activeDkTerms,
            doanKhoaPeriods: activeDkPeriods,
            chiDoanTerms: activeCdTerms,
            updatedAt: Date.now()
          }, { merge: true });
        } catch (writeErr) {
          if (!isOfflineOrNetworkError(writeErr) && !isQuotaExceededError(writeErr)) {
            console.warn("Không thể lưu cập nhật nhiệm kỳ lên Firestore:", writeErr);
          }
        }
      }
    } catch (e: any) {
      if (isOfflineOrNetworkError(e) || isQuotaExceededError(e)) {
        console.warn("Đang chạy ở chế độ ngoại tuyến (sử dụng danh sách nhiệm kỳ mặc định/bộ nhớ đệm).");
      } else {
        console.warn("Không thể tải danh sách nhiệm kỳ từ Firestore, sử dụng danh sách mặc định:", e);
      }
    }
  };

  const fetchSheetsConfig = async () => {
    try {
      const cfgDoc = await getDoc(doc(db, 'system', 'sheets_config'));
      if (cfgDoc.exists()) {
        const data = cfgDoc.data() as any;
        setSheetsConfig(data);
        try {
          localStorage.setItem('cached_sheets_config', JSON.stringify(data));
        } catch {}
      }
    } catch (err) {
      if (!isOfflineOrNetworkError(err) && !isQuotaExceededError(err)) {
        console.warn("Error loading sheets_config:", err);
      }
    }
  };

  const handleCreateGoogleSheet = async () => {
    setIsConnectingSheets(true);
    setSheetsSyncErrorMsg('');
    setSheetsSyncSuccessMsg('');
    try {
      const token = await getGoogleSheetsAccessToken(true);
      const res = await createTrackingSpreadsheet(token, {
        title: 'Bảng Theo Dõi & Quản Lý Hoạt Động Chi Đoàn - FETEL',
        branches,
        activities,
        usersList,
        semesterFilter: trackingSemester,
        yearFilter: trackingYear,
      });

      const newConfig = {
        spreadsheetId: res.spreadsheetId,
        spreadsheetUrl: res.spreadsheetUrl,
        title: 'Bảng Theo Dõi & Quản Lý Hoạt Động Chi Đoàn - FETEL',
        lastSyncedAt: Date.now(),
        autoSyncOnApprove: true,
        syncedBy: currentUser?.email || currentUser?.name || 'Admin',
      };

      await setDoc(doc(db, 'system', 'sheets_config'), newConfig);
      setSheetsConfig(newConfig);
      setSheetsSyncSuccessMsg('✅ Đã tạo thành công Google Sheet và đồng bộ toàn bộ dữ liệu!');
    } catch (err: any) {
      console.error('Lỗi tạo Google Sheet:', err);
      setSheetsSyncErrorMsg(err?.message || 'Không thể tạo Google Sheet. Vui lòng cấp quyền hoặc thử lại!');
    } finally {
      setIsConnectingSheets(false);
    }
  };

  const handleSyncToGoogleSheet = async () => {
    if (!sheetsConfig?.spreadsheetId) return;
    setIsSyncingSheets(true);
    setSheetsSyncErrorMsg('');
    setSheetsSyncSuccessMsg('');
    try {
      let token: string;
      if (hasCachedToken()) {
        token = await getGoogleSheetsAccessToken(false);
      } else {
        token = await getGoogleSheetsAccessToken(true);
      }
      await syncTrackingSpreadsheet(token, sheetsConfig.spreadsheetId, {
        branches,
        activities,
        usersList,
        semesterFilter: trackingSemester,
        yearFilter: trackingYear,
      });

      const updatedConfig = {
        ...sheetsConfig,
        lastSyncedAt: Date.now(),
        syncedBy: currentUser?.email || currentUser?.name || 'Admin',
      };
      await setDoc(doc(db, 'system', 'sheets_config'), updatedConfig, { merge: true });
      setSheetsConfig(updatedConfig);
      setSheetsSyncSuccessMsg('✅ Đã đồng bộ toàn bộ bảng theo dõi lên Google Sheet thành công!');
    } catch (err: any) {
      console.error('Lỗi đồng bộ Google Sheet:', err);
      setSheetsSyncErrorMsg(err?.message || 'Lỗi khi đồng bộ lên Google Sheet. Vui lòng thử lại!');
    } finally {
      setIsSyncingSheets(false);
    }
  };

  const handleLinkCustomSheet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customSheetInput.trim()) return;
    const cleanId = extractSpreadsheetId(customSheetInput);
    if (!cleanId) {
      alert('Vui lòng nhập ID hoặc link hợp lệ của Google Sheet!');
      return;
    }

    setIsConnectingSheets(true);
    setSheetsSyncErrorMsg('');
    setSheetsSyncSuccessMsg('');
    try {
      const token = await getGoogleSheetsAccessToken(true);
      await syncTrackingSpreadsheet(token, cleanId, {
        branches,
        activities,
        usersList,
        semesterFilter: trackingSemester,
        yearFilter: trackingYear,
      });

      const newConfig = {
        spreadsheetId: cleanId,
        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${cleanId}/edit`,
        title: 'Bảng Theo Dõi & Quản Lý Hoạt Động Chi Đoàn - FETEL',
        lastSyncedAt: Date.now(),
        autoSyncOnApprove: true,
        syncedBy: currentUser?.email || currentUser?.name || 'Admin',
      };

      await setDoc(doc(db, 'system', 'sheets_config'), newConfig);
      setSheetsConfig(newConfig);
      setShowLinkCustomModal(false);
      setCustomSheetInput('');
      setSheetsSyncSuccessMsg('✅ Đã liên kết và đồng bộ thành công với Google Sheet!');
    } catch (err: any) {
      console.error('Lỗi liên kết Google Sheet:', err);
      setSheetsSyncErrorMsg(err?.message || 'Không thể liên kết với Sheet này. Vui lòng kiểm tra quyền truy cập!');
    } finally {
      setIsConnectingSheets(false);
    }
  };

  const handleToggleAutoSync = async () => {
    if (!sheetsConfig?.spreadsheetId) return;
    const newAutoSync = !sheetsConfig.autoSyncOnApprove;
    const updated = { ...sheetsConfig, autoSyncOnApprove: newAutoSync };
    setSheetsConfig(updated);
    try {
      await setDoc(doc(db, 'system', 'sheets_config'), { autoSyncOnApprove: newAutoSync }, { merge: true });
    } catch (err) {
      console.warn('Lỗi lưu cài đặt auto-sync:', err);
    }
  };

  const handleUnlinkSheet = async () => {
    if (!window.confirm('Bạn có chắc muốn hủy liên kết Google Sheet này? (Bảng tính trên Google Drive của bạn vẫn được giữ nguyên)')) return;
    try {
      await deleteDoc(doc(db, 'system', 'sheets_config'));
      setSheetsConfig(null);
      setSheetsSyncSuccessMsg('Đã hủy liên kết Google Sheet.');
    } catch (err) {
      console.error('Lỗi hủy liên kết:', err);
    }
  };

  const fetchAnnouncements = async () => {
    setLoadingAnnouncements(true);
    try {
      const q = query(collection(db, 'notifications'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAnnouncementsList(list);
    } catch (err) {
      if (!isOfflineOrNetworkError(err) && !isQuotaExceededError(err)) {
        console.warn('Error fetching notifications:', err);
      }
    } finally {
      setLoadingAnnouncements(false);
    }
  };

  const handleDeleteAnnouncement = async (id: string, title: string) => {
    try {
      await deleteDoc(doc(db, 'notifications', id));
      setAnnouncementsList(prev => prev.filter(a => a.id !== id));
      try {
        window.dispatchEvent(new CustomEvent('notification_deleted', { detail: { id } }));
      } catch {}
    } catch (err: any) {
      console.error("Lỗi khi xóa thông báo:", err);
    }
  };

  const handleConnectGmail = async () => {
    setIsConnectingGmail(true);
    setSendResultMsg(null);
    try {
      const res = await getGmailAccessToken(true, 'dkdtvt.hcmus@gmail.com');
      setGmailConnectedEmail(res.email);
      setSendResultMsg({ type: 'success', text: `Đã kết nối thành công với tài khoản Gmail: ${res.email}` });
    } catch (e: any) {
      console.warn('Lỗi kết nối Gmail:', e);
      setSendResultMsg({ type: 'error', text: e.message || 'Không thể kết nối Gmail Đoàn khoa.' });
    } finally {
      setIsConnectingGmail(false);
    }
  };

  const handleFetchEmails = async () => {
    setIsFetchingEmails(true);
    setSendResultMsg(null);
    try {
      let tokenInfo: { token: string; email: string };
      try {
        tokenInfo = hasCachedGmailToken()
          ? await getGmailAccessToken(false, 'dkdtvt.hcmus@gmail.com')
          : await getGmailAccessToken(true, 'dkdtvt.hcmus@gmail.com');
      } catch (authErr: any) {
        setIsFetchingEmails(false);
        setSendResultMsg({ type: 'error', text: authErr?.message || 'Không thể xác thực quyền truy cập Gmail.' });
        return;
      }

      setGmailConnectedEmail(tokenInfo.email);
      let emails: GmailMessageSummary[] = [];
      try {
        emails = await fetchRecentEmails(tokenInfo.token, emailSearchQuery);
      } catch (fetchErr: any) {
        // If token expired, clear cache and try interactive login once
        setCachedGmailToken(null, null);
        if (String(fetchErr?.message || '').includes('401') || String(fetchErr?.message || '').includes('403')) {
          tokenInfo = await getGmailAccessToken(true, 'dkdtvt.hcmus@gmail.com');
          setGmailConnectedEmail(tokenInfo.email);
          emails = await fetchRecentEmails(tokenInfo.token, emailSearchQuery);
        } else {
          throw fetchErr;
        }
      }

      setRecentEmails(emails);
      if (emails.length === 0) {
        setSendResultMsg({ type: 'error', text: 'Không tìm thấy email nào phù hợp với từ khóa tìm kiếm trong hộp thư đến.' });
      } else {
        setSendResultMsg({ type: 'success', text: `Đã tải thành công ${emails.length} email gần đây từ hộp thư ${tokenInfo.email}.` });
      }
    } catch (e: any) {
      console.warn('Lỗi tải email:', e);
      setSendResultMsg({ type: 'error', text: e.message || 'Lỗi khi đọc email từ Gmail Đoàn khoa.' });
    } finally {
      setIsFetchingEmails(false);
    }
  };

  const handleSelectEmailForForward = (msg: GmailMessageSummary) => {
    setSelectedEmailSource(msg);
    setAnnounceTitle(`[ĐOÀN KHOA ĐTVT - CHUYỂN TIẾP] ${msg.subject.replace(/^(re:|fwd:|fwd:)\s*/i, '')}`);
    
    const formattedIntro = `Kính gửi Ban Chấp hành các Chi đoàn trực thuộc,\n\nBan Chấp hành Đoàn khoa Điện tử - Viễn thông chuyển tiếp thông báo từ Đoàn trường Đại học Khoa học tự nhiên đến các Chi đoàn.\nĐề nghị các đồng chí Bí thư, Phó Bí thư và Ủy viên BCH Chi đoàn nghiên cứu nội dung và triển khai kịp thời đến đoàn viên sinh viên trong lớp.\n\n` +
      `-----------------------------------------\n` +
      `THÔNG TIN GỐC TỪ ĐOÀN TRƯỜNG:\n` +
      `- Người gửi: ${msg.from}\n` +
      `- Ngày gửi: ${msg.date}\n` +
      `- Tiêu đề: ${msg.subject}\n` +
      `-----------------------------------------\n\n` +
      `${msg.bodyText}\n\n` +
      `Trân trọng,\nBCH Đoàn khoa Điện tử - Viễn thông\nEmail: dkdtvt.hcmus@gmail.com`;

    setAnnounceBody(formattedIntro);

    if (msg.attachments && msg.attachments.length > 0) {
      setAttachedFiles(msg.attachments.map(att => ({
        filename: att.filename,
        mimeType: att.mimeType,
        size: att.size,
        attachmentId: att.attachmentId,
        messageId: msg.id
      })));
    } else {
      setAttachedFiles([]);
    }
  };

  const handleLocalFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64Data = result.split(',')[1] || '';
        setAttachedFiles(prev => [
          ...prev,
          {
            filename: file.name,
            mimeType: file.type || 'application/pdf',
            size: file.size,
            dataBase64: base64Data
          }
        ]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const getRecipientEmailsList = (): string[] => {
    const list: string[] = [];
    const targetBranches = announceTarget === 'all' || announceTarget === 'branches'
      ? branches.map(b => b.name)
      : selectedBranchesForMail;

    targetBranches.forEach(bName => {
      const branchUsers = usersList.filter(u => 
        u.branch && u.branch.trim().toLowerCase() === bName.trim().toLowerCase()
      );
      const bchUsers = branchUsers.filter(u => u.role === 'chidoan' || (u.branchRole && u.branchRole.trim() !== ''));
      let foundEmail = false;
      bchUsers.forEach(u => {
        if (u.email && u.email.includes('@') && !u.email.endsWith('@chidoan.fetel')) {
          if (!list.includes(u.email)) {
            list.push(u.email);
            foundEmail = true;
          }
        }
      });
      if (!foundEmail) {
        const cleanName = bName.toLowerCase().replace(/[^a-z0-9]/g, '');
        const defaultEmail = `bchchidoan${cleanName}@gmail.com`;
        if (!list.includes(defaultEmail)) {
          list.push(defaultEmail);
        }
      }
    });

    // Append custom recipients
    customRecipients.forEach(cr => {
      const clean = cr.trim();
      if (clean && clean.includes('@') && !list.includes(clean)) {
        list.push(clean);
      }
    });

    return list;
  };

  const handleExecuteSend = async () => {
    if (!announceTitle.trim() || !announceBody.trim()) {
      alert('Vui lòng nhập đầy đủ tiêu đề và nội dung thông báo!');
      return;
    }

    if (!sendViaInApp && !sendViaGmail) {
      alert('Vui lòng chọn ít nhất 01 hình thức gửi (Trên App hoặc qua Gmail)!');
      return;
    }

    setIsSendingAnnouncement(true);
    setSendResultMsg(null);
    try {
      let emailSuccess = 0;
      let senderEmail = 'dkdtvt.hcmus@gmail.com';

      // 1. In-App Notification
      if (sendViaInApp) {
        await addDoc(collection(db, 'notifications'), {
          title: announceTitle,
          message: announceBody,
          targetAudience: announceTarget === 'all' ? 'all' : (announceTarget === 'branches' ? 'chidoan' : selectedBranchesForMail.join(', ')),
          attachmentsCount: attachedFiles.length,
          hasPdf: attachedFiles.some(f => f.filename.toLowerCase().endsWith('.pdf')),
          sentBy: 'dkdtvt.hcmus@gmail.com',
          createdAt: Date.now()
        });
      }

      // 2. Gmail Send
      if (sendViaGmail) {
        let tokenInfo = hasCachedGmailToken()
          ? await getGmailAccessToken(false, 'dkdtvt.hcmus@gmail.com')
          : await getGmailAccessToken(true, 'dkdtvt.hcmus@gmail.com');
        
        setGmailConnectedEmail(tokenInfo.email);
        senderEmail = tokenInfo.email;

        // Resolve any pending attachment data
        const resolvedAttachments: Array<{ filename: string; mimeType: string; dataBase64: string }> = [];
        for (const att of attachedFiles) {
          if (att.dataBase64) {
            resolvedAttachments.push({
              filename: att.filename,
              mimeType: att.mimeType,
              dataBase64: att.dataBase64
            });
          } else if (att.messageId && att.attachmentId) {
            const fetchedBase64 = await fetchAttachmentContent(tokenInfo.token, att.messageId, att.attachmentId);
            resolvedAttachments.push({
              filename: att.filename,
              mimeType: att.mimeType,
              dataBase64: fetchedBase64
            });
          }
        }

        const recipientEmails = getRecipientEmailsList();
        const res = await sendBulkNotificationEmail(tokenInfo.token, {
          fromEmail: tokenInfo.email,
          fromName: 'BCH Đoàn khoa Điện tử - Viễn thông',
          replyToEmail: 'dkdtvt.hcmus@gmail.com',
          recipients: recipientEmails,
          subject: announceTitle,
          bodyText: announceBody,
          attachments: resolvedAttachments
        });
        emailSuccess = res.successCount;
      }

      setShowSendConfirmModal(false);
      setSendResultMsg({
        type: 'success',
        text: `Đã phát hành thông báo thành công!${sendViaGmail ? ` (Đã gửi email đến ${emailSuccess} địa chỉ từ hộp thư ${senderEmail})` : ''}`
      });
      // Reset form
      setAnnounceTitle('');
      setAnnounceBody('');
      setAttachedFiles([]);
      setCustomRecipients([]);
      setSelectedEmailSource(null);
      fetchAnnouncements();
    } catch (err: any) {
      console.error('Lỗi phát hành thông báo:', err);
      setShowSendConfirmModal(false);
      setSendResultMsg({
        type: 'error',
        text: err?.message || 'Không thể gửi email. Bạn vui lòng bấm nút "Kết nối Gmail Đoàn khoa" ở trên để cấp quyền gửi trước nhé!'
      });
    } finally {
      setIsSendingAnnouncement(false);
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

  const handleCleanKhoa2024 = async () => {
    try {
      const snap = await getDocs(collection(db, 'branches'));
      let count = 0;
      for (const d of snap.docs) {
        const name = (d.data().name || '').trim();
        if (/^(chi\s*đoàn\s*)?(24|2024)/i.test(name)) {
          await deleteDoc(doc(db, 'branches', d.id));
          count++;
        }
      }
      await fetchBranches();
      await handleAutoCleanAndSyncUsers(false);
    } catch (e: any) {
      console.error(e);
      alert("Lỗi khi xóa Chi đoàn khóa 2024: " + (e?.message || "Lỗi mạng"));
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
        const rawList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
        
        let migrated = false;
        const updatedList = [];
        const seenNames = new Set<string>();

        for (const b of rawList) {
          const cleanName = (b.name || '').trim();
          
          // Completely delete any branch belonging to Khóa 2024 (e.g. 24..., 2024..., Chi đoàn 24...)
          const isKhoa2024 = /^(chi\s*đoàn\s*)?(24|2024)/i.test(cleanName);
          const isObsoleteIcd1 = cleanName === '25ICD1' || cleanName === '26ICD1' || cleanName.toLowerCase() === 'chi đoàn 25icd1' || cleanName.toLowerCase() === 'chi đoàn 26icd1';

          if (isKhoa2024 || isObsoleteIcd1) {
            await deleteDoc(doc(db, 'branches', b.id));
            migrated = true;
            continue;
          }

          // Remove duplicate branch entries if any
          if (seenNames.has(cleanName)) {
            await deleteDoc(doc(db, 'branches', b.id));
            continue;
          }
          seenNames.add(cleanName);
          updatedList.push(b);
        }

        const existingNames = updatedList.map(b => b.name);
        const missingDefaultBranches = DEFAULT_BRANCHES.filter(name => !existingNames.includes(name));
        
        if (missingDefaultBranches.length > 0) {
          for (const bName of missingDefaultBranches) {
            const docRef = await addDoc(collection(db, 'branches'), { name: bName, createdAt: Date.now() });
            updatedList.push({ id: docRef.id, name: bName });
            migrated = true;
          }
        }
        
        if (migrated) {
          const oldNames = ['25ICD1', '26ICD1'];
          const newNames = ['25ICD', '26ICD'];
          
          const usersRef = collection(db, 'users');
          const usersSnap = await getDocs(usersRef);
          for (const userDoc of usersSnap.docs) {
            const userData = userDoc.data();
            const currentB = (userData.branch || '').trim();
            const isUserKhoa2024 = /^(chi\s*đoàn\s*)?(24|2024)/i.test(currentB);
            const idx = oldNames.indexOf(currentB);

            if (isUserKhoa2024) {
              await updateDoc(doc(db, 'users', userDoc.id), {
                branch: '',
                branchRole: null,
                branchTerm: null,
                updatedAt: Date.now()
              });
            } else if (idx !== -1) {
              await updateDoc(doc(db, 'users', userDoc.id), {
                branch: newNames[idx],
                updatedAt: Date.now()
              });
            }
          }
          
          const activitiesRef = collection(db, 'activities');
          const activitiesSnap = await getDocs(activitiesRef);
          for (const activityDoc of activitiesSnap.docs) {
            const actData = activityDoc.data();
            let needsUpdate = false;
            const updateFields: any = {};
            
            const currentActBranch = (actData.branch || '').trim();
            const currentActTarget = (actData.targetAudience || '').trim();

            if (/^(chi\s*đoàn\s*)?(24|2024)/i.test(currentActBranch)) {
              updateFields.branch = '';
              needsUpdate = true;
            } else {
              const branchIdx = oldNames.indexOf(currentActBranch);
              if (branchIdx !== -1) {
                updateFields.branch = newNames[branchIdx];
                needsUpdate = true;
              }
            }
            
            if (/^(chi\s*đoàn\s*)?(24|2024)/i.test(currentActTarget)) {
              updateFields.targetAudience = 'all';
              needsUpdate = true;
            } else {
              const targetIdx = oldNames.indexOf(currentActTarget);
              if (targetIdx !== -1) {
                updateFields.targetAudience = newNames[targetIdx];
                needsUpdate = true;
              }
            }
            
            if (actData.cooperatingBranches && Array.isArray(actData.cooperatingBranches)) {
              const updatedCooperating = actData.cooperatingBranches
                .filter((cb: string) => !/^(chi\s*đoàn\s*)?(24|2024)/i.test(cb))
                .map((cb: string) => {
                  const idx = oldNames.indexOf(cb);
                  return idx !== -1 ? newNames[idx] : cb;
                });
              if (JSON.stringify(updatedCooperating) !== JSON.stringify(actData.cooperatingBranches)) {
                updateFields.cooperatingBranches = updatedCooperating;
                needsUpdate = true;
              }
            }
            
            if (actData.branches && Array.isArray(actData.branches)) {
              const updatedBranches = actData.branches
                .filter((b: string) => !/^(chi\s*đoàn\s*)?(24|2024)/i.test(b))
                .map((b: string) => {
                  const idx = oldNames.indexOf(b);
                  return idx !== -1 ? newNames[idx] : b;
                });
              if (JSON.stringify(updatedBranches) !== JSON.stringify(actData.branches)) {
                updateFields.branches = updatedBranches;
                needsUpdate = true;
              }
            }
            
            if (needsUpdate) {
              updateFields.updatedAt = Date.now();
              await updateDoc(doc(db, 'activities', activityDoc.id), updateFields);
            }
          }

          // Clean up system/bch_cache as well
          try {
            const bchCacheSnap = await getDoc(doc(db, 'system', 'bch_cache'));
            if (bchCacheSnap.exists() && Array.isArray(bchCacheSnap.data().members)) {
              let cacheChanged = false;
              const cleanedBch = bchCacheSnap.data().members
                .filter((m: any) => {
                  const b = (m.branch || '').trim();
                  if (/^(chi\s*đoàn\s*)?(24|2024)/i.test(b)) {
                    if (!m.committeeRole || m.committeeRole.trim() === '') {
                      cacheChanged = true;
                      return false;
                    }
                  }
                  return true;
                })
                .map((m: any) => {
                  const b = (m.branch || '').trim();
                  if (/^(chi\s*đoàn\s*)?(24|2024)/i.test(b)) {
                    cacheChanged = true;
                    return { ...m, branch: 'Đoàn khoa ĐTVT', branchRole: null };
                  }
                  if (b === '25ICD1') {
                    cacheChanged = true;
                    return { ...m, branch: '25ICD' };
                  }
                  if (b === '26ICD1') {
                    cacheChanged = true;
                    return { ...m, branch: '26ICD' };
                  }
                  return m;
                });
              if (cacheChanged) {
                await setDoc(doc(db, 'system', 'bch_cache'), { members: cleanedBch, updatedAt: Date.now() }, { merge: true });
                try {
                  localStorage.setItem('cached_bch_members', JSON.stringify(cleanedBch));
                  window.dispatchEvent(new CustomEvent('bch_updated', { detail: cleanedBch }));
                } catch {}
              }
            }
          } catch {}
          
          fetchUsers();
          fetchActivities();
        }
        
        updatedList.sort((a, b) => a.name.localeCompare(b.name));
        setBranches(updatedList);
        try {
          localStorage.setItem('cached_admin_branches', JSON.stringify(updatedList));
        } catch {}
      }
    } catch (err) {
      if (isQuotaExceededError(err)) {
        setQuotaExceeded(true);
      } else {
        console.error('Lỗi tải Chi đoàn:', err);
      }
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

  const findBranchMatch = (rawBranchName: string) => {
    if (!rawBranchName) return null;
    const clean = rawBranchName.trim();
    // 1. Exact match
    let found = branches.find(b => (b.name || '').toLowerCase().trim() === clean.toLowerCase());
    if (found) return found;

    // 2. Normalized match stripping "bch", "chi đoàn", spaces, underscores
    const normalize = (s: string) => (s || '').toLowerCase().replace(/^(bch|chi\s*đoàn)\s*/i, '').replace(/[\s_-]+/g, '');
    const cleanNorm = normalize(clean);
    found = branches.find(b => normalize(b.name) === cleanNorm);
    if (found) return found;

    // 3. Substring match
    found = branches.find(b => cleanNorm.includes(normalize(b.name)) || normalize(b.name).includes(cleanNorm));
    return found || null;
  };

  useEffect(() => {
    if (isBranch && branches.length > 0 && currentUser?.branch) {
      const mb = findBranchMatch(currentUser.branch);
      if (mb) {
        setMyDriveLink(mb.activityDriveLink || '');
      }
    }
  }, [branches, isBranch, currentUser]);

  const handleSaveDriveLink = async () => {
    if (!currentUser?.branch) return;
    setSavingDriveLink(true);
    setSaveSuccess(false);
    setDriveErrorMsg('');
    try {
      const mb = findBranchMatch(currentUser.branch);
      if (mb) {
        await updateDoc(doc(db, 'branches', mb.id), {
          activityDriveLink: myDriveLink.trim(),
          updatedAt: Date.now()
        });
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 4000);
        await fetchBranches();
      } else {
        const normalizedName = currentUser.branch.replace(/^(bch|chi\s*đoàn)\s*/i, '').trim() || currentUser.branch;
        await addDoc(collection(db, 'branches'), {
          name: normalizedName,
          activityDriveLink: myDriveLink.trim(),
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 4000);
        await fetchBranches();
      }
    } catch (e: any) {
      console.error(e);
      setDriveErrorMsg('Không thể cập nhật link Drive: ' + (e?.message || 'Lỗi mạng hoặc phân quyền. Vui lòng thử lại.'));
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

  const handleAutoCleanAndSyncUsers = async (silent = false) => {
    if (!isAdmin) return;
    setIsCleaningUsers(true);
    if (!silent) setCleanResultMsg(null);

    try {
      const snapshot = await getDocs(collection(db, 'users'));
      const allDocs = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

      let deletedK24Count = 0;
      let deletedJunkCount = 0;
      let updatedStudentCount = 0;
      let deletedDuplicatePlaceholders = 0;

      const placeholdersToDelete = new Set<string>();

      for (const u of allDocs) {
        const uId = u.id;
        const uName = String(u.name || '').trim();
        const uMssv = String(u.mssv || u.username || '').trim();
        const uBranch = String(u.branch || '').trim();
        const uEmail = String(u.email || '').toLowerCase().trim();
        const uRole = u.role || 'doanvien';

        // 1. Identify K24 accounts and placeholders to delete
        const isK24 = 
          uId.startsWith('profile_24') ||
          uMssv.startsWith('24') ||
          /^(chi\s*đoàn\s*)?24/i.test(uBranch) ||
          uName.includes('24_') ||
          /24\d{6}/.test(uName) ||
          /24\d{6}/.test(uEmail);

        if (isK24) {
          try {
            await deleteDoc(doc(db, 'users', uId));
            deletedK24Count++;
          } catch (e) {
            console.warn('Could not delete K24 doc:', uId, e);
          }
          continue;
        }

        // 2. Identify obvious junk / test nicknames
        const JUNK_EMAILS = ['datsky303@gmail.com', 'rubikkup.247@gmail.com', 'kirito6685@gmail.com'];
        const isJunkAccount = 
          JUNK_EMAILS.includes(uEmail) || 
          (!uName && !uMssv && !uEmail) ||
          (uRole === 'doanvien' && !uId.startsWith('profile_') && !uMssv && (uName === 'Rubikkup' || uName === 'Đạt Sky' || uName === 'Tân Kỳ'));

        if (isJunkAccount) {
          try {
            await deleteDoc(doc(db, 'users', uId));
            deletedJunkCount++;
          } catch (e) {
            console.warn('Could not delete junk doc:', uId, e);
          }
          continue;
        }

        // 3. Fix 25ICD1 duplicate placeholders (e.g. profile_25300036)
        if (uId.startsWith('profile_253000')) {
          try {
            await deleteDoc(doc(db, 'users', uId));
            deletedDuplicatePlaceholders++;
          } catch {}
          continue;
        }

        // 4. Reconcile active student accounts (role === 'doanvien', signed in via Google)
        // If student is mislabeled as "Đoàn khoa ĐTVT" or has empty MSSV or distorted name
        if (!uId.startsWith('profile_') && uRole === 'doanvien' && uEmail !== 'dinhtienanh.hcmus@gmail.com' && uEmail !== 'dkdtvt.hcmus@gmail.com') {
          const isMislabeledDoanKhoa = uBranch === 'Đoàn khoa ĐTVT' || uBranch === 'Đoàn khoa ĐT-VT' || !uBranch;
          
          // Try to match student to 25ICD canonical roster
          const match = matchStudentTo25ICD(uName, uEmail);
          if (match) {
            const updates: any = {
              name: match.name,
              mssv: match.mssv,
              username: match.mssv,
              branch: '25ICD',
              updatedAt: Date.now()
            };
            if (uEmail.includes('@student.hcmus.edu.vn')) {
              updates.email = '';
            }
            await updateDoc(doc(db, 'users', uId), updates);
            updatedStudentCount++;

            if (match.profileId) {
              placeholdersToDelete.add(match.profileId);
            }
            placeholdersToDelete.add(`profile_${match.mssv}`);
          } else if (isMislabeledDoanKhoa) {
            // Check if matches 26ICD (e.g. Minh Triết)
            if (uEmail === 'triet6985@gmail.com' || uName.toLowerCase().includes('minh triet')) {
              await updateDoc(doc(db, 'users', uId), {
                name: 'Nguyễn Đặng Minh Triết',
                mssv: '26300078',
                username: '26300078',
                branch: '26ICD',
                updatedAt: Date.now()
              });
              updatedStudentCount++;
            } else if (uEmail === 'dinhtienanh.ltt2006@gmail.com') {
              // Admin personal alt account
              await updateDoc(doc(db, 'users', uId), { branch: 'Đoàn khoa ĐT-VT', role: 'admin', updatedAt: Date.now() });
            } else {
              // Other regular student: reset branch to empty, never Đoàn khoa ĐTVT
              await updateDoc(doc(db, 'users', uId), { branch: '', updatedAt: Date.now() });
            }
          }
        }
      }

      // Delete redundant placeholder profiles that were merged with active user accounts
      for (const pId of placeholdersToDelete) {
        try {
          await deleteDoc(doc(db, 'users', pId));
          deletedDuplicatePlaceholders++;
        } catch {}
      }

      // 5. Clean and sync system/bch_cache
      try {
        const freshSnap = await getDocs(collection(db, 'users'));
        const freshUsers = freshSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
        
        const cleanBchMembers = freshUsers.filter((u: any) => {
          const hasCommRole = Boolean(u.committeeRole && String(u.committeeRole).trim() !== '');
          const hasBrRole = Boolean(u.branchRole && String(u.branchRole).trim() !== '');
          if (!hasCommRole && !hasBrRole) return false;
          
          const b = String(u.branch || '').trim();
          const m = String(u.mssv || u.username || '').trim();
          const n = String(u.name || '').trim();
          if (/^(chi\s*đoàn\s*)?24/i.test(b) || m.startsWith('24') || n.includes('24_') || u.id.startsWith('profile_24')) {
            return false;
          }
          return true;
        }).map((m: any) => {
          if (m.branch === '25ICD1') {
            return { ...m, branch: '25ICD' };
          }
          return m;
        });

        await setDoc(doc(db, 'system', 'bch_cache'), { members: cleanBchMembers, updatedAt: Date.now() }, { merge: true });
        localStorage.setItem('cached_bch_members', JSON.stringify(cleanBchMembers));
        window.dispatchEvent(new CustomEvent('bch_updated', { detail: cleanBchMembers }));
      } catch (e) {
        console.warn('Could not update bch_cache:', e);
      }

      const summaryMsg = `Hoàn tất dọn dẹp: Đã xóa ${deletedK24Count} hồ sơ/tài khoản K24, ${deletedJunkCount} tài khoản rác, ${deletedDuplicatePlaceholders} hồ sơ tạm; Đã chuẩn hóa ${updatedStudentCount} tài khoản sinh viên về đúng Chi đoàn 25ICD/26ICD và cập nhật BCH lên Trang chủ.`;
      setCleanResultMsg({ type: 'success', text: summaryMsg });
    } catch (err: any) {
      console.error('Error during auto clean:', err);
      setCleanResultMsg({ type: 'error', text: 'Có lỗi xảy ra trong quá trình dọn dẹp: ' + (err?.message || 'Lỗi mạng') });
    } finally {
      setIsCleaningUsers(false);
    }
  };

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const snapshot = await getDocs(collection(db, 'users'));
      const rawUsers = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

      // Auto-trigger clean & sync if admin is viewing and legacy invalid data is detected
      if (isAdmin) {
        const hasLegacyInvalid = rawUsers.some(u => 
          u.id.startsWith('profile_24') || 
          (u.mssv && String(u.mssv).startsWith('24')) ||
          u.id.startsWith('profile_253000') ||
          (u.role === 'doanvien' && !u.id.startsWith('profile_') && (u.branch === 'Đoàn khoa ĐTVT' || u.branch === 'Đoàn khoa ĐT-VT') && u.email !== 'dinhtienanh.hcmus@gmail.com' && u.email !== 'dkdtvt.hcmus@gmail.com')
        );
        if (hasLegacyInvalid && !isCleaningUsers) {
          handleAutoCleanAndSyncUsers(true).catch(console.error);
        }
      }
      
      // 1. Phân loại tài khoản đã đăng nhập thực tế (dùng Auth UID)
      const activeUserMssvs = new Set<string>();
      const activeUserEmails = new Set<string>();
      
      rawUsers.forEach(u => {
        if (!u.id.startsWith('profile_')) {
          const m = (u.mssv || u.username || '').toLowerCase().trim();
          if (m) activeUserMssvs.add(m);
          const email = (u.email || '').toLowerCase().trim();
          if (email) activeUserEmails.add(email);
        }
      });

      // 2. Lọc bỏ các bản ghi placeholder profile_ bị trùng lặp với tài khoản đã kích hoạt
      const deduplicatedRaw: any[] = [];
      const seenIdentity = new Set<string>();

      // Sắp xếp: Ưu tiên tài khoản thật (Auth UID) đứng trước, placeholder profile_ đứng sau
      const sortedUsers = [...rawUsers].sort((a, b) => {
        const aIsProf = a.id.startsWith('profile_') ? 1 : 0;
        const bIsProf = b.id.startsWith('profile_') ? 1 : 0;
        return aIsProf - bIsProf;
      });

      for (const usr of sortedUsers) {
        const isPlaceholder = usr.id.startsWith('profile_');
        const mssvKey = (usr.mssv || usr.username || (isPlaceholder ? usr.id.replace('profile_', '') : '')).toLowerCase().trim();
        const emailKey = (usr.email || '').toLowerCase().trim();

        // Nếu là bản ghi tạm profile_ nhưng đoàn viên này đã đăng nhập tài khoản thật:
        if (isPlaceholder && ((mssvKey && activeUserMssvs.has(mssvKey)) || (emailKey && activeUserEmails.has(emailKey)))) {
          continue; // Bỏ qua, không đếm trùng vào danh sách và thống kê
        }

        // Kiểm tra tránh trùng lặp giữa các bản ghi placeholder với nhau
        if (mssvKey) {
          if (seenIdentity.has(mssvKey)) {
            continue;
          }
          seenIdentity.add(mssvKey);
        }

        deduplicatedRaw.push(usr);
      }

      const cleanedUsers = deduplicatedRaw.map(usr => {
        let cTerm = usr.committeeTerm;
        let cPeriod = usr.committeePeriod;
        let bTerm = usr.branchTerm;

        let uName = String(usr.name || '').trim();
        let uMssv = String(usr.mssv || '').trim();
        let uUsername = String(usr.username || '').trim();
        let uEmail = String(usr.email || '').trim();

        // 1. Tự động chuẩn hóa nếu Họ tên và MSSV bị lưu ngược (Tên toàn số, MSSV có chữ cái)
        const nameIsNumeric = /^\d{6,10}$/.test(uName);
        const mssvHasText = !/^\d{6,10}$/.test(uMssv) && uMssv.length > 0;
        if (nameIsNumeric && mssvHasText) {
          const actualName = uMssv;
          const actualMssv = uName;
          uName = actualName;
          uMssv = actualMssv;
          uUsername = actualMssv;
        }

        // 2. Xóa bỏ email sinh viên ảo (@student.hcmus.edu.vn)
        if (uEmail.toLowerCase().includes('@student.hcmus.edu.vn')) {
          uEmail = '';
        }

        if (cTerm && isTermExpired(cTerm)) {
          cTerm = null;
        }
        if (cPeriod && isTermExpired(cPeriod)) {
          cPeriod = null;
        }
        if (bTerm && isTermExpired(bTerm)) {
          bTerm = null;
        }

        return {
          ...usr,
          name: uName,
          mssv: uMssv,
          username: uUsername,
          email: uEmail,
          committeeTerm: cTerm,
          committeePeriod: cPeriod,
          branchTerm: bTerm
        };
      });

      if (cleanedUsers.length > 0) {
        setUsersList(cleanedUsers);
        try {
          localStorage.setItem('cached_admin_users', JSON.stringify(cleanedUsers));
        } catch {}
      }
      setQuotaExceeded(false);

      // Sync lightweight BCH summary doc so HomeScreen only needs 1 document read
      try {
        const bchOnly = cleanedUsers.filter(
          (u: any) => (u.committeeRole && String(u.committeeRole).trim() !== '') || (u.branchRole && String(u.branchRole).trim() !== '')
        );
        if (bchOnly.length > 0) {
          setDoc(doc(db, 'system', 'bch_cache'), { members: bchOnly, updatedAt: Date.now() }, { merge: true }).catch(() => {});
        }
      } catch {}
    } catch (e) {
      if (isQuotaExceededError(e)) {
        setQuotaExceeded(true);
      } else {
        console.warn("Error fetching users:", e);
      }
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
        const matched = knownBranches.find(k => k.toLowerCase() === bName.toLowerCase());
        if (matched) {
          statsMap[matched] = (statsMap[matched] || 0) + 1;
          totalDoanVien++;
        }
      }
    });

    const allBranchesData = Object.entries(statsMap)
      .map(([name, value]) => ({ name: `Chi đoàn ${name}`, value }))
      .sort((a, b) => b.value - a.value);

    const chartData = allBranchesData.filter(item => item.value > 0);

    return { chartData, allBranchesData, totalDoanVien };
  };

  const fetchActivities = async () => {
    if (!currentUser) return;
    try {
      const q = query(collection(db, 'activities'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const acts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Activity));
      
      const filteredActs = acts.filter(a => {
        if (isAdmin) return true;
        const userBranch = currentUser?.branch || '';
        const matchesBranch = a.branch === userBranch || (a.branches && a.branches.includes(userBranch));
        const isAuthorizedScan = Boolean(
          a.allowBranchScan &&
          (!a.allowedScanBranches ||
            a.allowedScanBranches.length === 0 ||
            a.allowedScanBranches.includes('all') ||
            (userBranch && a.allowedScanBranches.includes(userBranch)))
        );
        return a.creatorId === currentUser?.uid || matchesBranch || isAuthorizedScan;
      });
      
      setActivities(filteredActs);
      setQuotaExceeded(false);
      try {
        localStorage.setItem('cached_admin_activities', JSON.stringify(filteredActs));
      } catch {}
    } catch (err) {
      if (isQuotaExceededError(err)) {
        setQuotaExceeded(true);
      } else {
        console.error(err);
      }
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
        allowBranchScan: isAdmin ? allowBranchScan : true,
        allowedScanBranches: isAdmin
          ? (allowBranchScan ? (scanBranchScope === 'all' ? ['all'] : allowedScanBranches) : [])
          : [currentUser?.branch || 'all'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      
      await addDoc(collection(db, 'activities'), newAct);

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
      setAllowBranchScan(true);
      setScanBranchScope('all');
      setAllowedScanBranches([]);
      setOrganizerDetails([]);
      setIsCooperating(false);
      setCooperatingBranches([]);
      setOtherCooperators('');
      fetchActivities();
    } catch (err) {
      console.error(err);
    }
  };

  const openScanPermModal = (act: Activity) => {
    setEditingScanPermAct(act);
    const isAllowed = Boolean(act.allowBranchScan);
    setPermAllowBranchScan(isAllowed);
    if (act.allowedScanBranches && act.allowedScanBranches.length > 0 && !act.allowedScanBranches.includes('all')) {
      setPermScanScope('custom');
      setPermScanBranches(act.allowedScanBranches);
    } else {
      setPermScanScope('all');
      setPermScanBranches([]);
    }
  };

  const handleSaveScanPerm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingScanPermAct || !isAdmin) return;
    if (permAllowBranchScan && permScanScope === 'custom' && permScanBranches.length === 0) {
      alert('Vui lòng chọn ít nhất 01 Chi đoàn được phép điểm danh, hoặc chọn "Tất cả Chi đoàn"!');
      return;
    }
    try {
      const updatedBranches = permAllowBranchScan
        ? (permScanScope === 'all' ? ['all'] : permScanBranches)
        : [];
      await updateDoc(doc(db, 'activities', editingScanPermAct.id), {
        allowBranchScan: permAllowBranchScan,
        allowedScanBranches: updatedBranches,
        updatedAt: Date.now()
      });
      setEditingScanPermAct(null);
      fetchActivities();
    } catch (err) {
      console.error('Lỗi cập nhật quyền điểm danh:', err);
      alert('Không thể cập nhật quyền điểm danh cho Chi đoàn.');
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

      // Tự động đồng bộ lên Google Sheet nếu đã liên kết
      if (sheetsConfig?.spreadsheetId && sheetsConfig?.autoSyncOnApprove !== false) {
        if (hasCachedToken()) {
          try {
            const token = await getGoogleSheetsAccessToken(false);
            const updatedActs = activities.map(a => a.id === id ? { ...a, status: 'approved' as const, updatedAt: Date.now() } : a);
            await syncTrackingSpreadsheet(token, sheetsConfig.spreadsheetId, {
              branches,
              activities: updatedActs,
              usersList,
              semesterFilter: trackingSemester,
              yearFilter: trackingYear,
            });
            const updatedConfig = {
              ...sheetsConfig,
              lastSyncedAt: Date.now(),
              syncedBy: currentUser?.email || currentUser?.name || 'Admin',
            };
            await setDoc(doc(db, 'system', 'sheets_config'), updatedConfig, { merge: true });
            setSheetsConfig(updatedConfig);
            setSheetsSyncSuccessMsg(`✅ Đã duyệt hoạt động và tự động cập nhật lên Google Sheet!`);
          } catch (sheetErr) {
            console.warn('Lỗi tự động sync Google Sheet:', sheetErr);
            setSheetsSyncSuccessMsg(`✅ Đã duyệt hoạt động! (Nhấn "Đồng bộ lại" ở tab Theo dõi để cập nhật trang tính)`);
          }
        } else {
          setSheetsSyncSuccessMsg(`✅ Đã duyệt hoạt động "${actName}"! (Nhấn "Đồng bộ toàn bộ" ở tab Theo dõi để cập nhật lên Google Sheet)`);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

      

  const handleReject = async (id: string, actName: string) => {
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
          email: '',
          name: newName.trim(),
          role: 'doanvien',
          branch: activeBranch,
          isMerged: false,
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

    Papa.parse(file, {
      header: false,
      skipEmptyLines: true,
      complete: function(results) {
        const rawRows = results.data as string[][];
        if (!rawRows || rawRows.length === 0) {
          alert("File CSV không có dữ liệu!");
          return;
        }

        // Build in-memory lookup map from usersList
        const existingUserByKey = new Map<string, string>();
        usersList.forEach((u: any) => {
          const mKey = String(u.mssv || '').trim().toLowerCase();
          const uKey = String(u.username || '').trim().toLowerCase();
          if (mKey && !u.id.startsWith('profile_')) existingUserByKey.set(mKey, u.id);
          if (uKey && !u.id.startsWith('profile_')) existingUserByKey.set(uKey, u.id);
        });

        // Determine whether row 0 is header or data
        const firstRowCells = (rawRows[0] || []).map(c => String(c || '').trim().toLowerCase());
        const firstRowText = firstRowCells.join(' ');
        const hasHeader = firstRowText.includes('mssv') || firstRowText.includes('mã') || firstRowText.includes('họ tên') || firstRowText.includes('tên');

        let mssvColIdx = -1;
        let nameColIdx = -1;
        let hoLotColIdx = -1;
        let tenColIdx = -1;
        let branchColIdx = -1;
        let roleColIdx = -1;

        if (hasHeader) {
          firstRowCells.forEach((cell, idx) => {
            if (cell.includes('mssv') || cell.includes('mã sv') || cell.includes('mã số') || cell.includes('username')) {
              if (mssvColIdx === -1) mssvColIdx = idx;
            } else if (cell.includes('họ lót') || cell.includes('họ đệm')) {
              hoLotColIdx = idx;
            } else if (cell === 'tên' || cell === 'ten') {
              tenColIdx = idx;
            } else if (cell.includes('họ tên') || cell.includes('họ và tên') || cell.includes('name')) {
              if (nameColIdx === -1) nameColIdx = idx;
            } else if (cell.includes('lớp') || cell.includes('chi đoàn') || cell.includes('branch')) {
              if (branchColIdx === -1) branchColIdx = idx;
            } else if (cell.includes('vai trò') || cell.includes('role')) {
              if (roleColIdx === -1) roleColIdx = idx;
            }
          });
        } else {
          // Auto-detect columns from first row data: find which column contains student numbers (e.g. 25207002)
          firstRowCells.forEach((cell, idx) => {
            const cleanDigits = cell.replace(/\D/g, '');
            if (cleanDigits.length >= 7 && cleanDigits.length <= 10) {
              if (mssvColIdx === -1) mssvColIdx = idx;
            }
          });

          if (mssvColIdx === -1) {
            // Default standard: STT (col 0), MSSV (col 1), Họ tên (col 2), Lớp (col 3)
            mssvColIdx = 1;
            nameColIdx = 2;
            branchColIdx = 3;
          } else {
            if (mssvColIdx === 1) {
              nameColIdx = 2;
              branchColIdx = 3;
            } else if (mssvColIdx === 0) {
              nameColIdx = 1;
              branchColIdx = 2;
            }
          }
        }

        const dataRows = hasHeader ? rawRows.slice(1) : rawRows;
        const parsedRecords: CsvParsedRecord[] = [];
        const branchesSet = new Set<string>();
        let totalNew = 0;
        let totalExisting = 0;

        for (let i = 0; i < dataRows.length; i++) {
          const row = dataRows[i];
          if (!row || row.length === 0) continue;
          const rawMssv = mssvColIdx >= 0 && row[mssvColIdx] ? String(row[mssvColIdx]).trim() : '';
          const usernameStr = rawMssv.replace(/[\r\n\t]/g, '');
          if (!usernameStr || usernameStr.length < 3) continue;

          let fullName = '';
          if (hoLotColIdx >= 0 && tenColIdx >= 0 && row[hoLotColIdx] && row[tenColIdx]) {
            fullName = `${row[hoLotColIdx]} ${row[tenColIdx]}`.trim();
          } else if (nameColIdx >= 0 && row[nameColIdx]) {
            fullName = String(row[nameColIdx]).trim();
          }

          const newNameStr = repairVietnameseName(fullName) || 'Đoàn viên';
          const rawRole = roleColIdx >= 0 && row[roleColIdx] ? String(row[roleColIdx]).toLowerCase().trim() : 'doanvien';
          const newRoleStr: 'doanvien' | 'chidoan' = (rawRole.includes('chi đoàn') || rawRole.includes('chidoan')) ? 'chidoan' : 'doanvien';

          let newBranchStr = branchColIdx >= 0 && row[branchColIdx] ? String(row[branchColIdx]).trim() : '';
          if (!newBranchStr) {
            newBranchStr = isAdmin ? (selectedBranchFilter || newBranch.trim() || 'Chi đoàn') : (currentUser?.branch || 'Chi đoàn');
          }

          if (newBranchStr) branchesSet.add(newBranchStr);

          const lowerKey = usernameStr.toLowerCase();
          const matchedActiveId = existingUserByKey.get(lowerKey);
          const isExisting = Boolean(matchedActiveId);
          if (isExisting) {
            totalExisting++;
          } else {
            totalNew++;
          }

          parsedRecords.push({
            stt: String(parsedRecords.length + 1),
            mssv: usernameStr,
            name: newNameStr,
            branch: newBranchStr,
            role: newRoleStr,
            isExisting,
            existingId: matchedActiveId
          });
        }

        if (parsedRecords.length === 0) {
          alert("Không nhận diện được dòng dữ liệu đoàn viên hợp lệ nào trong file CSV. Vui lòng kiểm tra lại file mẫu.");
          return;
        }

        setCsvPreview({
          fileName: file.name,
          records: parsedRecords,
          totalNew,
          totalExisting,
          branchesList: Array.from(branchesSet)
        });
      }
    });

    if (e.target) e.target.value = '';
  };

  const handleConfirmBulkImport = async () => {
    if (!csvPreview || isImportingConfirmed) return;
    setIsImportingConfirmed(true);
    setImportProgress({ current: 0, total: csvPreview.records.length });

    try {
      let batch = writeBatch(db);
      let batchCount = 0;
      let totalProcessed = 0;

      for (const record of csvPreview.records) {
        if (record.role === 'doanvien') {
          if (record.isExisting && record.existingId) {
            const docRef = doc(db, 'users', record.existingId);
            batch.set(docRef, {
              name: record.name,
              mssv: record.mssv,
              branch: record.branch,
              updatedAt: Date.now()
            }, { merge: true });
          } else {
            const targetDocId = 'profile_' + record.mssv.toLowerCase();
            const docRef = doc(db, 'users', targetDocId);
            batch.set(docRef, {
              username: record.mssv,
              mssv: record.mssv,
              email: '',
              name: record.name,
              role: 'doanvien',
              branch: record.branch,
              isMerged: false,
              createdAt: Date.now()
            }, { merge: true });
          }
        }

        batchCount++;
        totalProcessed++;

        if (batchCount >= 40) {
          await batch.commit();
          setImportProgress({ current: totalProcessed, total: csvPreview.records.length });
          batch = writeBatch(db);
          batchCount = 0;
        }
      }

      if (batchCount > 0) {
        await batch.commit();
      }

      alert(`Đã nạp thành công ${csvPreview.records.length} đoàn viên vào hệ thống!\n- Tạo mới hồ sơ chờ liên kết: ${csvPreview.totalNew}\n- Cập nhật tài khoản đã kích hoạt: ${csvPreview.totalExisting}`);
      setCsvPreview(null);
      fetchUsers();
    } catch (err: any) {
      if (isQuotaExceededError(err)) {
        alert("Cơ sở dữ liệu tạm thời chạm giới hạn lượt đọc/ghi miễn phí trong ngày (Quota exceeded). Vui lòng thử lại vào ngày tiếp theo hoặc nâng cấp gói Firestore.");
      } else {
        console.error('Lỗi khi nạp dữ liệu:', err);
        alert('Lỗi khi nạp dữ liệu: ' + (err?.message || 'Có lỗi xảy ra'));
      }
    } finally {
      setIsImportingConfirmed(false);
      setImportProgress(null);
    }
  };

  const handleEditUser = (u: any) => {
    setEditingUserInfo(u);
    const cleanEmail = (u.email || '').includes('@student.hcmus.edu.vn') ? '' : (u.email || '');
    const nameIsNumeric = /^\d{6,10}$/.test(String(u.name || '').trim());
    const mssvHasText = !/^\d{6,10}$/.test(String(u.mssv || '').trim()) && String(u.mssv || '').trim().length > 0;
    const isFlipped = nameIsNumeric && mssvHasText;
    const realName = isFlipped ? u.mssv : (u.name || '');
    const realMssv = isFlipped ? u.name : (u.mssv || u.username || '');

    setUserEditForm({
      name: realName,
      mssv: realMssv,
      branch: u.branch || currentUser?.branch || '',
      email: cleanEmail,
      username: realMssv,
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

      await setDoc(doc(db, 'users', editingUserInfo.id), updates, { merge: true });
      const updatedList = usersList.map(u => u.id === editingUserInfo.id ? { ...u, ...updates } : u);
      setUsersList(updatedList);
      
      const freshBch = updatedList.filter(
        (u: any) => (u.committeeRole && String(u.committeeRole).trim() !== '') || (u.branchRole && String(u.branchRole).trim() !== '')
      );
      setDoc(doc(db, 'system', 'bch_cache'), { members: freshBch, updatedAt: Date.now() }, { merge: true }).catch(() => {});
      try {
        localStorage.setItem('cached_bch_members', JSON.stringify(freshBch));
        localStorage.setItem('cached_admin_users', JSON.stringify(updatedList));
        window.dispatchEvent(new CustomEvent('bch_updated', { detail: freshBch }));
      } catch {}

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
      const remainingList = usersList.filter(item => item.id !== deletingUser.id);
      setUsersList(remainingList);
      
      const freshBch = remainingList.filter(
        (u: any) => (u.committeeRole && String(u.committeeRole).trim() !== '') || (u.branchRole && String(u.branchRole).trim() !== '')
      );
      setDoc(doc(db, 'system', 'bch_cache'), { members: freshBch, updatedAt: Date.now() }, { merge: true }).catch(() => {});
      try {
        localStorage.setItem('cached_bch_members', JSON.stringify(freshBch));
        localStorage.setItem('cached_admin_users', JSON.stringify(remainingList));
        window.dispatchEvent(new CustomEvent('bch_updated', { detail: freshBch }));
      } catch {}

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
    
    const commRole = (bchForm.committeeRole || '').trim();
    const brRole = (bchForm.branchRole || '').trim();
    const commPeriod = (bchForm.committeePeriod || '').trim();
    const commTerm = (bchForm.committeeTerm || '').trim();
    const brTerm = (bchForm.branchTerm || '').trim();
    const rawAvatar = (bchForm.avatar || '').trim();

    let updates: Record<string, any> = {
      committeeRole: commRole,
      branchRole: brRole,
      updatedAt: Date.now()
    };

    if (!commRole && !brRole) {
      updates.committeePeriod = '';
      updates.committeeTerm = '';
      updates.branchTerm = '';
      updates.avatar = '';
    } else {
      updates.committeePeriod = commPeriod;
      updates.committeeTerm = commTerm;
      updates.branchTerm = brTerm;
      updates.avatar = rawAvatar;
    }
    
    try {
      // 1. Identify all document IDs associated with this person ONLY from existing records in usersList
      const targetDocIds = new Set<string>();
      if (editingBchUser.id) targetDocIds.add(editingBchUser.id);
      
      const cleanMssv = (editingBchUser.mssv || editingBchUser.username || '').toLowerCase().trim();
      const cleanEmail = (editingBchUser.email || '').toLowerCase().trim();

      usersList.forEach(u => {
        if (!u.id) return;
        const uMssv = (u.mssv || u.username || '').toLowerCase().trim();
        const uEmail = (u.email || '').toLowerCase().trim();
        if ((cleanMssv && uMssv === cleanMssv) || (cleanEmail && uEmail === cleanEmail)) {
          targetDocIds.add(u.id);
        }
      });

      // 2. Persist to existing user docs with individual try-catch so one doc warning doesn't block the update
      for (const docId of targetDocIds) {
        try {
          await setDoc(doc(db, 'users', docId), updates, { merge: true });
        } catch (docErr) {
          console.warn(`Lưu user ${docId} cảnh báo:`, docErr);
        }
      }

      // 3. Immediately update in-memory usersList for instant UI response
      const updatedList = usersList.map(u => {
        const uMssv = (u.mssv || u.username || '').toLowerCase().trim();
        const uEmail = (u.email || '').toLowerCase().trim();
        const isMatch = targetDocIds.has(u.id) || 
          Boolean(cleanMssv && uMssv === cleanMssv) || 
          Boolean(cleanEmail && uEmail === cleanEmail);
        return isMatch ? { ...u, ...updates } : u;
      });
      setUsersList(updatedList);

      // 4. Compute updated BCH members list (excluding 2024 and expired)
      const freshBch = updatedList.filter(
        (u: any) => {
          const hasRole = (u.committeeRole && String(u.committeeRole).trim() !== '') || (u.branchRole && String(u.branchRole).trim() !== '');
          if (!hasRole) return false;
          const b = String(u.branch || '').trim();
          const m = String(u.mssv || u.username || '').trim();
          const n = String(u.name || '').trim();
          if (/^(chi\s*đoàn\s*)?24/i.test(b) || m.startsWith('24') || n.includes('24_') || String(u.id || '').startsWith('profile_24')) {
            return false;
          }
          return true;
        }
      ).map((m: any) => m.branch === '25ICD1' ? { ...m, branch: '25ICD' } : m);

      // 5. Sanitize every member for system/bch_cache to prevent undefined fields and stay safely under 1MB
      const cleanBchCache = freshBch.map((m: any) => {
        let avatarStr = m.avatar || '';
        // If avatar string exceeds 80KB, trim it to preserve system/bch_cache document size
        if (typeof avatarStr === 'string' && avatarStr.length > 80000) {
          avatarStr = '';
        }
        return {
          id: String(m.id || ''),
          name: String(m.name || m.fullName || 'Đoàn viên'),
          mssv: String(m.mssv || m.username || ''),
          branch: String(m.branch || ''),
          email: String(m.email || ''),
          role: String(m.role || 'doanvien'),
          committeeRole: String(m.committeeRole || ''),
          branchRole: String(m.branchRole || ''),
          committeePeriod: String(m.committeePeriod || ''),
          committeeTerm: String(m.committeeTerm || ''),
          branchTerm: String(m.branchTerm || ''),
          avatar: avatarStr,
          gender: String(m.gender || ''),
          dateOfBirth: String(m.dateOfBirth || ''),
          phone: String(m.phone || ''),
          updatedAt: Number(m.updatedAt || Date.now())
        };
      });

      try {
        await setDoc(doc(db, 'system', 'bch_cache'), { members: cleanBchCache, updatedAt: Date.now() }, { merge: true });
      } catch (cacheErr) {
        console.warn("Lưu cache BCH không đồng bộ Firestore:", cacheErr);
      }

      // 6. Synchronize localStorage
      try {
        localStorage.setItem('cached_bch_members', JSON.stringify(cleanBchCache));
        localStorage.setItem('cached_admin_users', JSON.stringify(updatedList));
      } catch {}

      // 7. Dispatch global event so HomeScreen (even if active in background) re-renders immediately
      try {
        window.dispatchEvent(new CustomEvent('bch_updated', { detail: cleanBchCache }));
      } catch {}

      setEditingBchUser(null);
      alert("Cập nhật chức vụ thành công và đã đồng bộ ngay lập tức lên Trang chủ!");
      fetchUsers();
    } catch(e: any) {
      console.error("Lỗi cập nhật chức vụ:", e);
      const errMsg = e?.message || "Lỗi hệ thống khi cập nhật chức vụ";
      alert(`Không thể cập nhật chức vụ: ${errMsg}`);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div 
        className="relative text-white p-6 pt-10 shrink-0 overflow-hidden bg-cover bg-center shadow-lg shadow-red-950/20"
        style={{ backgroundImage: `url('/background.webp')` }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-red-700 via-red-600 to-rose-700 opacity-95 backdrop-blur-[1px]" />
        {/* Soft decorative ambient lighting */}
        <div className="absolute -top-10 -right-10 w-44 h-44 bg-white/20 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-8 -left-8 w-36 h-36 bg-black/25 rounded-full blur-xl pointer-events-none" />

        <div className="relative z-10">
          <h2 className="text-lg font-bold drop-shadow-sm">Quản lý Đoàn</h2>
          <p className="text-[11px] text-red-100 opacity-90 mt-0.5 font-medium">
            {isAdmin 
              ? 'Duyệt hoạt động, gửi thông báo, quản lý Chi đoàn và tài khoản' 
              : isBranch 
                ? `Quản lý đoàn viên & Ban Chấp hành Chi đoàn ${currentUser?.branch || ''}` 
                : 'Tạo hoạt động và báo cáo minh chứng'}
          </p>
          
          {(isAdmin || isBranch) && (
            <div className="mt-4 flex gap-2 border-b border-white/20 pb-[-1px] overflow-x-auto no-scrollbar">
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
            {isAdmin && (
              <button 
                onClick={() => setActiveTab('notifications')}
                className={`pb-2 shrink-0 text-xs font-bold uppercase tracking-wide border-b-2 transition flex items-center gap-1.5 ${activeTab === 'notifications' ? 'border-white text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
              >
                <Mail size={13} />
                Thông báo & Gmail
              </button>
            )}
          </div>
        )}
        </div>
      </div>

      <div className="flex-1 p-4 space-y-4 overflow-y-auto pb-10">
        {quotaExceeded && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 text-amber-900 shadow-xs">
            <div className="text-xs sm:text-sm font-extrabold flex items-center gap-1.5 text-amber-800">
              <span>⏳</span> Dữ liệu trên máy chủ KHÔNG bị mất — Hạn mức đọc của Google sẽ reset lúc 14:00 chiều nay (giờ Việt Nam)
            </div>
            <p className="text-[11px] sm:text-xs text-amber-800/90 mt-1.5 leading-relaxed">
              Toàn bộ dữ liệu Đoàn viên (bao gồm lớp 25ICD bạn vừa import), Chi đoàn, Ban Chấp hành và Hoạt động <strong>vẫn còn nguyên vẹn 100% trên Firestore</strong>. Sở dĩ bạn không còn thấy thông báo lỗi đỏ là do ứng dụng đã chặn popup báo lỗi để tránh làm văng trang, nhưng hạn mức đọc miễn phí hằng ngày của Google Firebase được tính theo <strong>00:00 giờ Thái Bình Dương (Pacific Time)</strong> — tức là <strong>14:00 chiều theo giờ Việt Nam</strong> mới được đặt lại (reset). Ngay sau 14:00 chiều nay (hoặc ngay khi nâng cấp gói dữ liệu), toàn bộ danh sách sẽ tự động hiển thị trở lại bình thường!
            </p>
          </div>
        )}
        
        {isBranch && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-xl shadow-sm border border-blue-200">
            <h3 className="text-sm font-bold text-blue-900 mb-1 flex items-center gap-1.5">
              📁 Link Drive Tổng Hợp Hoạt Động (Chi đoàn {currentUser?.branch?.replace(/^(BCH|Chi\s*đoàn)\s*/i, '') || currentUser?.branch})
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
                onChange={e => {
                  setMyDriveLink(e.target.value);
                  setDriveErrorMsg('');
                }}
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
              <p className="text-[11px] text-emerald-600 font-bold mt-2 flex items-center gap-1">
                <Check size={13} /> Đã cập nhật link Drive thành công!
              </p>
            )}
            {driveErrorMsg && (
              <p className="text-[11px] text-red-600 font-bold mt-2 flex items-center gap-1">
                <AlertCircle size={13} /> {driveErrorMsg}
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

            {isAdmin && (
              <div className="bg-emerald-50/70 p-3.5 rounded-xl border border-emerald-200 space-y-2.5">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500"
                    checked={allowBranchScan}
                    onChange={e => setAllowBranchScan(e.target.checked)}
                  />
                  <div>
                    <span className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                      <QrCode size={14} className="text-emerald-700" />
                      Cho phép các Chi đoàn mở mã QR & quét điểm danh hoạt động này
                    </span>
                    <span className="text-[10px] text-emerald-700 block mt-0.5">
                      Khi bật, tài khoản các Chi đoàn có thể chọn hoạt động này trong mục "Điểm danh HĐ" để chiếu mã QR hoặc quét/nhập MSSV điểm danh.
                    </span>
                  </div>
                </label>

                {allowBranchScan && (
                  <div className="pt-2 border-t border-emerald-200/70 space-y-2 pl-6">
                    <div className="flex flex-wrap gap-3 text-xs font-semibold text-slate-700">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="createScanScope"
                          checked={scanBranchScope === 'all'}
                          onChange={() => setScanBranchScope('all')}
                          className="text-emerald-600"
                        />
                        <span>Tất cả Chi đoàn</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="createScanScope"
                          checked={scanBranchScope === 'custom'}
                          onChange={() => setScanBranchScope('custom')}
                          className="text-emerald-600"
                        />
                        <span>Chỉ một số Chi đoàn được chọn</span>
                      </label>
                    </div>

                    {scanBranchScope === 'custom' && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-white p-2.5 rounded-lg border border-emerald-200">
                        {branches.map(b => (
                          <label key={b.id} className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer font-medium">
                            <input
                              type="checkbox"
                              className="rounded text-emerald-600 h-3.5 w-3.5"
                              checked={allowedScanBranches.includes(b.name)}
                              onChange={e => {
                                if (e.target.checked) {
                                  setAllowedScanBranches([...allowedScanBranches, b.name]);
                                } else {
                                  setAllowedScanBranches(allowedScanBranches.filter(item => item !== b.name));
                                }
                              }}
                            />
                            <span>{b.name}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            
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
                 const isOwnBranchAct = act.creatorId === currentUser?.uid || act.branch === currentUser?.branch || (act.branches && act.branches.includes(currentUser?.branch || ''));
                 const isOverdue = Date.now() > act.endTime;
                 const needsEvidence = isBranch && isOwnBranchAct && isOverdue && !act.evidenceLink && act.status === 'approved';
                 const overdueDays = isOverdue ? Math.floor((Date.now() - act.endTime) / 86400000) : 0;
                 const warning = needsEvidence && overdueDays > 3;

                 const isAllBranchesAllowed = act.allowBranchScan && (!act.allowedScanBranches || act.allowedScanBranches.length === 0 || act.allowedScanBranches.includes('all'));

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
                     <div className="flex flex-wrap gap-1.5 text-[9px] mb-2 font-medium">
                       <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">TG: +{act.pointsParticipant}đ</span>
                       <span className="bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded">BTC: +{act.pointsOrganizer}đ</span>
                       <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{act.targetAudience === 'all' ? 'Toàn khoa' : `Chi đoàn ${act.targetAudience}`}</span>
                       {act.allowBranchScan ? (
                         <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded font-bold flex items-center gap-1">
                           <QrCode size={10} />
                           {isAllBranchesAllowed
                             ? 'Cho phép tất cả Chi đoàn điểm danh QR'
                             : `Cho phép Chi đoàn điểm danh: ${(act.allowedScanBranches || []).join(', ')}`}
                         </span>
                       ) : (
                         <span className="bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded font-semibold">
                           Chỉ đơn vị tạo / Đoàn khoa điểm danh
                         </span>
                       )}
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
                          <button onClick={() => handleApprove(act.id, act.name, act.targetAudience)} className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-[10px] font-bold flex items-center cursor-pointer">
                            <Check size={12} className="mr-0.5" /> Duyệt
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => openScanPermModal(act)}
                            className={`px-2.5 py-1 rounded text-[10px] font-bold border flex items-center gap-1 cursor-pointer transition ${
                              act.allowBranchScan
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                            }`}
                          >
                            <QrCode size={12} />
                            <span>{act.allowBranchScan ? 'Cấu hình Chi đoàn điểm danh' : 'Cho phép Chi đoàn điểm danh'}</span>
                          </button>
                        )}
                        {isBranch && isOwnBranchAct && (
                          <button onClick={() => RequestTimeEdit(act.id)} className="bg-slate-100 text-slate-700 px-2 py-1 rounded text-[10px] font-bold border border-slate-200">
                             Sửa TG
                          </button>
                        )}
                        {isBranch && isOwnBranchAct && act.status === 'approved' && isOverdue && (
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
                      
                      {(isAdmin || isOwnBranchAct) && (
                        <button onClick={() => handleDelete(act.id)} className="p-1.5 text-red-500 bg-red-50 hover:bg-red-100 rounded-lg shrink-0">
                          <Trash2 size={14} />
                        </button>
                      )}
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
              const { chartData, allBranchesData, totalDoanVien } = getBranchStats();
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

                  {allBranchesData.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-xs italic">
                      Chưa có dữ liệu đoàn viên để hiển thị biểu đồ.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                      <div className="lg:col-span-5 flex justify-center">
                        {chartData.length === 0 ? (
                          <div className="text-center py-12 text-slate-400 text-xs italic bg-slate-50 border border-dashed border-slate-200 rounded-2xl w-full max-w-[280px]">
                            Chưa có đoàn viên đăng ký
                          </div>
                        ) : (
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
                                  {chartData.map((_, index) => (
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
                        )}
                      </div>

                      <div className="lg:col-span-7 space-y-2 max-h-[260px] overflow-y-auto pr-2 no-scrollbar">
                        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 grid grid-cols-12 px-2">
                          <span className="col-span-7">Chi đoàn</span>
                          <span className="col-span-2 text-right">Số lượng</span>
                          <span className="col-span-3 text-right">Tỷ lệ</span>
                        </div>
                        <div className="space-y-1.5">
                          {allBranchesData.map((item, index) => {
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
              <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
                <h3 className="text-sm font-bold text-slate-800 flex items-center">
                  <Users size={16} className="mr-1.5 text-blue-600"/> Danh sách Chi đoàn trực thuộc ({branches.length})
                </h3>
                {isAdmin && (
                  <button 
                    type="button" 
                    onClick={handleCleanKhoa2024} 
                    className="text-xs text-rose-600 hover:text-rose-800 hover:bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200 transition font-bold flex items-center gap-1 cursor-pointer"
                    title="Xóa toàn bộ các Chi đoàn thuộc khóa 2024 (24DTV, 24ICD...)"
                  >
                    <Trash2 size={12} /> Dọn dẹp Chi đoàn khóa 2024
                  </button>
                )}
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
                  
                  <div className="flex flex-col sm:flex-row gap-2">
                     <button type="button" onClick={downloadAccountTemplate} className="text-[10px] text-emerald-600 font-bold flex items-center border border-emerald-200 bg-emerald-50 px-3 py-2 rounded-lg justify-center flex-1 cursor-pointer">
                       <FileSpreadsheet size={14} className="mr-1.5" /> Tải mẫu CSV
                     </button>
                     <label className="text-[10px] text-blue-600 font-bold flex items-center border border-blue-200 bg-blue-50 px-3 py-2 rounded-lg cursor-pointer justify-center flex-1 hover:bg-blue-100 transition">
                       <Upload size={14} className="mr-1.5" /> Chọn File CSV Để Tải Lên
                       <input type="file" accept=".csv" className="hidden" onChange={handleBulkImport} disabled={isImportingConfirmed} />
                     </label>
                  </div>
                </div>

                {isAdmin && (
                  <div className="bg-gradient-to-r from-amber-50 to-orange-50 p-4 rounded-xl shadow-sm border border-amber-200">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h4 className="text-xs font-bold text-amber-900 flex items-center">
                          <Sparkles size={15} className="mr-1.5 text-amber-600" />
                          Dọn dẹp tài khoản không hợp lệ & Chuẩn hóa Chi đoàn
                        </h4>
                        <p className="text-[11px] text-amber-700 mt-1">
                          Tự động xóa tài khoản/hồ sơ K24 và tài khoản rác; tự động phân loại lại các tài khoản cá nhân về đúng Chi đoàn 25ICD, gán đúng MSSV và họ tên; đồng bộ danh sách BCH lên Trang chủ.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAutoCleanAndSyncUsers(false)}
                        disabled={isCleaningUsers}
                        className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg shrink-0 flex items-center justify-center transition shadow-sm cursor-pointer"
                      >
                        <Sparkles size={14} className={`mr-1.5 ${isCleaningUsers ? 'animate-spin' : ''}`} />
                        {isCleaningUsers ? 'Đang dọn dẹp...' : 'Dọn dẹp & Chuẩn hóa ngay'}
                      </button>
                    </div>
                    {cleanResultMsg && (
                      <div className={`mt-2.5 p-2.5 rounded-lg text-xs font-medium ${cleanResultMsg.type === 'success' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-red-100 text-red-800 border border-red-300'}`}>
                        {cleanResultMsg.text}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center">
                    <List size={16} className="mr-1.5 text-blue-600"/> 
                    {isBranch ? `Danh sách Đoàn viên Chi đoàn ${currentUser?.branch || ''}` : 'Danh sách tài khoản hệ thống'} ({usersList.filter(isUserInMyBranch).length})
                  </h3>
                  <button
                    type="button"
                    onClick={fetchUsers}
                    disabled={loadingUsers}
                    className="p-1 text-slate-500 hover:text-blue-600 rounded hover:bg-slate-100 transition cursor-pointer"
                    title="Tải lại danh sách từ cơ sở dữ liệu"
                  >
                    <RefreshCw size={13} className={loadingUsers ? 'animate-spin' : ''} />
                  </button>
                </div>
                {isAdmin && selectedBranchFilter && (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full w-fit">
                      Lớp {selectedBranchFilter}: {usersList.filter(u => (u.branch || '').toLowerCase() === selectedBranchFilter.toLowerCase()).length} tài khoản
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedBranchFilter('')}
                      className="text-[10px] text-red-600 hover:underline font-bold cursor-pointer bg-red-50 px-2 py-0.5 rounded border border-red-200"
                    >
                      Xóa lọc
                    </button>
                  </div>
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
                <>
                  <div className="space-y-2 max-h-[550px] overflow-y-auto pr-1 no-scrollbar">
                     {paginatedUsers.map((u: any) => {
                       const isStudent = u.role === 'doanvien' || !u.role;
                       const isPlaceholder = u.id.startsWith('profile_');
                       const hasRealGoogleEmail = Boolean(u.email && !u.email.includes('@student.hcmus.edu.vn') && u.email.includes('@'));
                       const isMerged = !isPlaceholder && (u.isMerged === true || hasRealGoogleEmail);

                       // Robust check: never render numbers as name and person name as MSSV
                       const nameIsNumeric = /^\d{6,10}$/.test(String(u.name || '').trim());
                       const mssvHasText = !/^\d{6,10}$/.test(String(u.mssv || '').trim()) && String(u.mssv || '').trim().length > 0;
                       const isFlipped = nameIsNumeric && mssvHasText;
                       const displayName = isFlipped ? u.mssv : (u.name || 'Chưa cập nhật tên');
                       const displayMssv = isFlipped ? u.name : (u.mssv || u.username || '');

                       return (
                         <div key={u.id} className="flex justify-between items-center p-3 bg-slate-50 border border-slate-100 rounded-lg hover:bg-slate-100/80 transition-all">
                            <div>
                               <div className="text-xs font-bold text-slate-800 flex items-center gap-2 flex-wrap">
                                  <span>{displayName}</span>
                                  {displayMssv && (
                                    <span className="font-semibold text-slate-600 bg-slate-200/70 px-1.5 py-0.5 rounded text-[11px]">
                                      MSSV: {displayMssv}
                                    </span>
                                  )}
                               </div>
                               <div className="text-[10px] text-slate-500 mt-1 flex flex-wrap items-center gap-1.5">
                                  <span className="font-semibold text-blue-700">{u.role === 'admin' ? 'QTV Khoa' : u.role === 'chidoan' ? 'BCH Chi đoàn' : 'Đoàn viên'}</span>
                                  <span>•</span>
                                  <span className="bg-slate-200/70 text-slate-700 px-1.5 py-0.5 rounded font-medium">{u.branch || 'Chưa phân lớp'}</span>
                                  {u.committeeRole && (
                                    <span className="bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded text-[9px]">{u.committeeRole}</span>
                                  )}
                                  {isStudent ? (
                                    isMerged && hasRealGoogleEmail ? (
                                      <>
                                        <span>•</span>
                                        <span className="bg-emerald-50 text-emerald-700 border border-emerald-200/80 font-semibold px-2 py-0.5 rounded text-[10px] flex items-center gap-1">
                                          <CheckCircle2 size={11} className="text-emerald-600" /> Đã liên kết: {u.email}
                                        </span>
                                      </>
                                    ) : (
                                      <>
                                        <span>•</span>
                                        <span className="bg-amber-50 text-amber-700 border border-amber-200/80 font-medium px-2 py-0.5 rounded text-[10px] flex items-center gap-1">
                                          <Clock size={11} className="text-amber-600" /> Chưa liên kết Google (Chờ đăng nhập)
                                        </span>
                                      </>
                                    )
                                  ) : (
                                    hasRealGoogleEmail && (
                                      <>
                                        <span>•</span>
                                        <span className="truncate max-w-[180px] text-slate-600 font-medium">{u.email}</span>
                                      </>
                                    )
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
                      );
                    })}
                    {filteredUsersList.length === 0 && (
                       <div className="text-center py-6">
                         <p className="text-xs text-slate-400 italic mb-2">Không tìm thấy đoàn viên phù hợp.</p>
                         <button
                           type="button"
                           onClick={fetchUsers}
                           className="text-xs text-blue-600 hover:text-blue-700 font-bold underline cursor-pointer"
                         >
                           Bấm vào đây để tải lại danh sách từ máy chủ
                         </button>
                       </div>
                    )}
                 </div>

                 {filteredUsersList.length > USERS_PER_PAGE && (
                   <div className="flex items-center justify-between px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl mt-3 text-xs text-slate-600">
                     <div className="font-medium text-[11px] sm:text-xs">
                       Trang <span className="font-bold text-blue-700">{currentPageSafe}</span> / {totalUserPages}
                       <span className="text-slate-400 ml-1.5 font-normal">
                         ({(currentPageSafe - 1) * USERS_PER_PAGE + 1} - {Math.min(currentPageSafe * USERS_PER_PAGE, filteredUsersList.length)} trong tổng số {filteredUsersList.length})
                       </span>
                     </div>
                     <div className="flex items-center gap-1">
                       <button
                         type="button"
                         disabled={currentPageSafe <= 1}
                         onClick={() => setUserPage(1)}
                         className="p-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 transition cursor-pointer"
                         title="Trang đầu"
                       >
                         <ChevronsLeft size={14} />
                       </button>
                       <button
                         type="button"
                         disabled={currentPageSafe <= 1}
                         onClick={() => setUserPage(p => Math.max(1, p - 1))}
                         className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg font-bold text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 transition flex items-center gap-1 cursor-pointer text-xs"
                       >
                         <ChevronLeft size={14} /> Trước
                       </button>
                       <button
                         type="button"
                         disabled={currentPageSafe >= totalUserPages}
                         onClick={() => setUserPage(p => Math.min(totalUserPages, p + 1))}
                         className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg font-bold text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 transition flex items-center gap-1 cursor-pointer text-xs"
                       >
                         Sau <ChevronRight size={14} />
                       </button>
                       <button
                         type="button"
                         disabled={currentPageSafe >= totalUserPages}
                         onClick={() => setUserPage(totalUserPages)}
                         className="p-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 transition cursor-pointer"
                         title="Trang cuối"
                       >
                         <ChevronsRight size={14} />
                       </button>
                     </div>
                   </div>
                 )}
               </>
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
                                <img src={u.avatar || "/logo_doan.png"} alt="avatar" className="w-8 h-8 rounded-full border border-slate-200 object-cover" />
                                <div>
                                   <div className="font-bold text-slate-800">{u.name} <span className="text-[10px] font-normal text-slate-500">{u.mssv ? `(MSSV: ${u.mssv})` : (u.email ? `(${u.email})` : '')}</span></div>
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
                       {(() => {
                         const candidateList = usersList.filter(u => {
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
                         });

                         return (
                           <>
                             {candidateList.slice(0, 25).map((u: any) => (
                                <div key={u.id} className="flex justify-between items-center p-2 bg-slate-50 border border-slate-100 rounded-lg">
                                   <div>
                                      <div className="font-bold text-slate-800 text-[11px]">{u.name} <span className="font-normal opacity-70">{u.mssv ? `(MSSV: ${u.mssv})` : (u.email ? `(${u.email})` : '')}</span></div>
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
                             {candidateList.length > 25 && (
                               <p className="text-[10px] text-slate-400 italic text-center py-1">
                                 Hiển thị 25/{candidateList.length} đoàn viên. Hãy nhập tên hoặc MSSV vào ô tìm kiếm ở trên để lọc chính xác.
                               </p>
                             )}
                             {candidateList.length === 0 && (
                               <p className="text-[10px] text-slate-400 italic text-center py-2">
                                 Không tìm thấy đoàn viên phù hợp.
                               </p>
                             )}
                           </>
                         );
                       })()}
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

            {/* Google Sheets Integration Card */}
            <div className="mb-5 bg-gradient-to-r from-emerald-50 via-teal-50/60 to-emerald-50 border border-emerald-200/80 rounded-2xl p-4 shadow-xs">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                    <FileSpreadsheet size={22} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide">
                        Google Sheets Tự Động Đồng Bộ
                      </h4>
                      {sheetsConfig?.spreadsheetId ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded-full border border-emerald-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          Đã kết nối Google Sheet
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-slate-500 bg-white/80 px-2 py-0.5 rounded-full border border-slate-200">
                          Chưa liên kết
                        </span>
                      )}
                    </div>
                    {sheetsConfig?.spreadsheetId ? (
                      <div className="mt-1 space-y-1">
                        <p className="text-[11px] text-slate-600 font-medium">
                          Bảng tính:{' '}
                          <a 
                            href={sheetsConfig.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${sheetsConfig.spreadsheetId}/edit`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-bold text-emerald-700 hover:text-emerald-900 underline inline-flex items-center gap-1"
                          >
                            {sheetsConfig.title || 'Bảng Theo Dõi & Quản Lý Hoạt Động Chi Đoàn - FETEL'}
                            <ExternalLink size={11} />
                          </a>
                        </p>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-500">
                          {sheetsConfig.lastSyncedAt && (
                            <span className="flex items-center gap-1">
                              <Clock size={11} className="text-slate-400" />
                              Lần đồng bộ gần nhất:{' '}
                              <strong className="text-slate-700">
                                {new Date(sheetsConfig.lastSyncedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}{' '}
                                {formatDateToDDMMYYYY(sheetsConfig.lastSyncedAt)}
                              </strong>
                            </span>
                          )}
                          <label className="flex items-center gap-1.5 cursor-pointer text-slate-700 font-semibold select-none">
                            <input 
                              type="checkbox" 
                              checked={sheetsConfig.autoSyncOnApprove !== false} 
                              onChange={handleToggleAutoSync}
                              className="rounded text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5 cursor-pointer"
                            />
                            <span>Tự động cập nhật khi duyệt hoạt động (Real-time)</span>
                          </label>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-600 mt-1 max-w-xl">
                        Tự động đồng bộ bảng theo dõi và lưu trữ nhật ký hoạt động chính thức của các Chi đoàn lên Google Sheet của bạn mỗi khi Admin duyệt hoạt động.
                      </p>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap items-center gap-2 self-start lg:self-center shrink-0">
                  {sheetsConfig?.spreadsheetId ? (
                    <>
                      <a
                        href={sheetsConfig.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${sheetsConfig.spreadsheetId}/edit`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <ExternalLink size={13} />
                        Mở Google Sheet
                      </a>
                      <button
                        type="button"
                        onClick={handleSyncToGoogleSheet}
                        disabled={isSyncingSheets}
                        className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        title="Đồng bộ lại toàn bộ dữ liệu mới nhất lên Google Sheet"
                      >
                        <RefreshCw size={13} className={isSyncingSheets ? 'animate-spin text-emerald-600' : 'text-slate-500'} />
                        {isSyncingSheets ? 'Đang đồng bộ...' : 'Đồng bộ toàn bộ'}
                      </button>
                      <button
                        type="button"
                        onClick={handleUnlinkSheet}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer"
                        title="Hủy liên kết Google Sheet"
                      >
                        <Unlink size={15} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={handleCreateGoogleSheet}
                        disabled={isConnectingSheets}
                        className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                      >
                        {isConnectingSheets ? (
                          <>
                            <RefreshCw size={14} className="animate-spin" />
                            Đang tạo bảng tính...
                          </>
                        ) : (
                          <>
                            <Sparkles size={14} />
                            Tạo Google Sheet mới
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowLinkCustomModal(true)}
                        disabled={isConnectingSheets}
                        className="px-3.5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <Link2 size={14} className="text-slate-500" />
                        Liên kết Sheet có sẵn
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Feedback messages */}
              {sheetsSyncSuccessMsg && (
                <div className="mt-3 p-2.5 bg-emerald-100/80 border border-emerald-300 text-emerald-900 rounded-xl text-xs font-semibold flex items-center gap-2 animate-fadeIn">
                  <CheckCircle2 size={16} className="text-emerald-700 shrink-0" />
                  <span>{sheetsSyncSuccessMsg}</span>
                </div>
              )}
              {sheetsSyncErrorMsg && (
                <div className="mt-3 p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-medium flex items-center gap-2 animate-fadeIn">
                  <X size={16} className="text-rose-600 shrink-0" />
                  <span>{sheetsSyncErrorMsg}</span>
                </div>
              )}
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
                                        onClick={() => handleReject(penAct.id, penAct.name)}
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

        {activeTab === 'notifications' && isAdmin && (
          <div className="space-y-5 animate-fadeIn">
            {/* Header */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-black text-slate-800 flex items-center gap-2 uppercase tracking-wide">
                    <Mail size={18} className="text-blue-600" />
                    Trung tâm Phát hành Thông báo & Chuyển tiếp Gmail
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-1 font-medium">
                    Nhập/trích xuất thông báo từ Đoàn trường, tùy chỉnh nội dung và gửi hàng loạt cho BCH Chi đoàn qua Ứng dụng & Hòm thư chính thức <strong className="text-blue-600 font-bold">dkdtvt.hcmus@gmail.com</strong>.
                  </p>
                </div>
                <div className="flex gap-2">
                  <span className="bg-blue-50 text-blue-700 font-bold text-[11px] px-3 py-1.5 rounded-xl border border-blue-100 flex items-center gap-1.5">
                    🏫 {branches.length} Chi đoàn trực thuộc
                  </span>
                </div>
              </div>

              {/* Status Banner for dkdtvt.hcmus@gmail.com */}
              <div className="mt-4 p-4 rounded-xl bg-gradient-to-r from-blue-50 via-indigo-50/50 to-blue-50 border border-blue-200/80 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-red-600 text-white flex items-center justify-center font-bold shadow-xs shrink-0">
                    <Mail size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-800">
                        Tài khoản gửi: <strong className="text-blue-700">dkdtvt.hcmus@gmail.com</strong>
                      </span>
                      {gmailConnectedEmail ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          Đã cấp quyền ({gmailConnectedEmail})
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-200">
                          Chưa kết nối
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Email chuyển tiếp sẽ được gửi chính thức từ hộp thư Đoàn khoa ĐTVT đến các Bí thư & BCH Chi đoàn.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleConnectGmail}
                  disabled={isConnectingGmail}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white hover:bg-slate-50 text-blue-700 border border-blue-300 shadow-xs transition flex items-center gap-1.5 cursor-pointer shrink-0 disabled:opacity-50"
                >
                  <RefreshCw size={13} className={isConnectingGmail ? 'animate-spin' : ''} />
                  {isConnectingGmail ? 'Đang kết nối...' : (gmailConnectedEmail ? 'Đổi / Đăng nhập lại' : 'Kết nối Gmail Đoàn khoa')}
                </button>
              </div>

              {/* Feedback Alert */}
              {sendResultMsg && (
                <div className={`mt-3 p-3 rounded-xl text-xs font-semibold flex items-center gap-2 animate-fadeIn ${
                  sendResultMsg.type === 'success' ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' : 'bg-rose-100 text-rose-900 border border-rose-300'
                }`}>
                  {sendResultMsg.type === 'success' ? <CheckCircle2 size={16} className="text-emerald-700 shrink-0" /> : <AlertCircle size={16} className="text-rose-700 shrink-0" />}
                  <span>{sendResultMsg.text}</span>
                </div>
              )}
            </div>

            {/* Step 1: Fetch from Đoàn trường */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                <div>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                    <Inbox size={16} className="text-indigo-600" />
                    Bước 1: Tìm kiếm & Đọc email từ Đoàn trường (Tùy chọn)
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Tải danh sách thư mới nhất từ Đoàn trường để tự động trích xuất nội dung và các file PDF đính kèm.
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 mb-3">
                <input
                  type="text"
                  placeholder="Từ khóa tìm kiếm (VD: from:doantruong, Thông báo, KHTN...)"
                  value={emailSearchQuery}
                  onChange={e => setEmailSearchQuery(e.target.value)}
                  className="flex-1 text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 font-medium"
                />
                <button
                  type="button"
                  onClick={handleFetchEmails}
                  disabled={isFetchingEmails}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                >
                  <RefreshCw size={13} className={isFetchingEmails ? 'animate-spin' : ''} />
                  {isFetchingEmails ? 'Đang đọc Gmail...' : 'Tải email từ Đoàn trường'}
                </button>
              </div>

              {recentEmails.length > 0 && (
                <div className="space-y-2 mt-3 max-h-[280px] overflow-y-auto pr-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Danh sách thư tìm thấy ({recentEmails.length}):
                  </span>
                  {recentEmails.map(msg => (
                    <div 
                      key={msg.id} 
                      className={`p-3 rounded-xl border transition flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 ${
                        selectedEmailSource?.id === msg.id 
                          ? 'bg-indigo-50/70 border-indigo-300 ring-2 ring-indigo-200' 
                          : 'bg-slate-50/60 border-slate-200/80 hover:bg-slate-100/70'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-slate-800 line-clamp-1">{msg.subject}</span>
                          {msg.attachments.length > 0 && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200 shrink-0">
                              <Paperclip size={10} />
                              {msg.attachments.length} file đính kèm (PDF)
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                          Từ: <strong className="text-slate-600">{msg.from}</strong> • {msg.date}
                        </p>
                        <p className="text-[11px] text-slate-600 mt-1 line-clamp-2 italic">
                          "{msg.snippet}"
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleSelectEmailForForward(msg)}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-bold shadow-xs transition shrink-0 flex items-center gap-1 cursor-pointer"
                      >
                        <CornerUpRight size={12} />
                        Dùng làm mẫu chuyển tiếp
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Step 2: Compose & Forward */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide flex items-center gap-1.5 mb-3">
                <Edit2 size={16} className="text-blue-600" />
                Bước 2: Biên soạn & Tùy biến nội dung thông báo
              </h4>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1 ml-0.5">
                    Tiêu đề thông báo / Tiêu đề Email
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="VD: [ĐOÀN KHOA ĐTVT] Triển khai thông báo tham gia Ngày hội Tuổi trẻ Sáng tạo..."
                    value={announceTitle}
                    onChange={e => setAnnounceTitle(e.target.value)}
                    className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:bg-white font-bold text-slate-800"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1 ml-0.5">
                    Nội dung thông báo (Bạn có thể đổi câu chữ, bổ sung lưu ý, hạn chót cho Chi đoàn...)
                  </label>
                  <textarea
                    rows={8}
                    required
                    placeholder="Kính gửi BCH các Chi đoàn trực thuộc,..."
                    value={announceBody}
                    onChange={e => setAnnounceBody(e.target.value)}
                    className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:bg-white font-medium text-slate-700 leading-relaxed font-sans"
                  />
                </div>

                {/* Attachments Section */}
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase ml-0.5 flex items-center gap-1">
                      <Paperclip size={12} />
                      Tệp đính kèm (File PDF / Văn bản đính kèm email): {attachedFiles.length} tệp
                    </label>
                    <label className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer">
                      <Upload size={12} />
                      + Thêm tệp PDF từ máy tính
                      <input 
                        type="file" 
                        accept=".pdf,.doc,.docx,.png,.jpg" 
                        multiple 
                        className="hidden" 
                        onChange={handleLocalFileUpload} 
                      />
                    </label>
                  </div>

                  {attachedFiles.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                      {attachedFiles.map((file, idx) => (
                        <div key={idx} className="flex justify-between items-center p-2.5 bg-white rounded-lg border border-slate-200 shadow-xs">
                          <div className="flex items-center gap-2 min-w-0 pr-2">
                            <div className="w-7 h-7 rounded bg-rose-100 text-rose-700 flex items-center justify-center font-bold text-[10px] shrink-0">
                              PDF
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-800 truncate" title={file.filename}>{file.filename}</p>
                              <p className="text-[10px] text-slate-400">
                                {file.size ? `${(file.size / 1024).toFixed(1)} KB` : 'Tệp từ Gmail'}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveAttachment(idx)}
                            className="p-1 text-slate-400 hover:text-rose-600 transition cursor-pointer"
                            title="Xóa tệp này"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-400 italic">
                      Chưa có tệp đính kèm. Bấm "+ Thêm tệp PDF từ máy tính" hoặc chọn thư từ Đoàn trường ở Bước 1.
                    </div>
                  )}
                </div>

                {/* Target Recipients */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <label className="text-[10px] font-bold text-slate-600 uppercase block">
                    Đối tượng nhận thông báo & Email
                  </label>
                  <div className="flex flex-wrap gap-4 text-xs font-bold text-slate-700">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="announceTarget"
                        checked={announceTarget === 'branches'}
                        onChange={() => setAnnounceTarget('branches')}
                        className="text-blue-600"
                      />
                      <span>Toàn bộ Ban Chấp hành Chi đoàn ({branches.length} Chi đoàn)</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="announceTarget"
                        checked={announceTarget === 'custom'}
                        onChange={() => setAnnounceTarget('custom')}
                        className="text-blue-600"
                      />
                      <span>Tùy chọn từng Chi đoàn cụ thể</span>
                    </label>
                  </div>

                  {announceTarget === 'custom' && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-200">
                      {branches.map(b => (
                        <label key={b.id || b.name} className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200 text-xs font-semibold cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedBranchesForMail.includes(b.name)}
                            onChange={e => {
                              if (e.target.checked) setSelectedBranchesForMail(prev => [...prev, b.name]);
                              else setSelectedBranchesForMail(prev => prev.filter(x => x !== b.name));
                            }}
                            className="text-blue-600 rounded"
                          />
                          <span>{b.name}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  {/* Recipient preview */}
                  <div className="text-[11px] text-slate-500 pt-1">
                    <div className="flex items-center justify-between">
                      <span>Tổng cộng: <strong className="text-blue-700 font-bold">{getRecipientEmailsList().length} địa chỉ email</strong> sẽ nhận được thư:</span>
                    </div>

                    <div className="flex flex-wrap gap-1.5 mt-1.5 max-h-36 overflow-y-auto p-1.5 bg-white rounded-lg border border-slate-200">
                      {getRecipientEmailsList().map((em, idx) => {
                        const isCustom = customRecipients.includes(em);
                        return (
                          <span key={idx} className={`inline-flex items-center gap-1 border px-2 py-0.5 rounded text-[10.5px] font-mono ${
                            isCustom ? 'bg-blue-50 border-blue-200 text-blue-800 font-semibold' : 'bg-slate-50 border-slate-200 text-slate-600'
                          }`}>
                            <span>{em}</span>
                            {isCustom && (
                              <button
                                type="button"
                                onClick={() => setCustomRecipients(prev => prev.filter(x => x !== em))}
                                className="text-slate-400 hover:text-rose-600 ml-0.5 font-bold cursor-pointer"
                                title="Xóa email này"
                              >
                                ×
                              </button>
                            )}
                          </span>
                        );
                      })}
                    </div>

                    {/* Add custom email input */}
                    <div className="flex items-center gap-1.5 mt-2">
                      <input
                        type="email"
                        placeholder="Thêm email nhận (VD: dinhtienanh.hcmus@gmail.com)..."
                        value={newRecipientInput}
                        onChange={e => setNewRecipientInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (newRecipientInput.includes('@')) {
                              setCustomRecipients(prev => Array.from(new Set([...prev, newRecipientInput.trim()])));
                              setNewRecipientInput('');
                            }
                          }
                        }}
                        className="flex-1 text-xs p-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (newRecipientInput.includes('@')) {
                            setCustomRecipients(prev => Array.from(new Set([...prev, newRecipientInput.trim()])));
                            setNewRecipientInput('');
                          }
                        }}
                        className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition shrink-0 cursor-pointer"
                      >
                        + Thêm người nhận
                      </button>
                    </div>

                    {currentUser?.email && !getRecipientEmailsList().includes(currentUser.email) && (
                      <button
                        type="button"
                        onClick={() => setCustomRecipients(prev => Array.from(new Set([...prev, currentUser.email!])))}
                        className="text-[11px] font-bold text-blue-600 hover:text-blue-800 hover:underline mt-1.5 inline-flex items-center gap-1 cursor-pointer"
                      >
                        + Thêm email của tôi ({currentUser.email}) vào danh sách nhận để thử nghiệm
                      </button>
                    )}
                  </div>
                </div>

                {/* Delivery Channels */}
                <div className="p-3 bg-blue-50/70 border border-blue-200/80 rounded-xl space-y-2">
                  <span className="text-[10px] font-bold text-blue-900 uppercase block">
                    Kênh phát hành thông báo
                  </span>
                  <div className="flex flex-wrap gap-5 text-xs font-bold text-slate-800">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sendViaInApp}
                        onChange={e => setSendViaInApp(e.target.checked)}
                        className="rounded text-blue-600 h-4 w-4"
                      />
                      <span>Đăng lên Bảng tin Thông báo trong Ứng dụng</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sendViaGmail}
                        onChange={e => setSendViaGmail(e.target.checked)}
                        className="rounded text-blue-600 h-4 w-4"
                      />
                      <span>Gửi email hàng loạt từ dkdtvt.hcmus@gmail.com qua Gmail</span>
                    </label>
                  </div>
                </div>

                {/* Submit button */}
                <button
                  type="button"
                  onClick={() => {
                    if (!announceTitle.trim() || !announceBody.trim()) {
                      alert('Vui lòng nhập đầy đủ tiêu đề và nội dung thông báo!');
                      return;
                    }
                    setShowSendConfirmModal(true);
                  }}
                  className="w-full py-3.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-800 text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow-md hover:shadow-lg transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Send size={15} />
                  <span>Xem lại & Phát hành thông báo hàng loạt</span>
                </button>
              </div>
            </div>

            {/* Step 3: History of Announcements */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide flex items-center gap-1.5 mb-3">
                <List size={16} className="text-slate-600" />
                Lịch sử các thông báo đã phát hành ({announcementsList.length})
              </h4>

              {loadingAnnouncements ? (
                <p className="text-xs text-slate-400 italic text-center py-4">Đang tải lịch sử thông báo...</p>
              ) : announcementsList.length === 0 ? (
                <p className="text-xs text-slate-400 italic text-center py-4">Chưa có thông báo nào được phát hành.</p>
              ) : (
                <div className="space-y-2">
                  {announcementsList.map(a => (
                    <div key={a.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex justify-between items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-slate-800">{a.title}</span>
                          <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-bold">
                            {a.targetAudience === 'all' ? 'Tất cả Đoàn viên' : (a.targetAudience === 'chidoan' ? 'Tất cả Chi đoàn' : a.targetAudience)}
                          </span>
                          {a.hasPdf && (
                            <span className="text-[10px] bg-rose-100 text-rose-800 px-2 py-0.5 rounded font-bold flex items-center gap-1">
                              <Paperclip size={9} /> Có file PDF
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-600 mt-1 line-clamp-2 whitespace-pre-wrap">{a.message}</p>
                        <p className="text-[10px] text-slate-400 mt-1">
                          Phát hành: {formatDateToDDMMYYYY(a.createdAt)} • Người gửi: {a.sentBy || 'BCH Đoàn khoa'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteAnnouncement(a.id, a.title)}
                        className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition shrink-0 cursor-pointer border border-transparent hover:border-rose-200 flex items-center gap-1 text-xs font-bold"
                        title="Xóa thông báo này"
                      >
                        <Trash2 size={15} />
                        <span className="hidden sm:inline">Xóa</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
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
                           src={bchForm.avatar || "/logo_doan.png"} 
                           alt="Avatar Preview" 
                           className="w-12 h-12 rounded-full object-cover border-2 border-blue-600 bg-white shadow-sm"
                         />
                         <label className="absolute bottom-0 right-0 bg-blue-600 text-white p-1 rounded-full cursor-pointer hover:bg-blue-700 transition shadow">
                           <Camera size={10} />
                           <input 
                             type="file" 
                             accept="image/*" 
                             className="hidden" 
                             onChange={async (e) => {
                               const file = e.target.files?.[0];
                               if (file) {
                                 try {
                                   const compressed = await compressImage(file, 256, 256, 0.82);
                                   setBchForm(prev => ({ ...prev, avatar: compressed }));
                                 } catch {
                                   const reader = new FileReader();
                                   reader.onload = (ev) => {
                                     setBchForm(prev => ({ ...prev, avatar: ev.target?.result as string }));
                                   };
                                   reader.readAsDataURL(file);
                                 }
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
                             onChange={async (e) => {
                               const file = e.target.files?.[0];
                               if (file) {
                                 try {
                                   const compressed = await compressImage(file, 256, 256, 0.82);
                                   setBchForm(prev => ({ ...prev, avatar: compressed }));
                                 } catch {
                                   const reader = new FileReader();
                                   reader.onload = (ev) => {
                                     setBchForm(prev => ({ ...prev, avatar: ev.target?.result as string }));
                                   };
                                   reader.readAsDataURL(file);
                                 }
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

      {editingScanPermAct && isAdmin && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-md shadow-xl border border-slate-100">
            <div className="flex justify-between items-start mb-3 pb-2.5 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-sm text-slate-800 flex items-center gap-1.5">
                  <QrCode size={16} className="text-emerald-600" />
                  Ủy quyền Chi đoàn điểm danh QR
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1 font-medium">
                  Hoạt động: {editingScanPermAct.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingScanPermAct(null)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveScanPerm} className="space-y-4">
              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500"
                  checked={permAllowBranchScan}
                  onChange={e => setPermAllowBranchScan(e.target.checked)}
                />
                <div>
                  <span className="text-xs font-bold text-emerald-950 block">
                    Cho phép các Chi đoàn mở mã QR & điểm danh hoạt động này
                  </span>
                  <span className="text-[10px] text-emerald-700 block mt-0.5">
                    Các Chi đoàn được chọn sẽ thấy hoạt động này trong tab "Điểm danh HĐ" để chiếu mã QR, quét mã hoặc nhập MSSV điểm danh.
                  </span>
                </div>
              </label>

              {permAllowBranchScan && (
                <div className="space-y-2.5">
                  <label className="text-[11px] font-bold text-slate-700 block">
                    Phạm vi Chi đoàn được phép điểm danh:
                  </label>
                  <div className="flex gap-4 text-xs font-semibold text-slate-700">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="modalScanScope"
                        checked={permScanScope === 'all'}
                        onChange={() => setPermScanScope('all')}
                        className="text-emerald-600"
                      />
                      <span>Tất cả Chi đoàn</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="modalScanScope"
                        checked={permScanScope === 'custom'}
                        onChange={() => setPermScanScope('custom')}
                        className="text-emerald-600"
                      />
                      <span>Chọn Chi đoàn cụ thể</span>
                    </label>
                  </div>

                  {permScanScope === 'custom' && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200 max-h-48 overflow-y-auto">
                      {branches.map(b => (
                        <label key={b.id} className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer font-medium">
                          <input
                            type="checkbox"
                            className="rounded text-emerald-600 h-3.5 w-3.5"
                            checked={permScanBranches.includes(b.name)}
                            onChange={e => {
                              if (e.target.checked) {
                                setPermScanBranches([...permScanBranches, b.name]);
                              } else {
                                setPermScanBranches(permScanBranches.filter(item => item !== b.name));
                              }
                            }}
                          />
                          <span>{b.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingScanPermAct(null)}
                  className="flex-1 py-2.5 rounded-xl font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs transition cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl font-bold bg-emerald-600 text-white hover:bg-emerald-700 text-xs shadow-md transition cursor-pointer"
                >
                  Lưu phân quyền
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV Import Preview & Confirmation Modal */}
      {csvPreview && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-5">
          <div className="bg-white w-full max-w-4xl rounded-3xl p-5 sm:p-6 shadow-2xl border border-slate-100 flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex justify-between items-start pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <FileSpreadsheet size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">
                    Xem trước danh sách dữ liệu CSV nhận được
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                    <span>File: <strong className="text-slate-700">{csvPreview.fileName}</strong></span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isImportingConfirmed}
                onClick={() => setCsvPreview(null)}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Statistics Badges */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 my-3 shrink-0">
              <div className="bg-slate-50 border border-slate-200/80 p-2.5 rounded-xl">
                <div className="text-[10px] text-slate-500 font-bold uppercase">Tổng số nhận diện</div>
                <div className="text-lg font-extrabold text-blue-600">{csvPreview.records.length} <span className="text-xs font-medium text-slate-500">đoàn viên</span></div>
              </div>
              <div className="bg-emerald-50 border border-emerald-200/80 p-2.5 rounded-xl">
                <div className="text-[10px] text-emerald-700 font-bold uppercase">Tạo mới hồ sơ</div>
                <div className="text-lg font-extrabold text-emerald-600">+{csvPreview.totalNew}</div>
              </div>
              <div className="bg-blue-50 border border-blue-200/80 p-2.5 rounded-xl">
                <div className="text-[10px] text-blue-700 font-bold uppercase">Cập nhật tài khoản có sẵn</div>
                <div className="text-lg font-extrabold text-blue-600">{csvPreview.totalExisting}</div>
              </div>
              <div className="bg-amber-50 border border-amber-200/80 p-2.5 rounded-xl">
                <div className="text-[10px] text-amber-700 font-bold uppercase">Chi đoàn / Lớp</div>
                <div className="text-xs font-extrabold text-amber-800 truncate" title={csvPreview.branchesList.join(', ')}>
                  {csvPreview.branchesList.length > 0 ? csvPreview.branchesList.join(', ') : 'Chưa xác định'}
                </div>
              </div>
            </div>

            {/* Explanatory note */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[11px] text-slate-600 mb-3 shrink-0 flex items-center justify-between">
              <span>Hệ thống đã tự động định dạng và phục hồi dấu tiếng Việt cho các hồ sơ. Vui lòng kiểm tra danh sách trước khi xác nhận lưu vào máy chủ.</span>
              <span className="text-slate-400 font-medium text-[10px] shrink-0 ml-2">Hiển thị {csvPreview.records.length} bản ghi</span>
            </div>

            {/* Scrollable Preview Table */}
            <div className="flex-1 overflow-y-auto border border-slate-200 rounded-2xl no-scrollbar min-h-[220px]">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] tracking-wider sticky top-0 z-10 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3 w-12 text-center">STT</th>
                    <th className="py-2.5 px-3 w-28">MSSV</th>
                    <th className="py-2.5 px-3">Họ và tên</th>
                    <th className="py-2.5 px-3 w-32">Chi đoàn / Lớp</th>
                    <th className="py-2.5 px-3 w-24">Vai trò</th>
                    <th className="py-2.5 px-3 w-32 text-center">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {csvPreview.records.map((r, idx) => (
                    <tr key={idx} className="hover:bg-blue-50/50 transition-colors">
                      <td className="py-2 px-3 text-slate-400 text-center text-[11px]">{r.stt}</td>
                      <td className="py-2 px-3 font-mono font-bold text-slate-800">{r.mssv}</td>
                      <td className="py-2 px-3 font-bold text-slate-900">{r.name}</td>
                      <td className="py-2 px-3">
                        <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px] font-semibold border border-slate-200/60">
                          {r.branch}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-600 text-[11px]">
                        {r.role === 'chidoan' ? 'Chi đoàn' : 'Đoàn viên'}
                      </td>
                      <td className="py-2 px-3 text-center">
                        {r.isExisting ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                            🔄 Cập nhật
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                            🆕 Tạo mới
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Modal Footer Actions */}
            <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 mt-3">
              <div className="text-xs text-slate-500 font-medium">
                {isImportingConfirmed ? (
                  <span className="text-blue-600 font-bold flex items-center gap-1.5">
                    <span className="inline-block w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></span>
                    Đang nạp dữ liệu ({importProgress ? `${importProgress.current}/${importProgress.total}` : 'Đang xử lý...'}), vui lòng không đóng trang...
                  </span>
                ) : (
                  <span>Bấm nút bên phải để xác nhận lưu toàn bộ dữ liệu vào Firestore</span>
                )}
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  disabled={isImportingConfirmed}
                  onClick={() => setCsvPreview(null)}
                  className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs transition cursor-pointer disabled:opacity-50"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  disabled={isImportingConfirmed}
                  onClick={handleConfirmBulkImport}
                  className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-700 text-white text-xs shadow-md transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <CheckCircle2 size={16} />
                  <span>{isImportingConfirmed ? 'Đang nạp dữ liệu...' : `Xác nhận nhập (${csvPreview.records.length} đoàn viên)`}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showLinkCustomModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl animate-scaleUp">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <FileSpreadsheet size={18} />
                </div>
                <h3 className="font-bold text-base text-slate-800">Liên kết Google Sheet có sẵn</h3>
              </div>
              <button 
                type="button" 
                onClick={() => { setShowLinkCustomModal(false); setSheetsSyncErrorMsg(''); }} 
                className="text-slate-400 hover:text-slate-600 font-bold text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-4">
              Nhập liên kết (URL) hoặc ID của bảng tính Google Sheet mà tài khoản Google của bạn có quyền chỉnh sửa. Hệ thống sẽ tự động cấu hình và đồng bộ dữ liệu vào bảng tính này.
            </p>

            <form onSubmit={handleLinkCustomSheet} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5 ml-0.5">
                  Đường dẫn (URL) hoặc Spreadsheet ID
                </label>
                <input 
                  type="text" 
                  required
                  placeholder="https://docs.google.com/spreadsheets/d/... hoặc ID"
                  value={customSheetInput}
                  onChange={e => setCustomSheetInput(e.target.value)}
                  className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 focus:bg-white font-medium"
                />
              </div>

              {sheetsSyncErrorMsg && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl font-medium">
                  {sheetsSyncErrorMsg}
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  disabled={isConnectingSheets}
                  onClick={() => { setShowLinkCustomModal(false); setSheetsSyncErrorMsg(''); }}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isConnectingSheets || !customSheetInput.trim()}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isConnectingSheets ? (
                    <>
                      <RefreshCw size={13} className="animate-spin" />
                      Đang kết nối...
                    </>
                  ) : (
                    <>
                      <Link2 size={14} />
                      Xác nhận liên kết
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showSendConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl animate-scaleUp max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center">
                  <Send size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-800">Xác nhận gửi thông báo hàng loạt</h3>
                  <p className="text-[11px] text-slate-500">Kiểm tra thông tin trước khi phát hành</p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setShowSendConfirmModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-700">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div className="text-[10px] font-bold text-slate-500 uppercase">Hộp thư gửi chính thức:</div>
                <div className="font-bold text-blue-700 text-sm mt-0.5">
                  BCH Đoàn khoa ĐTVT &lt;{gmailConnectedEmail || 'dkdtvt.hcmus@gmail.com'}&gt;
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  Địa chỉ phản hồi (Reply-To): dkdtvt.hcmus@gmail.com
                </div>
              </div>

              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase">Tiêu đề:</div>
                <div className="font-bold text-slate-800 mt-0.5">{announceTitle}</div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="text-[10px] font-bold text-slate-500 uppercase">Danh sách người nhận ({getRecipientEmailsList().length} email):</div>
                  {currentUser?.email && !getRecipientEmailsList().includes(currentUser.email) && (
                    <button
                      type="button"
                      onClick={() => setCustomRecipients(prev => Array.from(new Set([...prev, currentUser.email!])))}
                      className="text-[10px] font-bold text-blue-600 hover:underline cursor-pointer"
                    >
                      + Thêm email của tôi ({currentUser.email})
                    </button>
                  )}
                </div>
                <div className="max-h-28 overflow-y-auto p-2 bg-slate-50 rounded-lg border border-slate-200 mt-1 font-mono text-[11px] text-slate-600 space-y-1">
                  {getRecipientEmailsList().length === 0 ? (
                    <div className="text-amber-600 italic">Chưa có người nhận nào. Vui lòng thêm email nhận thử ở trên.</div>
                  ) : (
                    getRecipientEmailsList().map((em, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-1.5">
                        <div><span className="text-slate-400">{idx + 1}.</span> {em}</div>
                        {customRecipients.includes(em) && (
                          <button
                            type="button"
                            onClick={() => setCustomRecipients(prev => prev.filter(x => x !== em))}
                            className="text-slate-400 hover:text-rose-600 text-xs font-bold"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {attachedFiles.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase">Tệp đính kèm ({attachedFiles.length}):</div>
                  <div className="space-y-1 mt-1">
                    {attachedFiles.map((f, idx) => (
                      <span key={idx} className="inline-block mr-2 px-2 py-1 bg-rose-50 text-rose-700 rounded text-[11px] font-medium border border-rose-200">
                        📎 {f.filename}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {isSendingAnnouncement ? (
                <div className="p-3 bg-blue-50 text-blue-900 rounded-xl border border-blue-200 text-xs flex items-center gap-2">
                  <RefreshCw size={14} className="animate-spin text-blue-600 shrink-0" />
                  <span>Đang kết nối Gmail và gửi thông báo... Vui lòng không đóng cửa sổ.</span>
                </div>
              ) : (
                <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-200 text-blue-900 text-[11.5px] font-medium">
                  ℹ️ Email sẽ được gửi trực tiếp từ hộp thư Đoàn khoa đến các địa chỉ trên, đồng thời cập nhật ngay lên bảng tin thông báo trong ứng dụng.
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 pt-4 mt-4 border-t border-slate-100">
              <button
                type="button"
                disabled={isSendingAnnouncement}
                onClick={() => setShowSendConfirmModal(false)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer disabled:opacity-50"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={isSendingAnnouncement}
                onClick={handleExecuteSend}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isSendingAnnouncement ? (
                  <>
                    <RefreshCw size={13} className="animate-spin" />
                    Đang gửi ngay...
                  </>
                ) : (
                  <>
                    <Send size={14} />
                    Xác nhận gửi ngay
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}