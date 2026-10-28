import React, { useState, useEffect } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Lightbulb,
  Award,
  BookOpen,
  Send,
  FileText,
  ExternalLink,
  CheckCircle2,
  Clock,
  AlertCircle,
  ThumbsUp,
  Plus,
  Trash2,
  Edit3,
  Download,
  Eye,
  X,
  Sparkles,
  ShieldCheck,
  Filter,
  Search,
  Settings,
  Save,
  RotateCcw,
} from 'lucide-react';
import {
  collection,
  query,
  getDocs,
  getDoc,
  setDoc,
  orderBy,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import Papa from 'papaparse';
import {
  DEFAULT_TNTT_CONFIG,
  TnttConfigData,
  CategoryCriteriaGroup,
  CriterionItem,
  countWords,
} from '../data/tnttCriteria';

const IDEA_CATEGORIES = [
  'Học tập & Nghiên cứu khoa học (IoT, Vi mạch, Viễn thông, AI...)',
  'Chuyển đổi số & Ứng dụng CNTT trong công tác Đoàn - Hội',
  'Hoạt động Tình nguyện & Phục vụ cộng đồng',
  'Văn hóa - Văn nghệ - Thể dục thể thao & Đời sống sinh viên',
  'Xây dựng Đoàn - Phát triển kỹ năng mềm & Hội nhập quốc tế',
  'Khác',
];

const DEFAULT_FALLBACK_TOPICS = [
  {
    id: 'default_1',
    title: 'Điều lệ Đoàn TNCS Hồ Chí Minh & Quyền, Nhiệm vụ Đoàn viên',
    content: `Đoàn Thanh niên Cộng sản Hồ Chí Minh là tổ chức chính trị - xã hội của thanh niên Việt Nam do Đảng Cộng sản Việt Nam và Chủ tịch Hồ Chí Minh sáng lập, lãnh đạo và rèn luyện.\n\n• Nhiệm vụ của Đoàn viên:\n1. Luôn phấn đấu vì lý tưởng của Đảng và Bác Hồ. Tích cực học tập, rèn luyện để nâng cao trình độ về mọi mặt.\n2. Gương mẫu chấp hành và vận động thanh, thiếu nhi thực hiện đường lối, chủ trương của Đảng, chính sách và pháp luật của Nhà nước.\n3. Tham gia xây dựng, bảo vệ Đảng và chính quyền. Chấp hành Điều lệ Đoàn và các nghị quyết của Đoàn; sinh hoạt Đoàn và đóng đoàn phí đúng quy định.`,
  },
  {
    id: 'default_2',
    title: 'Chương trình Rèn luyện Đoàn viên & Đánh giá xếp loại cuối năm',
    content: `Chương trình Rèn luyện Đoàn viên gắn với 5 tiêu chí rèn luyện và 10 hành động cụ thể:\n• Rèn luyện về lý tưởng cách mạng, nhận thức chính trị.\n• Rèn luyện về đạo đức, lối sống, tác phong Đoàn viên.\n• Rèn luyện về chuyên môn, nghiệp vụ, học tập và nghiên cứu khoa học.\n• Rèn luyện về sức khỏe, kỹ năng thực hành xã hội.\n• Rèn luyện về ý thức trong xây dựng tổ chức Đoàn.`,
  },
  {
    id: 'default_3',
    title: 'Danh hiệu "Thanh niên tiên tiến làm theo lời Bác" Trường ĐH KHTN',
    content: `• Đối với Đoàn viên (Sinh viên): Đăng ký xét chọn danh hiệu Cá nhân "Thanh niên tiên tiến làm theo lời Bác".\n• Đối với Chi đoàn: Đăng ký xét chọn danh hiệu Tập thể "Tập thể tiên tiến làm theo lời Bác".\n• BCH Đoàn khoa Điện tử - Viễn thông thực hiện tiếp nhận, kiểm tra minh chứng và thẩm định hồ sơ trực tuyến ngay trên hệ thống.`,
  },
];

export default function HandbookScreen() {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';
  const isBranch = currentUser?.role === 'chidoan';
  const isDoanVien = !isAdmin && !isBranch;

  // Main Sub-Tabs inside HandbookScreen
  const [activeSubTab, setActiveSubTab] = useState<'handbook' | 'ideas' | 'tntt'>('handbook');

  // --- 1. HANDBOOK TOPICS STATE ---
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [topics, setTopics] = useState<any[]>([]);

  // --- 2. YOUTH IDEAS STATE ---
  const [ideasViewMode, setIdeasViewMode] = useState<'submit' | 'my_ideas' | 'community' | 'manage'>('submit');
  const [ideasList, setIdeasList] = useState<any[]>([]);
  const [loadingIdeas, setLoadingIdeas] = useState(false);
  const [editingIdeaId, setEditingIdeaId] = useState<string | null>(null);
  const [ideaTitle, setIdeaTitle] = useState('');
  const [ideaCategory, setIdeaCategory] = useState(IDEA_CATEGORIES[0]);
  const [ideaProblem, setIdeaProblem] = useState('');
  const [ideaSolution, setIdeaSolution] = useState('');
  const [ideaImpact, setIdeaImpact] = useState('');
  const [ideaAttachment, setIdeaAttachment] = useState('');
  const [ideaIsPublic, setIdeaIsPublic] = useState(true);
  const [submittingIdea, setSubmittingIdea] = useState(false);
  const [ideaBannerMsg, setIdeaBannerMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [communityFilterCat, setCommunityFilterCat] = useState('all');
  const [reviewingIdea, setReviewingIdea] = useState<any | null>(null);
  const [reviewIdeaStatus, setReviewIdeaStatus] = useState('approved');
  const [reviewIdeaFeedback, setReviewIdeaFeedback] = useState('');

  // --- 3. TNTT DYNAMIC CONFIG & APPLICATION STATE ---
  const [tnttConfig, setTnttConfig] = useState<TnttConfigData>(DEFAULT_TNTT_CONFIG);
  const [configEditDraft, setConfigEditDraft] = useState<TnttConfigData>(DEFAULT_TNTT_CONFIG);
  const [configSubSection, setConfigSubSection] = useState<'general' | 'individual' | 'collective'>('general');
  const [editingGroupIdx, setEditingGroupIdx] = useState<number>(0);
  const [savingConfig, setSavingConfig] = useState(false);

  // Default view mode inside TNTT tab:
  // - Đoàn khoa (isAdmin): 'manage' (Xem hồ sơ đã nộp, minh chứng & thẩm định)
  // - Đoàn viên / Chi đoàn: 'form' (Kê khai & nộp hồ sơ)
  const [tnttViewMode, setTnttViewMode] = useState<
    'form' | 'my_apps' | 'appendix_guide' | 'manage' | 'config_editor'
  >(isAdmin ? 'manage' : 'form');

  const [tnttList, setTnttList] = useState<any[]>([]);
  const [loadingTntt, setLoadingTntt] = useState(false);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [editingAppId, setEditingAppId] = useState<string | null>(null);
  const [editingAppPriorStatus, setEditingAppPriorStatus] = useState<string | null>(null);

  // Strictly locked by role:
  // - Đoàn viên -> 'individual' (Sinh viên)
  // - Chi đoàn -> 'collective' (Tập thể Chi đoàn)
  const lockedApplicantType: 'individual' | 'collective' = isBranch ? 'collective' : 'individual';

  const [awardLevel, setAwardLevel] = useState<'truong' | 'tieubieu'>('truong');
  const [fullName, setFullName] = useState(
    isBranch ? `Chi đoàn ${currentUser?.branch || ''}`.trim() : currentUser?.name || ''
  );
  const [mssv, setMssv] = useState(currentUser?.mssv || '');
  const [branch, setBranch] = useState(currentUser?.branch || '');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [phone, setPhone] = useState('');

  // Common Criteria (Individual - Sinh viên only)
  const [unionRating, setUnionRating] = useState('Hoàn thành xuất sắc nhiệm vụ');
  const [uncleHoPracticeWork, setUncleHoPracticeWork] = useState('');
  const [drlScore, setDrlScore] = useState('');
  const [drlEvidenceLink, setDrlEvidenceLink] = useState('');
  const [gpaScore, setGpaScore] = useState('');
  const [gpaEvidenceLink, setGpaEvidenceLink] = useState('');
  const [enoughCreditsConfirm, setEnoughCreditsConfirm] = useState(true);

  // Collective common criteria (Chi đoàn)
  const [collectiveOrgRating, setCollectiveOrgRating] = useState('Hoàn thành xuất sắc nhiệm vụ');
  const [collectiveAwardConfirm, setCollectiveAwardConfirm] = useState('Giấy khen BCH Đoàn trường');

  // Specific Criteria selections & inputs
  const [primaryCategory, setPrimaryCategory] = useState(DEFAULT_TNTT_CONFIG.individualGroups[0].id);
  const [criteriaResponses, setCriteriaResponses] = useState<
    Record<string, { selected: boolean; declarationText: string; evidenceLink: string }>
  >({});
  const [folderEvidenceLink, setFolderEvidenceLink] = useState('');
  const [submittingTntt, setSubmittingTntt] = useState(false);
  const [tnttBannerMsg, setTnttBannerMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Đoàn khoa (Admin) review modal for TNTT
  const [viewingApp, setViewingApp] = useState<any | null>(null);
  const [reviewAppStatus, setReviewAppStatus] = useState('approved_faculty');
  const [reviewAppNote, setReviewAppNote] = useState('');
  const [filterTnttCategory, setFilterTnttCategory] = useState('all');
  const [filterTnttStatus, setFilterTnttStatus] = useState('all');
  const [searchTnttQuery, setSearchTnttQuery] = useState('');

  useEffect(() => {
    if (isAdmin && tnttViewMode === 'form') {
      setTnttViewMode('manage');
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchTopics();
    fetchIdeas();
    fetchTnttConfig();
    fetchTnttApplications();
  }, [currentUser]);

  useEffect(() => {
    if (currentUser && !editingAppId) {
      setFullName(
        isBranch
          ? currentUser.name || `Chi đoàn ${currentUser.branch || ''}`.trim()
          : currentUser.name || ''
      );
      setMssv(isBranch ? '' : currentUser.mssv || '');
      setBranch(currentUser.branch || '');
      setEmail(currentUser.email || '');
    }
  }, [currentUser, isBranch, editingAppId]);

  const fetchTopics = async () => {
    try {
      const q = query(collection(db, 'handbook_topics'), orderBy('order', 'asc'));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setTopics(data.length > 0 ? data : DEFAULT_FALLBACK_TOPICS);
    } catch (err) {
      console.error(err);
      setTopics(DEFAULT_FALLBACK_TOPICS);
    }
  };

  const fetchIdeas = async () => {
    setLoadingIdeas(true);
    try {
      const q = query(collection(db, 'youth_ideas'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setIdeasList(data);
    } catch (err) {
      console.error('Error loading ideas:', err);
    } finally {
      setLoadingIdeas(false);
    }
  };

  const fetchTnttConfig = async () => {
    try {
      const docRef = doc(db, 'system', 'tntt_config');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data() as Partial<TnttConfigData>;
        const cleanedGroups = (
          Array.isArray(data.individualGroups) && data.individualGroups.length > 0
            ? data.individualGroups
            : DEFAULT_TNTT_CONFIG.individualGroups
        ).filter(g => g.id !== 'canbotre_gv');

        const merged: TnttConfigData = {
          docInfo: {
            ...DEFAULT_TNTT_CONFIG.docInfo,
            ...(data.docInfo || {}),
            timeline:
              Array.isArray(data.docInfo?.timeline) && data.docInfo!.timeline.length > 0
                ? data.docInfo!.timeline
                : DEFAULT_TNTT_CONFIG.docInfo.timeline,
            steps:
              Array.isArray(data.docInfo?.steps) && data.docInfo!.steps.length > 0
                ? data.docInfo!.steps
                : DEFAULT_TNTT_CONFIG.docInfo.steps,
          },
          individualGroups: cleanedGroups.length > 0 ? cleanedGroups : DEFAULT_TNTT_CONFIG.individualGroups,
          collectiveCriteria:
            Array.isArray(data.collectiveCriteria) && data.collectiveCriteria.length > 0
              ? data.collectiveCriteria
              : DEFAULT_TNTT_CONFIG.collectiveCriteria,
        };
        setTnttConfig(merged);
        setConfigEditDraft(JSON.parse(JSON.stringify(merged)));
        if (merged.individualGroups.length > 0) {
          setPrimaryCategory(merged.individualGroups[0].id);
        }
      } else {
        setTnttConfig(DEFAULT_TNTT_CONFIG);
        setConfigEditDraft(JSON.parse(JSON.stringify(DEFAULT_TNTT_CONFIG)));
      }
    } catch (err) {
      console.error('Error fetching TNTT config:', err);
    }
  };

  const fetchTnttApplications = async () => {
    setLoadingTntt(true);
    try {
      const q = query(collection(db, 'tntt_applications'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setTnttList(data);
    } catch (err) {
      console.error('Error loading TNTT applications:', err);
    } finally {
      setLoadingTntt(false);
    }
  };

  // --- SAVE TNTT CONFIG (ĐOÀN KHOA - ADMIN ONLY) ---
  const handleSaveTnttConfig = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isAdmin) return;
    setSavingConfig(true);
    setTnttBannerMsg(null);
    try {
      const payload: TnttConfigData = {
        ...configEditDraft,
        updatedAt: Date.now(),
      };
      await setDoc(doc(db, 'system', 'tntt_config'), payload);
      setTnttConfig(payload);
      setTnttBannerMsg({
        type: 'success',
        text: 'Đã lưu cấu hình Thông báo & Phụ lục tiêu chuẩn TNTT làm theo lời Bác! Toàn bộ biểu mẫu của Đoàn viên và Chi đoàn đã được cập nhật.',
      });
    } catch (err) {
      console.error('Error saving TNTT config:', err);
      setTnttBannerMsg({
        type: 'error',
        text: 'Không thể lưu cấu hình TNTT. Vui lòng kiểm tra kết nối và thử lại.',
      });
    } finally {
      setSavingConfig(false);
    }
  };

  const handleRestoreDefaultTnttConfig = async () => {
    if (!isAdmin) return;
    const defaultCopy: TnttConfigData = JSON.parse(JSON.stringify(DEFAULT_TNTT_CONFIG));
    setConfigEditDraft(defaultCopy);
    setSavingConfig(true);
    try {
      await setDoc(doc(db, 'system', 'tntt_config'), {
        ...defaultCopy,
        updatedAt: Date.now(),
      });
      setTnttConfig(defaultCopy);
      setEditingGroupIdx(0);
      setTnttBannerMsg({
        type: 'success',
        text: 'Đã khôi phục nội dung mặc định theo Thông báo 180-TB/ĐTN ngày 25/12/2025.',
      });
    } catch (err) {
      console.error('Error restoring default config:', err);
    } finally {
      setSavingConfig(false);
    }
  };

  // --- HANDLERS FOR YOUTH IDEAS ---
  const handleResetIdeaForm = () => {
    setEditingIdeaId(null);
    setIdeaTitle('');
    setIdeaCategory(IDEA_CATEGORIES[0]);
    setIdeaProblem('');
    setIdeaSolution('');
    setIdeaImpact('');
    setIdeaAttachment('');
    setIdeaIsPublic(true);
  };

  const handleSubmitIdea = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (!ideaTitle.trim() || !ideaSolution.trim()) {
      setIdeaBannerMsg({ type: 'error', text: 'Vui lòng nhập đầy đủ Tiêu đề và Nội dung giải pháp sáng kiến.' });
      return;
    }

    setSubmittingIdea(true);
    setIdeaBannerMsg(null);
    try {
      const now = Date.now();
      const payload = {
        userId: currentUser.uid,
        authorName: (currentUser.name || 'Đoàn viên').slice(0, 250),
        mssv: (currentUser.mssv || '').slice(0, 64),
        branch: (currentUser.branch || 'Đoàn khoa ĐTVT').slice(0, 120),
        email: (currentUser.email || '').slice(0, 250),
        title: ideaTitle.trim().slice(0, 500),
        category: ideaCategory.slice(0, 120),
        problemStatement: ideaProblem.trim().slice(0, 4000),
        solutionProposal: ideaSolution.trim().slice(0, 15000),
        expectedImpact: ideaImpact.trim().slice(0, 4000),
        attachmentLink: ideaAttachment.trim().slice(0, 1000),
        isPublic: ideaIsPublic,
        status: 'pending',
        adminFeedback: '',
        upvotes: 0,
        upvotedBy: [],
        createdAt: now,
        updatedAt: now,
      };

      if (editingIdeaId) {
        const existingIdea = ideasList.find(i => i.id === editingIdeaId);
        await updateDoc(doc(db, 'youth_ideas', editingIdeaId), {
          ...payload,
          userId: existingIdea?.userId || currentUser.uid,
          status: existingIdea?.status || 'pending',
          adminFeedback: existingIdea?.adminFeedback || '',
          upvotes: existingIdea?.upvotes || 0,
          upvotedBy: existingIdea?.upvotedBy || [],
          createdAt: existingIdea?.createdAt || now,
          updatedAt: now,
        });
        setIdeaBannerMsg({ type: 'success', text: 'Đã cập nhật ý tưởng, sáng kiến thành công!' });
      } else {
        await addDoc(collection(db, 'youth_ideas'), payload);
        setIdeaBannerMsg({
          type: 'success',
          text: 'Cảm ơn bạn đã đóng góp ý tưởng, sáng kiến sáng tạo cho Đoàn khoa ĐTVT!',
        });
      }
      handleResetIdeaForm();
      await fetchIdeas();
      setIdeasViewMode('my_ideas');
    } catch (err) {
      console.error('Error saving idea:', err);
      setIdeaBannerMsg({ type: 'error', text: 'Không thể gửi ý tưởng. Vui lòng thử lại.' });
    } finally {
      setSubmittingIdea(false);
    }
  };

  const handleToggleUpvoteIdea = async (idea: any) => {
    if (!currentUser) return;
    const upvotedBy: string[] = Array.isArray(idea.upvotedBy) ? idea.upvotedBy : [];
    const hasUpvoted = upvotedBy.includes(currentUser.uid);
    const updatedList = hasUpvoted
      ? upvotedBy.filter(uid => uid !== currentUser.uid)
      : [...upvotedBy, currentUser.uid];

    try {
      await updateDoc(doc(db, 'youth_ideas', idea.id), {
        upvotes: updatedList.length,
        upvotedBy: updatedList,
        updatedAt: Date.now(),
      });
      setIdeasList(prev =>
        prev.map(item =>
          item.id === idea.id
            ? { ...item, upvotes: updatedList.length, upvotedBy: updatedList }
            : item
        )
      );
    } catch (err) {
      console.error('Error upvoting idea:', err);
    }
  };

  const handleDeleteIdea = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'youth_ideas', id));
      setIdeasList(prev => prev.filter(i => i.id !== id));
    } catch (err) {
      console.error('Error deleting idea:', err);
    }
  };

  const handleSaveIdeaReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewingIdea || !isAdmin) return;
    try {
      await updateDoc(doc(db, 'youth_ideas', reviewingIdea.id), {
        status: reviewIdeaStatus,
        adminFeedback: reviewIdeaFeedback.trim(),
        updatedAt: Date.now(),
      });
      setReviewingIdea(null);
      await fetchIdeas();
    } catch (err) {
      console.error('Error reviewing idea:', err);
    }
  };

  const handleExportIdeasCSV = () => {
    const rows = ideasList.map((item, idx) => ({
      STT: idx + 1,
      'Họ và tên': item.authorName,
      MSSV: item.mssv || '',
      'Chi đoàn': item.branch || '',
      Email: item.email || '',
      'Tên ý tưởng / Sáng kiến': item.title,
      'Lĩnh vực': item.category,
      'Thực trạng / Vấn đề': item.problemStatement || '',
      'Giải pháp đề xuất': item.solutionProposal || '',
      'Hiệu quả dự kiến': item.expectedImpact || '',
      'Link đính kèm': item.attachmentLink || '',
      'Lượt ủng hộ': item.upvotes || 0,
      'Trạng thái': getIdeaStatusLabel(item.status),
      'Phản hồi BCH': item.adminFeedback || '',
      'Ngày gửi': new Date(item.createdAt).toLocaleDateString('vi-VN'),
    }));
    const csv = Papa.unparse(rows);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Danh_sach_Y_tuong_Sang_kien_FETEL.csv`;
    a.click();
  };

  // --- HANDLERS FOR TNTT APPLICATIONS ---
  const updateCriterionResponse = (
    criterionId: string,
    field: 'selected' | 'declarationText' | 'evidenceLink',
    value: any
  ) => {
    setCriteriaResponses(prev => {
      const current = prev[criterionId] || { selected: false, declarationText: '', evidenceLink: '' };
      const updated = { ...current, [field]: value };
      if ((field === 'declarationText' || field === 'evidenceLink') && value && !current.selected) {
        updated.selected = true;
      }
      return { ...prev, [criterionId]: updated };
    });
  };

  const handleResetTnttForm = () => {
    setEditingAppId(null);
    setEditingAppPriorStatus(null);
    setAwardLevel('truong');
    setFullName(
      isBranch
        ? currentUser?.name || `Chi đoàn ${currentUser?.branch || ''}`.trim()
        : currentUser?.name || ''
    );
    setMssv(isBranch ? '' : currentUser?.mssv || '');
    setBranch(currentUser?.branch || '');
    setEmail(currentUser?.email || '');
    setPhone('');
    setUnionRating('Hoàn thành xuất sắc nhiệm vụ');
    setUncleHoPracticeWork('');
    setDrlScore('');
    setDrlEvidenceLink('');
    setGpaScore('');
    setGpaEvidenceLink('');
    setCriteriaResponses({});
    setFolderEvidenceLink('');
  };

  const handleEditApplication = (app: any) => {
    setEditingAppId(app.id);
    setEditingAppPriorStatus(app.status || 'pending');
    setAwardLevel(app.awardLevel || 'truong');
    setFullName(app.fullName || '');
    setMssv(app.mssv || '');
    setBranch(app.branch || '');
    setEmail(app.email || '');
    setPhone(app.phone || '');
    setUnionRating(app.unionRating || 'Hoàn thành xuất sắc nhiệm vụ');
    setUncleHoPracticeWork(app.uncleHoPracticeWork || '');
    setDrlScore(app.drlScore || '');
    setDrlEvidenceLink(app.drlEvidenceLink || '');
    setGpaScore(app.gpaScore || '');
    setGpaEvidenceLink(app.gpaEvidenceLink || '');
    setEnoughCreditsConfirm(app.enoughCreditsConfirm ?? true);
    setCollectiveOrgRating(app.collectiveOrgRating || 'Hoàn thành xuất sắc nhiệm vụ');
    setCollectiveAwardConfirm(app.collectiveAwardConfirm || 'Giấy khen BCH Đoàn trường');
    setPrimaryCategory(app.primaryCategory || tnttConfig.individualGroups[0]?.id || 'hoctap_nckh');
    setCriteriaResponses(app.criteriaResponses || {});
    setFolderEvidenceLink(app.folderEvidenceLink || '');
    setViewingApp(null);
    setTnttViewMode('form');
  };

  const handleSubmitTnttApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || isAdmin) return;
    setTnttBannerMsg(null);

    if (!fullName.trim() || !branch.trim()) {
      setTnttBannerMsg({
        type: 'error',
        text: 'Vui lòng điền đầy đủ Họ tên / Tên Chi đoàn và Đơn vị.',
      });
      return;
    }

    const maxPracticeWords = tnttConfig.docInfo.maxWordsUncleHoWork || 100;
    const minDrl = tnttConfig.docInfo.minDrlScore ?? 85;
    const minGpaBase = tnttConfig.docInfo.minGpaTruong ?? 7.0;
    const minGpaExemplary = tnttConfig.docInfo.minGpaTieuBieu ?? 8.0;

    if (lockedApplicantType === 'individual') {
      if (!mssv.trim()) {
        setTnttBannerMsg({
          type: 'error',
          text: 'Vui lòng nhập Mã số sinh viên (MSSV).',
        });
        return;
      }

      const practiceWords = countWords(uncleHoPracticeWork);
      if (practiceWords === 0) {
        setTnttBannerMsg({
          type: 'error',
          text: 'Vui lòng kê khai Phần việc làm thiết thực học tập và làm theo lời Bác (Tiêu chuẩn chung số 3).',
        });
        return;
      }
      if (practiceWords > maxPracticeWords) {
        setTnttBannerMsg({
          type: 'error',
          text: `Phần việc làm theo lời Bác (Tiêu chuẩn chung 3) vượt quá ${maxPracticeWords} chữ (${practiceWords}/${maxPracticeWords} chữ). Vui lòng rút gọn theo đúng quy định.`,
        });
        return;
      }

      const drlNum = parseFloat(drlScore);
      const gpaNum = parseFloat(gpaScore);
      if (isNaN(drlNum) || drlNum < minDrl) {
        setTnttBannerMsg({
          type: 'error',
          text: `Theo quy định đối với Sinh viên (Mục 1.1), Điểm rèn luyện năm học gần nhất phải đạt từ ${minDrl} điểm trở lên.`,
        });
        return;
      }
      if (!drlEvidenceLink.trim()) {
        setTnttBannerMsg({
          type: 'error',
          text: 'Vui lòng đính kèm Link File scan PDF kết quả điểm rèn luyện có xác nhận của phòng Công tác Sinh viên (Mục 1.1).',
        });
        return;
      }
      const minGpa =
        awardLevel === 'tieubieu' && primaryCategory === 'hoctap_nckh' ? minGpaExemplary : minGpaBase;
      if (isNaN(gpaNum) || gpaNum < minGpa) {
        setTnttBannerMsg({
          type: 'error',
          text: `Theo quy định đối với Sinh viên (Mục 1.2), Điểm trung bình tích lũy phải đạt từ ${minGpa.toFixed(1)} trở lên.`,
        });
        return;
      }
      if (!gpaEvidenceLink.trim()) {
        setTnttBannerMsg({
          type: 'error',
          text: 'Vui lòng đính kèm Link File scan PDF bảng điểm có xác nhận của phòng Đào tạo (Mục 1.2).',
        });
        return;
      }
    }

    const allCriteriaItems: CriterionItem[] =
      lockedApplicantType === 'individual'
        ? tnttConfig.individualGroups.flatMap(g => g.criteria)
        : tnttConfig.collectiveCriteria;

    const selectedItems = allCriteriaItems.filter(c => criteriaResponses[c.id]?.selected);
    if (selectedItems.length === 0) {
      setTnttBannerMsg({
        type: 'error',
        text: 'Vui lòng tích chọn và kê khai ít nhất 01 Tiêu chuẩn theo Phụ lục yêu cầu minh chứng.',
      });
      return;
    }

    for (const item of selectedItems) {
      const resp = criteriaResponses[item.id];
      if (item.maxWords && resp?.declarationText) {
        const wCount = countWords(resp.declarationText);
        if (wCount > item.maxWords) {
          setTnttBannerMsg({
            type: 'error',
            text: `Mục ${item.code} vượt quá giới hạn ${item.maxWords} chữ (${wCount}/${item.maxWords} chữ). Vui lòng rút gọn đúng yêu cầu.`,
          });
          return;
        }
      }
    }

    setSubmittingTntt(true);
    try {
      const now = Date.now();
      const categoryObj = tnttConfig.individualGroups.find(g => g.id === primaryCategory);
      const payload = {
        userId: currentUser.uid,
        applicantType: lockedApplicantType,
        awardLevel,
        personRole: lockedApplicantType === 'individual' ? 'sinhvien' : 'tapthe_chidoan',
        fullName: fullName.trim().slice(0, 250),
        mssv: lockedApplicantType === 'individual' ? mssv.trim().slice(0, 64) : '',
        branch: branch.trim().slice(0, 120),
        email: email.trim().slice(0, 250),
        phone: phone.trim().slice(0, 50),
        unionRating,
        uncleHoPracticeWork: uncleHoPracticeWork.trim(),
        drlScore: drlScore.trim(),
        drlEvidenceLink: drlEvidenceLink.trim(),
        gpaScore: gpaScore.trim(),
        gpaEvidenceLink: gpaEvidenceLink.trim(),
        enoughCreditsConfirm,
        collectiveOrgRating,
        collectiveAwardConfirm,
        primaryCategory: lockedApplicantType === 'collective' ? 'tap_the' : primaryCategory,
        primaryCategoryName:
          lockedApplicantType === 'collective'
            ? 'Tập thể tiên tiến làm theo lời Bác'
            : categoryObj?.shortName || primaryCategory,
        criteriaResponses,
        folderEvidenceLink: folderEvidenceLink.trim(),
        // CRITICAL: Any submission or re-submission by Đoàn viên / Chi đoàn always sets status to 'pending'
        // cancelling any prior evaluation!
        status: 'pending',
        reviewerNote: '',
        createdAt: now,
        updatedAt: now,
      };

      if (editingAppId) {
        const existingApp = tnttList.find(a => a.id === editingAppId);
        const wasReviewedBefore = existingApp && existingApp.status && existingApp.status !== 'pending';
        await updateDoc(doc(db, 'tntt_applications', editingAppId), {
          ...payload,
          userId: currentUser.uid,
          status: 'pending', // Hủy kết quả thẩm định trước đó, đưa về chờ thẩm định lại
          reviewerNote: '',
          createdAt: existingApp?.createdAt || now,
          updatedAt: now,
        });
        setTnttBannerMsg({
          type: 'success',
          text: wasReviewedBefore
            ? 'Đã cập nhật hồ sơ & nộp lại minh chứng thành công! Kết quả thẩm định trước đó đã được hủy để Đoàn khoa tiến hành thẩm định lại.'
            : 'Đã cập nhật hồ sơ & minh chứng thành công!',
        });
      } else {
        await addDoc(collection(db, 'tntt_applications'), payload);
        setTnttBannerMsg({
          type: 'success',
          text:
            lockedApplicantType === 'collective'
              ? 'Đã nộp hồ sơ "Tập thể tiên tiến làm theo lời Bác" của Chi đoàn thành công! Đoàn khoa ĐTVT sẽ tiến hành thẩm định.'
              : 'Đã nộp hồ sơ Cá nhân "Thanh niên tiên tiến làm theo lời Bác" thành công! Đoàn khoa ĐTVT sẽ tiến hành thẩm định.',
        });
      }

      handleResetTnttForm();
      await fetchTnttApplications();
      setTnttViewMode('my_apps');
    } catch (err) {
      console.error('Error submitting TNTT application:', err);
      setTnttBannerMsg({
        type: 'error',
        text: 'Có lỗi xảy ra khi lưu hồ sơ. Vui lòng kiểm tra lại kết nối và thử lại.',
      });
    } finally {
      setSubmittingTntt(false);
    }
  };

  const handleDeleteTnttApplication = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'tntt_applications', id));
      setTnttList(prev => prev.filter(a => a.id !== id));
      if (viewingApp?.id === id) setViewingApp(null);
    } catch (err) {
      console.error('Error deleting TNTT application:', err);
    }
  };

  const handleSaveTnttReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewingApp || !isAdmin) return;
    try {
      await updateDoc(doc(db, 'tntt_applications', viewingApp.id), {
        status: reviewAppStatus,
        reviewerNote: reviewAppNote.trim(),
        updatedAt: Date.now(),
      });
      setViewingApp(null);
      await fetchTnttApplications();
    } catch (err) {
      console.error('Error reviewing TNTT application:', err);
    }
  };

  const handleExportTnttCSV = () => {
    const rows = tnttList.map((app, idx) => {
      const selectedCodes = Object.entries(app.criteriaResponses || {})
        .filter(([_, val]: any) => val?.selected)
        .map(([key, val]: any) => `${key}: ${val.declarationText || ''} (${val.evidenceLink || 'Không link'})`)
        .join(' | ');

      return {
        STT: idx + 1,
        'Phân loại': app.applicantType === 'collective' ? 'Tập thể (Chi đoàn)' : 'Cá nhân (Sinh viên)',
        'Cấp đăng ký': app.awardLevel === 'tieubieu' ? 'Tiêu biểu cấp Trường' : 'Cấp Trường',
        'Họ và tên / Tên tập thể': app.fullName,
        MSSV: app.mssv || '',
        'Chi đoàn / Đơn vị': app.branch || '',
        Email: app.email || '',
        SĐT: app.phone || '',
        'Lĩnh vực / Đối tượng xét chọn': app.primaryCategoryName || app.primaryCategory,
        'Xếp loại Đoàn viên / Tổ chức':
          app.applicantType === 'collective' ? app.collectiveOrgRating || '' : app.unionRating || '',
        'Phần việc làm theo lời Bác': app.uncleHoPracticeWork || '',
        'Điểm rèn luyện': app.drlScore || '',
        'Link PDF Điểm rèn luyện': app.drlEvidenceLink || '',
        'ĐTB tích lũy (GPA)': app.gpaScore || '',
        'Link PDF Bảng điểm': app.gpaEvidenceLink || '',
        'Chi tiết Tiêu chuẩn riêng & Minh chứng': selectedCodes,
        'Link Folder Minh chứng tổng hợp': app.folderEvidenceLink || '',
        'Trạng thái thẩm định': getTnttStatusLabel(app.status),
        'Ghi chú thẩm định Đoàn khoa': app.reviewerNote || '',
        'Ngày cập nhật': new Date(app.updatedAt || app.createdAt).toLocaleDateString('vi-VN'),
      };
    });

    const csv = Papa.unparse(rows);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Tong_hop_Ho_so_TNTT_Lam_theo_loi_Bac_FETEL.csv`;
    a.click();
  };

  // --- HELPERS ---
  const getIdeaStatusLabel = (status: string) => {
    switch (status) {
      case 'approved':
        return 'Đã tiếp nhận';
      case 'implemented':
        return 'Đang triển khai';
      case 'featured':
        return 'Sáng kiến tiêu biểu';
      case 'rejected':
        return 'Chưa phù hợp';
      default:
        return 'Đang chờ xem xét';
    }
  };

  const getIdeaStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'implemented':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'featured':
        return 'bg-amber-50 text-amber-700 border-amber-300';
      case 'rejected':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      default:
        return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  const getTnttStatusLabel = (status: string) => {
    switch (status) {
      case 'approved_faculty':
        return 'Đã thẩm định: Đạt cấp Khoa';
      case 'proposed_exemplary':
        return 'Đã thẩm định: Đề xuất Tiêu biểu Trường';
      case 'needs_revision':
        return 'Cần bổ sung minh chứng';
      case 'rejected':
        return 'Chưa đạt yêu cầu';
      default:
        return 'Chờ Đoàn khoa thẩm định';
    }
  };

  const getTnttStatusBadge = (status: string) => {
    switch (status) {
      case 'approved_faculty':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'proposed_exemplary':
        return 'bg-amber-50 text-amber-800 border-amber-300';
      case 'needs_revision':
        return 'bg-orange-50 text-orange-700 border-orange-200';
      case 'rejected':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      default:
        return 'bg-blue-50 text-blue-700 border-blue-200';
    }
  };

  const myIdeas = ideasList.filter(i => i.userId === currentUser?.uid);
  const publicIdeas = ideasList.filter(
    i =>
      (i.isPublic || i.status === 'featured' || i.status === 'implemented') &&
      (communityFilterCat === 'all' || i.category === communityFilterCat)
  );
  const myTnttApps = tnttList.filter(a => a.userId === currentUser?.uid);

  const selectedCategoryGroup: CategoryCriteriaGroup =
    tnttConfig.individualGroups.find(g => g.id === primaryCategory) ||
    tnttConfig.individualGroups[0] ||
    DEFAULT_TNTT_CONFIG.individualGroups[0];

  const practiceWorkWordCount = countWords(uncleHoPracticeWork);
  const maxPracticeWords = tnttConfig.docInfo.maxWordsUncleHoWork || 100;

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header Banner */}
      <div
        className="relative text-white p-5 pt-8 shrink-0 overflow-hidden bg-cover bg-center shadow-lg shadow-red-950/20"
        style={{ backgroundImage: `url('/background.webp')` }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-red-700 via-red-600 to-rose-700 opacity-95 backdrop-blur-[1px]" />
        <div className="absolute -top-10 -right-10 w-44 h-44 bg-white/20 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-8 -left-8 w-36 h-36 bg-black/25 rounded-full blur-xl pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold drop-shadow-sm flex items-center gap-2">
              <BookOpen size={20} /> Sổ tay Đoàn viên FETEL
            </h2>
            <p className="text-[11px] text-red-100 opacity-95 mt-0.5 font-medium">
              Cẩm nang Đoàn - Hội • Đóng góp Sáng kiến • Hồ sơ Thanh niên tiên tiến làm theo lời Bác
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {isAdmin && (
              <button
                onClick={() => {
                  setActiveSubTab('tntt');
                  setConfigEditDraft(JSON.parse(JSON.stringify(tnttConfig)));
                  setTnttViewMode('config_editor');
                }}
                className="inline-flex items-center gap-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 px-3 py-1.5 rounded-xl text-[11px] font-extrabold transition cursor-pointer shadow-xs"
              >
                <Settings size={13} /> Sửa tiêu chuẩn TNTT
              </button>
            )}
            <button
              onClick={() => setShowPdfModal(true)}
              className="inline-flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white border border-white/30 px-3 py-1.5 rounded-xl text-[11px] font-bold transition cursor-pointer backdrop-blur-xs"
            >
              <FileText size={13} /> Văn bản {tnttConfig.docInfo.number}
            </button>
          </div>
        </div>

        {/* Top 3 Feature Tabs */}
        <div className="relative z-10 grid grid-cols-3 gap-1.5 mt-4 bg-black/20 p-1 rounded-xl border border-white/15">
          <button
            onClick={() => setActiveSubTab('handbook')}
            className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-[11px] font-bold transition cursor-pointer ${
              activeSubTab === 'handbook'
                ? 'bg-white text-red-700 shadow-sm'
                : 'text-red-50 hover:bg-white/10'
            }`}
          >
            <BookOpen size={14} className="shrink-0" />
            <span className="truncate">Cẩm nang Đoàn</span>
          </button>

          <button
            onClick={() => setActiveSubTab('ideas')}
            className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-[11px] font-bold transition cursor-pointer ${
              activeSubTab === 'ideas'
                ? 'bg-white text-red-700 shadow-sm'
                : 'text-red-50 hover:bg-white/10'
            }`}
          >
            <Lightbulb size={14} className="shrink-0" />
            <span className="truncate">Ý tưởng & Sáng kiến</span>
          </button>

          <button
            onClick={() => setActiveSubTab('tntt')}
            className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-[11px] font-bold transition cursor-pointer ${
              activeSubTab === 'tntt'
                ? 'bg-white text-red-700 shadow-sm'
                : 'text-red-50 hover:bg-white/10'
            }`}
          >
            <Award size={14} className="shrink-0" />
            <span className="truncate">Hồ sơ TNTT lời Bác</span>
          </button>
        </div>
      </div>

      {/* Main Content Body */}
      <div className="flex-1 p-4 space-y-4 bg-slate-50 overflow-y-auto no-scrollbar pb-14">
        {/* =========================================================
            TAB 1: CẨM NANG ĐOÀN - HỘI
           ========================================================= */}
        {activeSubTab === 'handbook' && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
              <div
                onClick={() => setActiveSubTab('ideas')}
                className="p-3.5 bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200/80 rounded-2xl flex items-start gap-3 cursor-pointer hover:shadow-md transition"
              >
                <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Lightbulb size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-extrabold text-amber-950 flex items-center gap-1">
                    Đóng góp Ý tưởng, Sáng kiến sáng tạo <ChevronRight size={14} />
                  </div>
                  <p className="text-[10.5px] text-amber-800/90 mt-0.5 leading-snug">
                    Đề xuất ý tưởng học thuật, chuyển đổi số, tình nguyện và xây dựng phong trào Đoàn khoa ĐTVT.
                  </p>
                </div>
              </div>

              <div
                onClick={() => setActiveSubTab('tntt')}
                className="p-3.5 bg-gradient-to-br from-red-50 to-rose-50 border border-red-200/80 rounded-2xl flex items-start gap-3 cursor-pointer hover:shadow-md transition"
              >
                <div className="w-10 h-10 rounded-xl bg-red-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Award size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-extrabold text-red-950 flex items-center gap-1">
                    {isAdmin
                      ? 'Thẩm định & Cấu hình Hồ sơ TNTT lời Bác'
                      : isBranch
                      ? 'Nộp hồ sơ Tập thể tiên tiến làm theo lời Bác'
                      : 'Nộp hồ sơ Thanh niên tiên tiến làm theo lời Bác'}{' '}
                    <ChevronRight size={14} />
                  </div>
                  <p className="text-[10.5px] text-red-800/90 mt-0.5 leading-snug">
                    {isAdmin
                      ? 'Xem hồ sơ đã nộp, kiểm tra minh chứng, thẩm định và cập nhật tiêu chuẩn năm mới.'
                      : isBranch
                      ? 'Chi đoàn kê khai hồ sơ Tập thể và cập nhật minh chứng trực tuyến.'
                      : 'Đoàn viên (Sinh viên) kê khai hồ sơ Cá nhân và đính kèm minh chứng trực tuyến.'}
                  </p>
                </div>
              </div>
            </div>

            {topics.map((topic, index) => {
              const isExpanded = expandedId === topic.id;
              return (
                <div key={topic.id} className="flex flex-col">
                  <button
                    onClick={() => setExpandedId(prev => (prev === topic.id ? null : topic.id))}
                    className={`flex items-center space-x-3 p-4 bg-white rounded-xl shadow-xs border focus:outline-none cursor-pointer transition text-left ${
                      isExpanded ? 'border-slate-200 border-l-4 border-l-red-600' : 'border-slate-200'
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg shrink-0 ${
                        isExpanded ? 'bg-red-600 text-white shadow-xs' : 'bg-red-50 text-red-600'
                      }`}
                    >
                      {index % 4 === 0 ? '🏛️' : index % 4 === 1 ? '📜' : index % 4 === 2 ? '🌟' : '⚙️'}
                    </div>
                    <div className="flex-1">
                      <div className="text-xs font-bold text-slate-800">{topic.title}</div>
                      <div
                        className={`text-[10px] mt-0.5 ${
                          isExpanded ? 'text-red-600 font-medium' : 'text-slate-400'
                        }`}
                      >
                        {isExpanded ? `Đang xem • ${topic.title}` : 'Nhấn để xem chi tiết'}
                      </div>
                    </div>
                    <div className={isExpanded ? 'text-red-600' : 'text-slate-300'}>
                      {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="p-4 pt-5 mt-[-8px] bg-blue-50/80 rounded-b-xl border border-t-0 border-blue-100">
                      <p className="text-[11px] leading-relaxed text-slate-700 whitespace-pre-line">
                        {topic.content}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* =========================================================
            TAB 2: ĐÓNG GÓP Ý TƯỞNG, SÁNG KIẾN SÁNG TẠO
           ========================================================= */}
        {activeSubTab === 'ideas' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-white p-2.5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setIdeasViewMode('submit')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                    ideasViewMode === 'submit'
                      ? 'bg-red-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Plus size={14} /> Đóng góp ý tưởng mới
                </button>
                <button
                  onClick={() => setIdeasViewMode('my_ideas')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                    ideasViewMode === 'my_ideas'
                      ? 'bg-red-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Lightbulb size={14} /> Ý tưởng của tôi ({myIdeas.length})
                </button>
                <button
                  onClick={() => setIdeasViewMode('community')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                    ideasViewMode === 'community'
                      ? 'bg-red-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Sparkles size={14} /> Không gian Sáng kiến ({publicIdeas.length})
                </button>
                {isAdmin && (
                  <button
                    onClick={() => setIdeasViewMode('manage')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                      ideasViewMode === 'manage'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                    }`}
                  >
                    <ShieldCheck size={14} /> Quản lý & Duyệt ({ideasList.length})
                  </button>
                )}
              </div>

              {isAdmin && ideasList.length > 0 && (
                <button
                  onClick={handleExportIdeasCSV}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition"
                >
                  <Download size={13} /> Xuất CSV
                </button>
              )}
            </div>

            {ideaBannerMsg && (
              <div
                className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center justify-between ${
                  ideaBannerMsg.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  {ideaBannerMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  <span>{ideaBannerMsg.text}</span>
                </div>
                <button onClick={() => setIdeaBannerMsg(null)} className="text-slate-400 hover:text-slate-600">
                  <X size={14} />
                </button>
              </div>
            )}

            {ideasViewMode === 'submit' && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5">
                <div className="flex items-start justify-between border-b border-slate-100 pb-3.5 mb-4">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                      <Lightbulb size={18} className="text-amber-500" />
                      {editingIdeaId
                        ? 'Cập nhật Ý tưởng, Sáng kiến sáng tạo'
                        : 'Đóng góp Ý tưởng, Sáng kiến sáng tạo Đoàn viên FETEL'}
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Mọi ý tưởng đóng góp thiết thực về học thuật, chuyển đổi số, tình nguyện và phong trào sẽ được BCH Đoàn khoa ghi nhận và hỗ trợ triển khai thực tế.
                    </p>
                  </div>
                  {editingIdeaId && (
                    <button
                      type="button"
                      onClick={handleResetIdeaForm}
                      className="text-xs font-bold text-slate-500 hover:text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg"
                    >
                      Hủy sửa
                    </button>
                  )}
                </div>

                <form onSubmit={handleSubmitIdea} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Người đề xuất</span>
                      <span className="font-bold text-slate-800">{currentUser?.name || 'Đoàn viên'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">MSSV</span>
                      <span className="font-bold text-slate-800">{currentUser?.mssv || 'Chưa cập nhật'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Chi đoàn / Đơn vị</span>
                      <span className="font-bold text-red-600">{currentUser?.branch || 'Đoàn khoa ĐTVT'}</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Tên ý tưởng / Sáng kiến sáng tạo <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="VD: Hệ thống mượn trả linh kiện IoT thông minh cho CLB Học thuật FETEL..."
                      value={ideaTitle}
                      onChange={e => setIdeaTitle(e.target.value)}
                      className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-red-500 font-medium text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Lĩnh vực sáng kiến <span className="text-red-600">*</span>
                    </label>
                    <select
                      value={ideaCategory}
                      onChange={e => setIdeaCategory(e.target.value)}
                      className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-red-500 font-semibold text-slate-700"
                    >
                      {IDEA_CATEGORIES.map(cat => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Thực trạng / Vấn đề cần giải quyết
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Mô tả ngắn gọn khó khăn, hạn chế hoặc nhu cầu thực tế của Đoàn viên, sinh viên hiện nay..."
                      value={ideaProblem}
                      onChange={e => setIdeaProblem(e.target.value)}
                      className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-red-500 text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Nội dung giải pháp / Đề xuất sáng kiến cụ thể <span className="text-red-600">*</span>
                    </label>
                    <textarea
                      rows={5}
                      required
                      placeholder="Trình bày chi tiết nội dung ý tưởng, cách thức vận hành, đối tượng thụ hưởng và các bước triển khai..."
                      value={ideaSolution}
                      onChange={e => setIdeaSolution(e.target.value)}
                      className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-red-500 text-slate-800"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        Giá trị & Hiệu quả mang lại dự kiến
                      </label>
                      <textarea
                        rows={3}
                        placeholder="Lợi ích thiết thực đối với sinh viên, Chi đoàn, Khoa ĐTVT hoặc cộng đồng..."
                        value={ideaImpact}
                        onChange={e => setIdeaImpact(e.target.value)}
                        className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-red-500 text-slate-800"
                      />
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">
                          Link tài liệu / Bản thuyết minh / Slide đính kèm (nếu có)
                        </label>
                        <input
                          type="url"
                          placeholder="https://drive.google.com/..."
                          value={ideaAttachment}
                          onChange={e => setIdeaAttachment(e.target.value)}
                          className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-red-500 text-slate-800"
                        />
                      </div>

                      <label className="flex items-start gap-2.5 p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl cursor-pointer">
                        <input
                          type="checkbox"
                          checked={ideaIsPublic}
                          onChange={e => setIdeaIsPublic(e.target.checked)}
                          className="mt-0.5 accent-red-600"
                        />
                        <span className="text-[11px] text-slate-700 leading-snug">
                          <strong className="text-slate-900">Chia sẻ lên Không gian Sáng kiến FETEL:</strong> Cho phép Đoàn viên trong Khoa cùng xem và bấm ủng hộ ý tưởng này.
                        </span>
                      </label>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={submittingIdea}
                    className="w-full py-3.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md shadow-red-900/15 cursor-pointer transition"
                  >
                    <Send size={15} />
                    {submittingIdea
                      ? 'Đang gửi ý tưởng...'
                      : editingIdeaId
                      ? 'Lưu cập nhật Ý tưởng'
                      : 'Gửi đóng góp Ý tưởng, Sáng kiến'}
                  </button>
                </form>
              </div>
            )}

            {ideasViewMode === 'my_ideas' && (
              <div className="space-y-3">
                {loadingIdeas ? (
                  <p className="text-xs text-center text-slate-500 py-8">Đang tải danh sách ý tưởng...</p>
                ) : myIdeas.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center mx-auto">
                      <Lightbulb size={24} />
                    </div>
                    <p className="text-xs font-bold text-slate-700">Bạn chưa gửi ý tưởng, sáng kiến nào.</p>
                    <button
                      onClick={() => setIdeasViewMode('submit')}
                      className="px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-bold cursor-pointer"
                    >
                      + Đóng góp ý tưởng đầu tiên
                    </button>
                  </div>
                ) : (
                  myIdeas.map(idea => (
                    <div
                      key={idea.id}
                      className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="inline-block text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-md mb-1">
                            {idea.category}
                          </span>
                          <h4 className="text-sm font-extrabold text-slate-800">{idea.title}</h4>
                        </div>
                        <span
                          className={`text-[10px] font-bold px-2.5 py-1 rounded-full border shrink-0 ${getIdeaStatusBadge(
                            idea.status
                          )}`}
                        >
                          {getIdeaStatusLabel(idea.status)}
                        </span>
                      </div>

                      {idea.problemStatement && (
                        <div className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl">
                          <strong className="text-slate-700">Thực trạng: </strong>
                          {idea.problemStatement}
                        </div>
                      )}

                      <div className="text-xs text-slate-700 whitespace-pre-line leading-relaxed">
                        <strong className="text-slate-800">Giải pháp đề xuất: </strong>
                        {idea.solutionProposal}
                      </div>

                      {idea.expectedImpact && (
                        <div className="text-[11px] text-emerald-800 bg-emerald-50/70 p-2.5 rounded-xl border border-emerald-100">
                          <strong>Hiệu quả dự kiến: </strong>
                          {idea.expectedImpact}
                        </div>
                      )}

                      {idea.adminFeedback && (
                        <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900">
                          <div className="font-extrabold text-[10px] uppercase tracking-wider text-blue-700 mb-0.5">
                            Phản hồi từ BCH Đoàn khoa ĐTVT:
                          </div>
                          {idea.adminFeedback}
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                        <div className="flex items-center gap-3">
                          <span>Ngày gửi: {new Date(idea.createdAt).toLocaleDateString('vi-VN')}</span>
                          <span>• {idea.upvotes || 0} lượt ủng hộ</span>
                          {idea.attachmentLink && (
                            <a
                              href={idea.attachmentLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline font-bold flex items-center gap-1"
                            >
                              <ExternalLink size={12} /> Tài liệu đính kèm
                            </a>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setEditingIdeaId(idea.id);
                              setIdeaTitle(idea.title || '');
                              setIdeaCategory(idea.category || IDEA_CATEGORIES[0]);
                              setIdeaProblem(idea.problemStatement || '');
                              setIdeaSolution(idea.solutionProposal || '');
                              setIdeaImpact(idea.expectedImpact || '');
                              setIdeaAttachment(idea.attachmentLink || '');
                              setIdeaIsPublic(idea.isPublic ?? true);
                              setIdeasViewMode('submit');
                            }}
                            className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Edit3 size={12} /> Sửa
                          </button>
                          <button
                            onClick={() => handleDeleteIdea(idea.id)}
                            className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 size={12} /> Xóa
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {ideasViewMode === 'community' && (
              <div className="space-y-3">
                <div className="bg-white p-3 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Filter size={14} className="text-red-600" /> Lọc theo lĩnh vực sáng kiến:
                  </div>
                  <select
                    value={communityFilterCat}
                    onChange={e => setCommunityFilterCat(e.target.value)}
                    className="text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg font-semibold text-slate-700"
                  >
                    <option value="all">Tất cả lĩnh vực ({ideasList.filter(i => i.isPublic).length})</option>
                    {IDEA_CATEGORIES.map(c => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                {publicIdeas.length === 0 ? (
                  <p className="text-xs text-center text-slate-500 py-8 italic">
                    Chưa có sáng kiến công khai nào trong lĩnh vực này.
                  </p>
                ) : (
                  publicIdeas.map(idea => {
                    const hasUpvoted =
                      Array.isArray(idea.upvotedBy) && currentUser
                        ? idea.upvotedBy.includes(currentUser.uid)
                        : false;
                    return (
                      <div
                        key={idea.id}
                        className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-2.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex flex-wrap items-center gap-1.5 mb-1">
                              <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                                {idea.category}
                              </span>
                              <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                {idea.authorName} • {idea.branch}
                              </span>
                            </div>
                            <h4 className="text-sm font-extrabold text-slate-800">{idea.title}</h4>
                          </div>
                          <span
                            className={`text-[10px] font-bold px-2.5 py-1 rounded-full border shrink-0 ${getIdeaStatusBadge(
                              idea.status
                            )}`}
                          >
                            {getIdeaStatusLabel(idea.status)}
                          </span>
                        </div>

                        <p className="text-xs text-slate-700 whitespace-pre-line leading-relaxed">
                          {idea.solutionProposal}
                        </p>

                        {idea.expectedImpact && (
                          <div className="text-[11px] text-slate-600 bg-slate-50 p-2.5 rounded-xl">
                            <strong className="text-slate-700">Hiệu quả dự kiến: </strong>
                            {idea.expectedImpact}
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                          <span className="text-[10px] text-slate-400">
                            Đăng ngày {new Date(idea.createdAt).toLocaleDateString('vi-VN')}
                          </span>
                          <button
                            onClick={() => handleToggleUpvoteIdea(idea)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                              hasUpvoted
                                ? 'bg-red-600 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-700 hover:bg-red-50 hover:text-red-600'
                            }`}
                          >
                            <ThumbsUp size={13} /> Ủng hộ sáng kiến ({idea.upvotes || 0})
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {ideasViewMode === 'manage' && isAdmin && (
              <div className="space-y-3">
                <div className="bg-indigo-950 text-white p-4 rounded-2xl flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-extrabold uppercase tracking-wider">
                      Quản lý & Phản hồi Ý tưởng, Sáng kiến Đoàn viên
                    </h4>
                    <p className="text-[11px] text-indigo-200 mt-0.5">
                      BCH Đoàn khoa xem xét, công nhận sáng kiến tiêu biểu và gửi phản hồi cho Đoàn viên.
                    </p>
                  </div>
                  <span className="text-sm font-black bg-white/15 px-3 py-1 rounded-xl">
                    {ideasList.length} ý tưởng
                  </span>
                </div>

                {ideasList.map(idea => (
                  <div
                    key={idea.id}
                    className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-[10.5px] font-bold text-slate-500">
                          {idea.authorName} ({idea.mssv || 'Không MSSV'}) •{' '}
                          <span className="text-red-600">{idea.branch}</span> • {idea.email}
                        </div>
                        <h4 className="text-sm font-extrabold text-slate-800 mt-0.5">{idea.title}</h4>
                        <span className="inline-block text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded mt-1">
                          {idea.category}
                        </span>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-full border shrink-0 ${getIdeaStatusBadge(
                          idea.status
                        )}`}
                      >
                        {getIdeaStatusLabel(idea.status)}
                      </span>
                    </div>

                    {idea.problemStatement && (
                      <div className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl">
                        <strong>Thực trạng:</strong> {idea.problemStatement}
                      </div>
                    )}
                    <div className="text-xs text-slate-700 whitespace-pre-line">
                      <strong>Giải pháp:</strong> {idea.solutionProposal}
                    </div>
                    {idea.expectedImpact && (
                      <div className="text-xs text-emerald-800 bg-emerald-50/60 p-2.5 rounded-xl">
                        <strong>Hiệu quả dự kiến:</strong> {idea.expectedImpact}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <div className="text-[11px] text-slate-500">
                        Ủng hộ: <strong>{idea.upvotes || 0}</strong> • Ngày gửi:{' '}
                        {new Date(idea.createdAt).toLocaleDateString('vi-VN')}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setReviewingIdea(idea);
                            setReviewIdeaStatus(idea.status || 'approved');
                            setReviewIdeaFeedback(idea.adminFeedback || '');
                          }}
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold cursor-pointer"
                        >
                          Xét duyệt & Phản hồi
                        </button>
                        <button
                          onClick={() => handleDeleteIdea(idea.id)}
                          className="p-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-xl cursor-pointer"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* =========================================================
            TAB 3: NỘP HỒ SƠ THANH NIÊN TIÊN TIẾN LÀM THEO LỜI BÁC
           ========================================================= */}
        {activeSubTab === 'tntt' && (
          <div className="space-y-4">
            {/* Dynamic Summary Card */}
            <div className="bg-gradient-to-br from-red-900 via-red-800 to-rose-900 text-white rounded-2xl p-4 shadow-md border border-red-700/50">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-white/15">
                <div>
                  <span className="inline-block text-[10px] font-black uppercase tracking-wider bg-amber-400 text-slate-950 px-2.5 py-0.5 rounded-md mb-1">
                    Thông báo số {tnttConfig.docInfo.number} • Ngày {tnttConfig.docInfo.date}
                  </span>
                  <h3 className="text-sm sm:text-base font-extrabold leading-snug">
                    {tnttConfig.docInfo.title}
                  </h3>
                  <p className="text-[11px] text-red-100 mt-0.5">{tnttConfig.docInfo.regulation}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 self-start sm:self-center shrink-0">
                  {isAdmin && (
                    <button
                      onClick={() => {
                        setConfigEditDraft(JSON.parse(JSON.stringify(tnttConfig)));
                        setTnttViewMode('config_editor');
                      }}
                      className="bg-amber-400 text-slate-950 hover:bg-amber-300 px-3 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 shadow-sm cursor-pointer transition"
                    >
                      <Edit3 size={14} /> Sửa nội dung / Tiêu chuẩn năm mới
                    </button>
                  )}
                  <button
                    onClick={() => setShowPdfModal(true)}
                    className="bg-white text-red-800 hover:bg-red-50 px-3 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 shadow-sm cursor-pointer transition"
                  >
                    <Eye size={14} /> Xem Phụ lục PDF
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                {tnttConfig.docInfo.timeline.map((item, idx) => (
                  <div key={idx} className="bg-black/20 rounded-xl p-2.5 border border-white/10">
                    <div className="text-[9.5px] text-red-200 font-medium leading-tight">{item.label}</div>
                    <div className="text-xs font-extrabold text-amber-300 mt-1">{item.time}</div>
                  </div>
                ))}
              </div>
              <p className="text-[10.5px] text-amber-200 font-semibold mt-2.5">
                * Lưu ý: {tnttConfig.docInfo.achievementPeriod}. {tnttConfig.docInfo.generalNote}
              </p>
            </div>

            {/* Sub-navigation for TNTT based on Role */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-white p-2.5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex flex-wrap gap-1.5">
                {/* Đoàn viên & Chi đoàn: Nộp hồ sơ & Xem hồ sơ đã nộp */}
                {!isAdmin && (
                  <>
                    <button
                      onClick={() => setTnttViewMode('form')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                        tnttViewMode === 'form'
                          ? 'bg-red-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      <FileText size={14} />
                      {editingAppId
                        ? 'Chỉnh sửa & Nộp lại minh chứng'
                        : isBranch
                        ? 'Kê khai Hồ sơ Tập thể (Chi đoàn)'
                        : 'Kê khai Hồ sơ Cá nhân (Sinh viên)'}
                    </button>
                    <button
                      onClick={() => setTnttViewMode('my_apps')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                        tnttViewMode === 'my_apps'
                          ? 'bg-red-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      <Clock size={14} />{' '}
                      {isBranch
                        ? `Hồ sơ Tập thể đã nộp (${myTnttApps.length})`
                        : `Hồ sơ Cá nhân đã nộp (${myTnttApps.length})`}
                    </button>
                  </>
                )}

                {/* Đoàn khoa (Admin): Xem hồ sơ đã nộp, minh chứng & Thẩm định + Cấu hình */}
                {isAdmin && (
                  <>
                    <button
                      onClick={() => setTnttViewMode('manage')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                        tnttViewMode === 'manage'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                      }`}
                    >
                      <ShieldCheck size={14} /> Hồ sơ đã nộp & Thẩm định ({tnttList.length})
                    </button>
                    <button
                      onClick={() => {
                        setConfigEditDraft(JSON.parse(JSON.stringify(tnttConfig)));
                        setTnttViewMode('config_editor');
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                        tnttViewMode === 'config_editor'
                          ? 'bg-amber-500 text-slate-950 shadow-xs'
                          : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
                      }`}
                    >
                      <Settings size={14} /> Chỉnh sửa Nội dung & Tiêu chuẩn TNTT
                    </button>
                  </>
                )}

                <button
                  onClick={() => setTnttViewMode('appendix_guide')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                    tnttViewMode === 'appendix_guide'
                      ? 'bg-red-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <BookOpen size={14} /> Tra cứu Phụ lục Minh chứng
                </button>
              </div>

              {isAdmin && tnttList.length > 0 && (
                <button
                  onClick={handleExportTnttCSV}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition"
                >
                  <Download size={13} /> Xuất bảng tổng hợp (Mẫu 1)
                </button>
              )}
            </div>

            {tnttBannerMsg && (
              <div
                className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center justify-between ${
                  tnttBannerMsg.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  {tnttBannerMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  <span>{tnttBannerMsg.text}</span>
                </div>
                <button onClick={() => setTnttBannerMsg(null)} className="text-slate-400 hover:text-slate-600">
                  <X size={14} />
                </button>
              </div>
            )}

            {/* 3.0 ADMIN CONFIG EDITOR FOR TNTT (CHỈNH SỬA NỘI DUNG CHO NĂM MỚI) */}
            {tnttViewMode === 'config_editor' && isAdmin && (
              <div className="bg-white rounded-2xl border border-amber-300 shadow-sm p-5 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <span className="inline-block text-[10px] font-black uppercase bg-amber-100 text-amber-900 px-2.5 py-0.5 rounded mb-1">
                      Quyền Quản trị Đoàn khoa
                    </span>
                    <h4 className="text-sm sm:text-base font-extrabold text-slate-800">
                      Chỉnh sửa Thông báo, Mốc thời gian & Phụ lục Tiêu chuẩn TNTT làm theo lời Bác
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Cập nhật số văn bản, thời gian, điều kiện điểm rèn luyện/GPA, và thêm/sửa/xóa các tiêu chuẩn minh chứng của Cá nhân (Sinh viên) và Tập thể (Chi đoàn) cho năm học mới.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleRestoreDefaultTnttConfig}
                      disabled={savingConfig}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw size={13} /> Khôi phục mặc định (180-TB/ĐTN)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSaveTnttConfig()}
                      disabled={savingConfig}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5 shadow-sm cursor-pointer"
                    >
                      <Save size={14} /> {savingConfig ? 'Đang lưu...' : 'Lưu tất cả thay đổi'}
                    </button>
                  </div>
                </div>

                {/* Sub-sections inside Config Editor */}
                <div className="flex flex-wrap gap-2 bg-slate-100 p-1.5 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setConfigSubSection('general')}
                    className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition cursor-pointer ${
                      configSubSection === 'general'
                        ? 'bg-white text-red-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    1. Thông tin Thông báo, Thời gian & Điểm sàn
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfigSubSection('individual')}
                    className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition cursor-pointer ${
                      configSubSection === 'individual'
                        ? 'bg-white text-red-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    2. Tiêu chuẩn Cá nhân - Sinh viên ({configEditDraft.individualGroups.length} nhóm)
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfigSubSection('collective')}
                    className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition cursor-pointer ${
                      configSubSection === 'collective'
                        ? 'bg-white text-red-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    3. Tiêu chuẩn Tập thể - Chi đoàn ({configEditDraft.collectiveCriteria.length} mục)
                  </button>
                </div>

                {/* SECTION A: GENERAL NOTIFICATION & THRESHOLDS */}
                {configSubSection === 'general' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-2">
                        <label className="text-xs font-bold text-slate-700 block mb-1">Tiêu đề đợt xét chọn</label>
                        <input
                          type="text"
                          value={configEditDraft.docInfo.title}
                          onChange={e =>
                            setConfigEditDraft(prev => ({
                              ...prev,
                              docInfo: { ...prev.docInfo, title: e.target.value },
                            }))
                          }
                          className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">Số văn bản thông báo</label>
                        <input
                          type="text"
                          placeholder="VD: 180-TB/ĐTN"
                          value={configEditDraft.docInfo.number}
                          onChange={e =>
                            setConfigEditDraft(prev => ({
                              ...prev,
                              docInfo: { ...prev.docInfo, number: e.target.value },
                            }))
                          }
                          className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">Ngày ban hành</label>
                        <input
                          type="text"
                          placeholder="VD: 25/12/2026"
                          value={configEditDraft.docInfo.date}
                          onChange={e =>
                            setConfigEditDraft(prev => ({
                              ...prev,
                              docInfo: { ...prev.docInfo, date: e.target.value },
                            }))
                          }
                          className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="text-xs font-bold text-slate-700 block mb-1">Căn cứ Quyết định / Quy chế</label>
                        <input
                          type="text"
                          value={configEditDraft.docInfo.regulation}
                          onChange={e =>
                            setConfigEditDraft(prev => ({
                              ...prev,
                              docInfo: { ...prev.docInfo, regulation: e.target.value },
                            }))
                          }
                          className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800"
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <label className="text-xs font-bold text-slate-700 block mb-1">
                          Thời gian tính thành tích xét trao
                        </label>
                        <input
                          type="text"
                          value={configEditDraft.docInfo.achievementPeriod}
                          onChange={e =>
                            setConfigEditDraft(prev => ({
                              ...prev,
                              docInfo: { ...prev.docInfo, achievementPeriod: e.target.value },
                            }))
                          }
                          className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800"
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <label className="text-xs font-bold text-slate-700 block mb-1">
                          Link file PDF Thông báo & Phụ lục (URL Google Drive hoặc đường dẫn file)
                        </label>
                        <input
                          type="text"
                          value={configEditDraft.docInfo.pdfUrl}
                          onChange={e =>
                            setConfigEditDraft(prev => ({
                              ...prev,
                              docInfo: { ...prev.docInfo, pdfUrl: e.target.value },
                            }))
                          }
                          className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800"
                        />
                      </div>
                    </div>

                    {/* Numeric Thresholds */}
                    <div className="p-4 bg-amber-50/60 border border-amber-200 rounded-2xl space-y-3">
                      <h5 className="text-xs font-extrabold text-amber-950 uppercase">
                        Cấu hình điều kiện Điểm sàn Sinh viên & Giới hạn số chữ (Tiêu chuẩn chung)
                      </h5>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div>
                          <label className="text-[11px] font-bold text-slate-700 block mb-1">
                            Điểm rèn luyện tối thiểu
                          </label>
                          <input
                            type="number"
                            value={configEditDraft.docInfo.minDrlScore}
                            onChange={e =>
                              setConfigEditDraft(prev => ({
                                ...prev,
                                docInfo: { ...prev.docInfo, minDrlScore: Number(e.target.value) || 0 },
                              }))
                            }
                            className="w-full text-xs p-2 bg-white border border-slate-300 rounded-lg font-bold"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-slate-700 block mb-1">
                            GPA tối thiểu (Cấp Trường)
                          </label>
                          <input
                            type="number"
                            step="0.1"
                            value={configEditDraft.docInfo.minGpaTruong}
                            onChange={e =>
                              setConfigEditDraft(prev => ({
                                ...prev,
                                docInfo: { ...prev.docInfo, minGpaTruong: Number(e.target.value) || 0 },
                              }))
                            }
                            className="w-full text-xs p-2 bg-white border border-slate-300 rounded-lg font-bold"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-slate-700 block mb-1">
                            GPA tối thiểu (Hệ Tiêu biểu)
                          </label>
                          <input
                            type="number"
                            step="0.1"
                            value={configEditDraft.docInfo.minGpaTieuBieu}
                            onChange={e =>
                              setConfigEditDraft(prev => ({
                                ...prev,
                                docInfo: { ...prev.docInfo, minGpaTieuBieu: Number(e.target.value) || 0 },
                              }))
                            }
                            className="w-full text-xs p-2 bg-white border border-slate-300 rounded-lg font-bold"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-slate-700 block mb-1">
                            Số chữ tối đa Phần việc lời Bác
                          </label>
                          <input
                            type="number"
                            value={configEditDraft.docInfo.maxWordsUncleHoWork}
                            onChange={e =>
                              setConfigEditDraft(prev => ({
                                ...prev,
                                docInfo: { ...prev.docInfo, maxWordsUncleHoWork: Number(e.target.value) || 100 },
                              }))
                            }
                            className="w-full text-xs p-2 bg-white border border-slate-300 rounded-lg font-bold"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Timeline Milestones Editor */}
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-extrabold text-slate-800">
                          Các mốc thời gian xét chọn hiển thị trên Banner
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setConfigEditDraft(prev => ({
                              ...prev,
                              docInfo: {
                                ...prev.docInfo,
                                timeline: [
                                  ...prev.docInfo.timeline,
                                  { label: 'Mốc thời gian mới', time: 'Đang cập nhật' },
                                ],
                              },
                            }))
                          }
                          className="text-xs font-bold text-red-600 hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <Plus size={13} /> Thêm mốc thời gian
                        </button>
                      </div>
                      {configEditDraft.docInfo.timeline.map((milestone, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input
                            type="text"
                            placeholder="Tên mốc (VD: Hạn nộp hồ sơ)"
                            value={milestone.label}
                            onChange={e => {
                              const newTimeline = [...configEditDraft.docInfo.timeline];
                              newTimeline[idx] = { ...newTimeline[idx], label: e.target.value };
                              setConfigEditDraft(prev => ({
                                ...prev,
                                docInfo: { ...prev.docInfo, timeline: newTimeline },
                              }));
                            }}
                            className="flex-1 text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                          />
                          <input
                            type="text"
                            placeholder="Thời gian (VD: Đến hết 25/01/2027)"
                            value={milestone.time}
                            onChange={e => {
                              const newTimeline = [...configEditDraft.docInfo.timeline];
                              newTimeline[idx] = { ...newTimeline[idx], time: e.target.value };
                              setConfigEditDraft(prev => ({
                                ...prev,
                                docInfo: { ...prev.docInfo, timeline: newTimeline },
                              }));
                            }}
                            className="w-48 text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const newTimeline = configEditDraft.docInfo.timeline.filter((_, i) => i !== idx);
                              setConfigEditDraft(prev => ({
                                ...prev,
                                docInfo: { ...prev.docInfo, timeline: newTimeline },
                              }));
                            }}
                            className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* SECTION B: INDIVIDUAL CATEGORY GROUPS & CRITERIA EDITOR */}
                {configSubSection === 'individual' && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-600">
                        Chọn Lĩnh vực / Đối tượng Cá nhân (Sinh viên) bên dưới để chỉnh sửa các tiêu chuẩn & yêu cầu minh chứng:
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const newId = `linhvuc_${Date.now()}`;
                          const newGroup: CategoryCriteriaGroup = {
                            id: newId,
                            name: 'Lĩnh vực / Đối tượng mới',
                            shortName: 'Lĩnh vực mới',
                            badge: '⭐',
                            note: 'Ghi chú điều kiện đạt của lĩnh vực này...',
                            criteria: [
                              {
                                id: `tc_${Date.now()}`,
                                code: 'TC 1',
                                content: 'Nội dung tiêu chuẩn mới...',
                                evidenceRequirement: 'File scan PDF quyết định / giấy chứng nhận...',
                                requiresText: true,
                                requiresFileLink: true,
                              },
                            ],
                          };
                          setConfigEditDraft(prev => {
                            const nextGroups = [...prev.individualGroups, newGroup];
                            setEditingGroupIdx(nextGroups.length - 1);
                            return { ...prev, individualGroups: nextGroups };
                          });
                        }}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Plus size={13} /> Thêm Lĩnh vực / Đối tượng mới
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {configEditDraft.individualGroups.map((g, idx) => (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => setEditingGroupIdx(idx)}
                          className={`px-3 py-2 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center gap-1.5 ${
                            editingGroupIdx === idx
                              ? 'border-red-600 bg-red-600 text-white shadow-xs'
                              : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <span>{g.badge}</span>
                          <span>{g.shortName}</span>
                          <span className="text-[10px] opacity-80">({g.criteria.length})</span>
                        </button>
                      ))}
                    </div>

                    {configEditDraft.individualGroups[editingGroupIdx] && (
                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                          <h5 className="text-xs font-extrabold text-slate-800 uppercase">
                            Thông tin Nhóm lĩnh vực #{editingGroupIdx + 1}
                          </h5>
                          {configEditDraft.individualGroups.length > 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                setConfigEditDraft(prev => ({
                                  ...prev,
                                  individualGroups: prev.individualGroups.filter((_, i) => i !== editingGroupIdx),
                                }));
                                setEditingGroupIdx(0);
                              }}
                              className="text-xs font-bold text-rose-600 hover:underline flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 size={13} /> Xóa nhóm lĩnh vực này
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
                          <div>
                            <label className="text-[11px] font-bold text-slate-600 block mb-1">Biểu tượng</label>
                            <input
                              type="text"
                              value={configEditDraft.individualGroups[editingGroupIdx].badge}
                              onChange={e => {
                                const groups = [...configEditDraft.individualGroups];
                                groups[editingGroupIdx] = { ...groups[editingGroupIdx], badge: e.target.value };
                                setConfigEditDraft(prev => ({ ...prev, individualGroups: groups }));
                              }}
                              className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg text-center"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="text-[11px] font-bold text-slate-600 block mb-1">Tên nút ngắn gọn</label>
                            <input
                              type="text"
                              value={configEditDraft.individualGroups[editingGroupIdx].shortName}
                              onChange={e => {
                                const groups = [...configEditDraft.individualGroups];
                                groups[editingGroupIdx] = { ...groups[editingGroupIdx], shortName: e.target.value };
                                setConfigEditDraft(prev => ({ ...prev, individualGroups: groups }));
                              }}
                              className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg font-bold"
                            />
                          </div>
                          <div className="sm:col-span-3">
                            <label className="text-[11px] font-bold text-slate-600 block mb-1">
                              Tên đầy đủ của Lĩnh vực / Đối tượng
                            </label>
                            <input
                              type="text"
                              value={configEditDraft.individualGroups[editingGroupIdx].name}
                              onChange={e => {
                                const groups = [...configEditDraft.individualGroups];
                                groups[editingGroupIdx] = { ...groups[editingGroupIdx], name: e.target.value };
                                setConfigEditDraft(prev => ({ ...prev, individualGroups: groups }));
                              }}
                              className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg font-bold"
                            />
                          </div>
                          <div className="sm:col-span-6">
                            <label className="text-[11px] font-bold text-slate-600 block mb-1">
                              Ghi chú hướng dẫn của Lĩnh vực
                            </label>
                            <input
                              type="text"
                              value={configEditDraft.individualGroups[editingGroupIdx].note}
                              onChange={e => {
                                const groups = [...configEditDraft.individualGroups];
                                groups[editingGroupIdx] = { ...groups[editingGroupIdx], note: e.target.value };
                                setConfigEditDraft(prev => ({ ...prev, individualGroups: groups }));
                              }}
                              className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg"
                            />
                          </div>
                        </div>

                        <div className="space-y-3 pt-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-extrabold text-slate-800">
                              Danh sách các Tiêu chuẩn trong nhóm ({configEditDraft.individualGroups[editingGroupIdx].criteria.length})
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const groups = [...configEditDraft.individualGroups];
                                const currentCriteria = groups[editingGroupIdx].criteria;
                                const nextNum = currentCriteria.length + 1;
                                groups[editingGroupIdx] = {
                                  ...groups[editingGroupIdx],
                                  criteria: [
                                    ...currentCriteria,
                                    {
                                      id: `${groups[editingGroupIdx].id}_tc_${Date.now()}`,
                                      code: `TC ${nextNum}`,
                                      content: 'Nhập nội dung tiêu chuẩn...',
                                      evidenceRequirement: 'Nhập yêu cầu minh chứng...',
                                      requiresText: true,
                                      requiresFileLink: true,
                                    },
                                  ],
                                };
                                setConfigEditDraft(prev => ({ ...prev, individualGroups: groups }));
                              }}
                              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <Plus size={13} /> Thêm Tiêu chuẩn mới
                            </button>
                          </div>

                          {configEditDraft.individualGroups[editingGroupIdx].criteria.map((crit, cIdx) => (
                            <div
                              key={crit.id}
                              className="p-3.5 bg-white rounded-xl border border-slate-200 space-y-2.5 shadow-2xs"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    value={crit.code}
                                    onChange={e => {
                                      const groups = [...configEditDraft.individualGroups];
                                      const list = [...groups[editingGroupIdx].criteria];
                                      list[cIdx] = { ...list[cIdx], code: e.target.value };
                                      groups[editingGroupIdx] = { ...groups[editingGroupIdx], criteria: list };
                                      setConfigEditDraft(prev => ({ ...prev, individualGroups: groups }));
                                    }}
                                    className="w-24 text-xs p-1.5 bg-red-50 border border-red-200 rounded-lg font-extrabold text-red-700 text-center"
                                  />
                                  <span className="text-[11px] font-bold text-slate-400">Mã tiêu chuẩn</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const groups = [...configEditDraft.individualGroups];
                                    const list = groups[editingGroupIdx].criteria.filter((_, i) => i !== cIdx);
                                    groups[editingGroupIdx] = { ...groups[editingGroupIdx], criteria: list };
                                    setConfigEditDraft(prev => ({ ...prev, individualGroups: groups }));
                                  }}
                                  className="text-xs font-bold text-rose-600 hover:bg-rose-50 px-2 py-1 rounded-lg flex items-center gap-1 cursor-pointer"
                                >
                                  <Trash2 size={13} /> Xóa
                                </button>
                              </div>

                              <div>
                                <label className="text-[11px] font-bold text-slate-600 block mb-1">
                                  Nội dung tiêu chuẩn
                                </label>
                                <textarea
                                  rows={2}
                                  value={crit.content}
                                  onChange={e => {
                                    const groups = [...configEditDraft.individualGroups];
                                    const list = [...groups[editingGroupIdx].criteria];
                                    list[cIdx] = { ...list[cIdx], content: e.target.value };
                                    groups[editingGroupIdx] = { ...groups[editingGroupIdx], criteria: list };
                                    setConfigEditDraft(prev => ({ ...prev, individualGroups: groups }));
                                  }}
                                  className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg"
                                />
                              </div>

                              <div>
                                <label className="text-[11px] font-bold text-slate-600 block mb-1">
                                  Yêu cầu minh chứng (hiển thị hướng dẫn cho Đoàn viên)
                                </label>
                                <textarea
                                  rows={2}
                                  value={crit.evidenceRequirement}
                                  onChange={e => {
                                    const groups = [...configEditDraft.individualGroups];
                                    const list = [...groups[editingGroupIdx].criteria];
                                    list[cIdx] = { ...list[cIdx], evidenceRequirement: e.target.value };
                                    groups[editingGroupIdx] = { ...groups[editingGroupIdx], criteria: list };
                                    setConfigEditDraft(prev => ({ ...prev, individualGroups: groups }));
                                  }}
                                  className="w-full text-xs p-2 bg-blue-50/40 border border-blue-200 rounded-lg"
                                />
                              </div>

                              <div className="flex flex-wrap items-center gap-4 pt-1 text-xs">
                                <label className="flex items-center gap-1.5 font-semibold text-slate-700 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={crit.requiresText ?? true}
                                    onChange={e => {
                                      const groups = [...configEditDraft.individualGroups];
                                      const list = [...groups[editingGroupIdx].criteria];
                                      list[cIdx] = { ...list[cIdx], requiresText: e.target.checked };
                                      groups[editingGroupIdx] = { ...groups[editingGroupIdx], criteria: list };
                                      setConfigEditDraft(prev => ({ ...prev, individualGroups: groups }));
                                    }}
                                    className="accent-red-600"
                                  />
                                  Cho phép khai văn bản
                                </label>

                                <div className="flex items-center gap-1.5">
                                  <span className="text-[11px] text-slate-600 font-semibold">Giới hạn số chữ:</span>
                                  <input
                                    type="number"
                                    placeholder="Không GH"
                                    value={crit.maxWords || ''}
                                    onChange={e => {
                                      const val = e.target.value ? Number(e.target.value) : undefined;
                                      const groups = [...configEditDraft.individualGroups];
                                      const list = [...groups[editingGroupIdx].criteria];
                                      list[cIdx] = { ...list[cIdx], maxWords: val };
                                      groups[editingGroupIdx] = { ...groups[editingGroupIdx], criteria: list };
                                      setConfigEditDraft(prev => ({ ...prev, individualGroups: groups }));
                                    }}
                                    className="w-20 text-xs p-1 bg-slate-50 border border-slate-200 rounded text-center font-bold"
                                  />
                                </div>

                                <label className="flex items-center gap-1.5 font-semibold text-slate-700 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={crit.requiresFileLink ?? false}
                                    onChange={e => {
                                      const groups = [...configEditDraft.individualGroups];
                                      const list = [...groups[editingGroupIdx].criteria];
                                      list[cIdx] = { ...list[cIdx], requiresFileLink: e.target.checked };
                                      groups[editingGroupIdx] = { ...groups[editingGroupIdx], criteria: list };
                                      setConfigEditDraft(prev => ({ ...prev, individualGroups: groups }));
                                    }}
                                    className="accent-red-600"
                                  />
                                  Yêu cầu đính kèm Link PDF minh chứng
                                </label>

                                <label className="flex items-center gap-1.5 font-semibold text-amber-800 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={crit.highlightNote ?? false}
                                    onChange={e => {
                                      const groups = [...configEditDraft.individualGroups];
                                      const list = [...groups[editingGroupIdx].criteria];
                                      list[cIdx] = { ...list[cIdx], highlightNote: e.target.checked };
                                      groups[editingGroupIdx] = { ...groups[editingGroupIdx], criteria: list };
                                      setConfigEditDraft(prev => ({ ...prev, individualGroups: groups }));
                                    }}
                                    className="accent-amber-600"
                                  />
                                  Nhắc tô vàng tên cá nhân
                                </label>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* SECTION C: COLLECTIVE CRITERIA EDITOR */}
                {configSubSection === 'collective' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-slate-800">
                        Danh sách Tiêu chuẩn Tập thể - Dành cho Chi đoàn ({configEditDraft.collectiveCriteria.length})
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setConfigEditDraft(prev => ({
                            ...prev,
                            collectiveCriteria: [
                              ...prev.collectiveCriteria,
                              {
                                id: `tt_custom_${Date.now()}`,
                                code: `TC ${prev.collectiveCriteria.length + 1}`,
                                content: 'Nội dung tiêu chuẩn tập thể mới...',
                                evidenceRequirement: 'Khai hồ sơ không quá 100 chữ...',
                                requiresText: true,
                                maxWords: 100,
                                requiresFileLink: false,
                              },
                            ],
                          }));
                        }}
                        className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Plus size={13} /> Thêm Tiêu chuẩn Tập thể
                      </button>
                    </div>

                    {configEditDraft.collectiveCriteria.map((crit, cIdx) => (
                      <div
                        key={crit.id}
                        className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <input
                            type="text"
                            value={crit.code}
                            onChange={e => {
                              const list = [...configEditDraft.collectiveCriteria];
                              list[cIdx] = { ...list[cIdx], code: e.target.value };
                              setConfigEditDraft(prev => ({ ...prev, collectiveCriteria: list }));
                            }}
                            className="w-28 text-xs p-1.5 bg-white border border-red-200 rounded-lg font-extrabold text-red-700 text-center"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const list = configEditDraft.collectiveCriteria.filter((_, i) => i !== cIdx);
                              setConfigEditDraft(prev => ({ ...prev, collectiveCriteria: list }));
                            }}
                            className="text-xs font-bold text-rose-600 hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 size={13} /> Xóa
                          </button>
                        </div>

                        <textarea
                          rows={2}
                          value={crit.content}
                          onChange={e => {
                            const list = [...configEditDraft.collectiveCriteria];
                            list[cIdx] = { ...list[cIdx], content: e.target.value };
                            setConfigEditDraft(prev => ({ ...prev, collectiveCriteria: list }));
                          }}
                          className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg"
                        />

                        <input
                          type="text"
                          value={crit.evidenceRequirement}
                          onChange={e => {
                            const list = [...configEditDraft.collectiveCriteria];
                            list[cIdx] = { ...list[cIdx], evidenceRequirement: e.target.value };
                            setConfigEditDraft(prev => ({ ...prev, collectiveCriteria: list }));
                          }}
                          className="w-full text-xs p-2 bg-blue-50/50 border border-blue-200 rounded-lg"
                        />

                        <div className="flex flex-wrap items-center gap-4 text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-semibold text-slate-600">Giới hạn chữ:</span>
                            <input
                              type="number"
                              placeholder="Không GH"
                              value={crit.maxWords || ''}
                              onChange={e => {
                                const val = e.target.value ? Number(e.target.value) : undefined;
                                const list = [...configEditDraft.collectiveCriteria];
                                list[cIdx] = { ...list[cIdx], maxWords: val };
                                setConfigEditDraft(prev => ({ ...prev, collectiveCriteria: list }));
                              }}
                              className="w-20 text-xs p-1 bg-white border border-slate-200 rounded text-center font-bold"
                            />
                          </div>
                          <label className="flex items-center gap-1.5 font-semibold text-slate-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={crit.requiresFileLink ?? false}
                              onChange={e => {
                                const list = [...configEditDraft.collectiveCriteria];
                                list[cIdx] = { ...list[cIdx], requiresFileLink: e.target.checked };
                                setConfigEditDraft(prev => ({ ...prev, collectiveCriteria: list }));
                              }}
                              className="accent-red-600"
                            />
                            Yêu cầu đính kèm Link PDF minh chứng
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="pt-3 border-t border-slate-100 flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleSaveTnttConfig()}
                    disabled={savingConfig}
                    className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-extrabold flex items-center gap-2 shadow-md cursor-pointer"
                  >
                    <Save size={15} /> {savingConfig ? 'Đang lưu cấu hình...' : 'Lưu cấu hình TNTT làm theo lời Bác'}
                  </button>
                </div>
              </div>
            )}

            {/* 3.1 APPLICATION SUBMISSION FORM (ĐOÀN VIÊN: CÁ NHÂN SINH VIÊN | CHI ĐOÀN: TẬP THỂ) */}
            {tnttViewMode === 'form' && !isAdmin && (
              <form onSubmit={handleSubmitTnttApplication} className="space-y-4">
                {/* Warning banner if editing an already-reviewed application */}
                {editingAppId && editingAppPriorStatus && editingAppPriorStatus !== 'pending' && (
                  <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl flex items-start gap-3 text-xs text-amber-950 shadow-xs">
                    <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-extrabold uppercase tracking-wide text-amber-900">
                        Lưu ý quan trọng khi chỉnh sửa & nộp lại minh chứng:
                      </div>
                      <p className="mt-0.5 leading-relaxed">
                        Hồ sơ này đã được Đoàn khoa thẩm định trước đó (Trạng thái hiện tại:{' '}
                        <strong>{getTnttStatusLabel(editingAppPriorStatus)}</strong>). Khi bạn lưu chỉnh sửa hoặc nộp lại minh chứng mới,{' '}
                        <strong className="text-red-700">
                          kết quả thẩm định trước đó sẽ tự động bị hủy
                        </strong>{' '}
                        và hồ sơ sẽ chuyển về trạng thái <strong>"Chờ Đoàn khoa thẩm định"</strong>.
                      </p>
                    </div>
                  </div>
                )}

                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div>
                      <h4 className="text-sm font-extrabold text-slate-800">
                        {isBranch
                          ? '1. Thông tin Tập thể Chi đoàn đăng ký xét chọn'
                          : '1. Thông tin Đoàn viên (Sinh viên) đăng ký xét chọn'}
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        {isBranch
                          ? 'Tài khoản Chi đoàn nộp hồ sơ với tư cách Tập thể ("Tập thể tiên tiến làm theo lời Bác")'
                          : 'Tài khoản Đoàn viên nộp hồ sơ theo diện Cá nhân là Sinh viên ("Thanh niên tiên tiến làm theo lời Bác")'}
                      </p>
                    </div>
                    {editingAppId && (
                      <button
                        type="button"
                        onClick={handleResetTnttForm}
                        className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-xl cursor-pointer"
                      >
                        Hủy chỉnh sửa
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Locked Role Badge */}
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1.5">
                        Tư cách đăng ký hồ sơ (Theo phân quyền tài khoản)
                      </label>
                      {isBranch ? (
                        <div className="p-3 rounded-xl border border-red-600 bg-red-50/70 text-red-900">
                          <div className="text-xs font-extrabold">🏛️ Diện Tập thể (Chi đoàn)</div>
                          <div className="text-[10.5px] opacity-90 mt-0.5">
                            Danh hiệu “Tập thể tiên tiến làm theo lời Bác”
                          </div>
                        </div>
                      ) : (
                        <div className="p-3 rounded-xl border border-red-600 bg-red-50/70 text-red-900">
                          <div className="text-xs font-extrabold">👤 Diện Cá nhân — Sinh viên</div>
                          <div className="text-[10.5px] opacity-90 mt-0.5">
                            Danh hiệu “Thanh niên tiên tiến làm theo lời Bác”
                          </div>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1.5">Cấp độ xét chọn</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setAwardLevel('truong')}
                          className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                            awardLevel === 'truong'
                              ? 'border-red-600 bg-red-50/70 text-red-900 font-bold'
                              : 'border-slate-200 bg-slate-50 text-slate-600'
                          }`}
                        >
                          <div className="text-xs font-extrabold">⭐ Cấp Trường</div>
                          <div className="text-[10px] opacity-80 mt-0.5">Đạt tiêu chuẩn chung & tiêu chuẩn riêng</div>
                        </button>
                        <button
                          type="button"
                          onClick={() => setAwardLevel('tieubieu')}
                          className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                            awardLevel === 'tieubieu'
                              ? 'border-amber-500 bg-amber-50 text-amber-950 font-bold'
                              : 'border-slate-200 bg-slate-50 text-slate-600'
                          }`}
                        >
                          <div className="text-xs font-extrabold">🏆 Tiêu biểu Cấp Trường</div>
                          <div className="text-[10px] opacity-80 mt-0.5">Đề xuất tuyên dương điển hình tiêu biểu</div>
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 block mb-1">
                        {isBranch ? 'Tên Tập thể Chi đoàn *' : 'Họ và tên sinh viên *'}
                      </label>
                      <input
                        type="text"
                        required
                        value={fullName}
                        onChange={e => setFullName(e.target.value)}
                        className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800"
                      />
                    </div>
                    {!isBranch && (
                      <div>
                        <label className="text-[11px] font-bold text-slate-600 block mb-1">
                          Mã số sinh viên (MSSV) <span className="text-red-600">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={mssv}
                          onChange={e => setMssv(e.target.value)}
                          className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800"
                        />
                      </div>
                    )}
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 block mb-1">
                        Chi đoàn <span className="text-red-600">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={branch}
                        onChange={e => setBranch(e.target.value)}
                        className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 block mb-1">Email liên hệ</label>
                      <input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 block mb-1">Số điện thoại liên hệ *</label>
                      <input
                        type="tel"
                        required
                        placeholder="Nhập SĐT Zalo liên hệ khi thẩm định..."
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800"
                      />
                    </div>
                  </div>
                </div>

                {/* Step 2: TIÊU CHUẨN CHUNG & MINH CHỨNG BẮT BUỘC */}
                {!isBranch ? (
                  /* ĐOÀN VIÊN - SINH VIÊN */
                  <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
                    <div className="border-b border-slate-100 pb-3">
                      <h4 className="text-sm font-extrabold text-slate-800">
                        2. Tiêu chuẩn chung & Yêu cầu minh chứng bắt buộc (Sinh viên)
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Theo Mục 1 - Tiêu chuẩn chung (Đối với Sinh viên) tại Phụ lục Thông báo số{' '}
                        {tnttConfig.docInfo.number}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                        <div className="text-[11px] font-extrabold text-slate-800">
                          TT 1. Được BCH Đoàn cơ sở giới thiệu xét trao
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          • Yêu cầu minh chứng: Căn cứ công văn giới thiệu của Đoàn khoa (Không cần cá nhân nộp file).
                        </p>
                      </div>

                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                        <label className="text-[11px] font-extrabold text-slate-800 block mb-1">
                          TT 2. Kết quả phân tích chất lượng Đoàn viên năm học gần nhất
                        </label>
                        <select
                          value={unionRating}
                          onChange={e => setUnionRating(e.target.value)}
                          className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg font-semibold text-slate-800"
                        >
                          <option value="Hoàn thành xuất sắc nhiệm vụ">Hoàn thành Xuất sắc nhiệm vụ</option>
                          <option value="Hoàn thành tốt nhiệm vụ">Hoàn thành Tốt nhiệm vụ</option>
                          <option value="Thanh niên (Chưa là Đoàn viên)">Thanh niên (Chưa là Đoàn viên)</option>
                        </select>
                        <p className="text-[9.5px] text-slate-500 mt-1">
                          Căn cứ Quyết định xếp loại Đoàn viên (Đạt loại Hoàn thành Tốt nhiệm vụ trở lên).
                        </p>
                      </div>
                    </div>

                    <div className="p-3.5 bg-amber-50/50 rounded-xl border border-amber-200">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-extrabold text-slate-800">
                          TT 3. Phần việc thiết thực, hiệu quả, sáng tạo học tập và làm theo lời Bác{' '}
                          <span className="text-red-600">*</span>
                        </label>
                        <span
                          className={`text-[10.5px] font-extrabold px-2 py-0.5 rounded-full ${
                            practiceWorkWordCount > maxPracticeWords
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {practiceWorkWordCount} / {maxPracticeWords} chữ
                        </span>
                      </div>
                      <p className="text-[10.5px] text-slate-600 mb-2">
                        • Nội dung: Có ít nhất một phần việc làm thiết thực, hiệu quả, sáng tạo học tập và làm theo tư tưởng, đạo đức, phong cách Hồ Chí Minh trong công tác hoặc học tập được tập thể Đoàn viên, thanh niên tại đơn vị công nhận.{' '}
                        <strong className="text-red-700">
                          Yêu cầu: Khai hồ sơ không quá {maxPracticeWords} chữ (Không cần minh chứng).
                        </strong>
                      </p>
                      <textarea
                        rows={3}
                        required
                        placeholder={`Khai ngắn gọn phần việc làm theo lời Bác của bản thân (tối đa ${maxPracticeWords} chữ)...`}
                        value={uncleHoPracticeWork}
                        onChange={e => setUncleHoPracticeWork(e.target.value)}
                        className="w-full text-xs p-3 bg-white border border-amber-300 rounded-xl focus:outline-none focus:border-red-500 text-slate-800"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="p-3.5 bg-blue-50/40 rounded-xl border border-blue-200/80 space-y-2">
                        <div className="text-xs font-extrabold text-blue-950">
                          Mục 1.1. Điểm rèn luyện năm học gần nhất (≥ {tnttConfig.docInfo.minDrlScore} điểm) *
                        </div>
                        <p className="text-[10px] text-slate-600">
                          Yêu cầu minh chứng:{' '}
                          <strong>File scan PDF kết quả điểm rèn luyện có xác nhận của phòng Công tác Sinh viên.</strong>
                        </p>
                        <input
                          type="number"
                          step="0.1"
                          required
                          placeholder="Nhập điểm rèn luyện (VD: 92)"
                          value={drlScore}
                          onChange={e => setDrlScore(e.target.value)}
                          className="w-full text-xs p-2.5 bg-white border border-slate-200 rounded-lg font-bold text-slate-800"
                        />
                        <input
                          type="url"
                          required
                          placeholder="Link File scan PDF kết quả ĐRL (có xác nhận P.CTSV)..."
                          value={drlEvidenceLink}
                          onChange={e => setDrlEvidenceLink(e.target.value)}
                          className="w-full text-xs p-2.5 bg-white border border-slate-200 rounded-lg text-slate-800"
                        />
                      </div>

                      <div className="p-3.5 bg-blue-50/40 rounded-xl border border-blue-200/80 space-y-2">
                        <div className="text-xs font-extrabold text-blue-950">
                          Mục 1.2. Điểm trung bình tích lũy tính đến HK gần nhất (≥{' '}
                          {awardLevel === 'tieubieu' && primaryCategory === 'hoctap_nckh'
                            ? tnttConfig.docInfo.minGpaTieuBieu
                            : tnttConfig.docInfo.minGpaTruong}
                          ) *
                        </div>
                        <p className="text-[10px] text-slate-600">
                          Yêu cầu minh chứng:{' '}
                          <strong>File scan PDF bảng điểm có xác nhận của phòng Đào tạo.</strong>
                        </p>
                        <input
                          type="number"
                          step="0.01"
                          required
                          placeholder="Nhập ĐTB tích lũy thang 10 (VD: 8.15)"
                          value={gpaScore}
                          onChange={e => setGpaScore(e.target.value)}
                          className="w-full text-xs p-2.5 bg-white border border-slate-200 rounded-lg font-bold text-slate-800"
                        />
                        <input
                          type="url"
                          required
                          placeholder="Link File scan PDF bảng điểm (có xác nhận P.Đào tạo)..."
                          value={gpaEvidenceLink}
                          onChange={e => setGpaEvidenceLink(e.target.value)}
                          className="w-full text-xs p-2.5 bg-white border border-slate-200 rounded-lg text-slate-800"
                        />
                        {awardLevel === 'tieubieu' && primaryCategory === 'hoctap_nckh' && (
                          <label className="flex items-center gap-2 text-[10.5px] font-semibold text-blue-900 pt-1">
                            <input
                              type="checkbox"
                              checked={enoughCreditsConfirm}
                              onChange={e => setEnoughCreditsConfirm(e.target.checked)}
                              className="accent-red-600"
                            />
                            Cam kết tích lũy đủ tín chỉ theo tiến độ đăng ký môn học
                          </label>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* CHI ĐOÀN - TIÊU CHUẨN CHUNG TẬP THỂ */
                  <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
                    <h4 className="text-sm font-extrabold text-slate-800">
                      2. Tiêu chuẩn chung Danh hiệu "Tập thể tiên tiến làm theo lời Bác" (Dành cho Chi đoàn)
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">
                          Kết quả phân tích chất lượng tổ chức Đoàn năm học gần nhất
                        </label>
                        <select
                          value={collectiveOrgRating}
                          onChange={e => setCollectiveOrgRating(e.target.value)}
                          className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold"
                        >
                          <option value="Hoàn thành xuất sắc nhiệm vụ">Hoàn thành Xuất sắc nhiệm vụ</option>
                          <option value="Hoàn thành tốt nhiệm vụ">Hoàn thành Tốt nhiệm vụ</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">
                          Thành tích khen thưởng công tác Đoàn năm học gần nhất
                        </label>
                        <input
                          type="text"
                          value={collectiveAwardConfirm}
                          onChange={e => setCollectiveAwardConfirm(e.target.value)}
                          placeholder="VD: Giấy khen của BCH Đoàn trường..."
                          className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 3: TIÊU CHUẨN RIÊNG THEO PHỤ LỤC */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
                  <div className="border-b border-slate-100 pb-3">
                    <h4 className="text-sm font-extrabold text-slate-800">
                      3. Kê khai Tiêu chuẩn & Đính kèm minh chứng theo Phụ lục
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      {!isBranch
                        ? 'Chọn lĩnh vực / đối tượng xét trao chính và tích chọn các tiêu chuẩn đạt được để khai thông tin & đính kèm link file scan PDF minh chứng.'
                        : 'Tích chọn và kê khai các tiêu chuẩn của Tập thể Chi đoàn theo đúng Phụ lục.'}
                    </p>
                  </div>

                  {!isBranch && (
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-2">
                        Chọn Lĩnh vực / Đối tượng xét chọn chính:
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                        {tnttConfig.individualGroups.map(group => (
                          <button
                            key={group.id}
                            type="button"
                            onClick={() => setPrimaryCategory(group.id)}
                            className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                              primaryCategory === group.id
                                ? 'border-red-600 bg-red-600 text-white shadow-xs'
                                : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            <span className="text-base">{group.badge}</span>
                            <span className="text-[11px] font-bold leading-tight mt-1">{group.shortName}</span>
                          </button>
                        ))}
                      </div>
                      <div className="mt-3 p-3 bg-red-50/70 border border-red-200 rounded-xl text-xs text-red-950">
                        <strong>{selectedCategoryGroup.name}:</strong> {selectedCategoryGroup.note}
                      </div>
                    </div>
                  )}

                  {/* Criteria List */}
                  <div className="space-y-3">
                    {(!isBranch
                      ? selectedCategoryGroup.criteria
                      : tnttConfig.collectiveCriteria
                    ).map(item => {
                      const resp = criteriaResponses[item.id] || {
                        selected: false,
                        declarationText: '',
                        evidenceLink: '',
                      };
                      const wCount = countWords(resp.declarationText);
                      const isOverWordLimit = item.maxWords ? wCount > item.maxWords : false;

                      return (
                        <div
                          key={item.id}
                          className={`p-4 rounded-2xl border transition ${
                            resp.selected
                              ? 'border-red-500 bg-red-50/20 shadow-xs'
                              : 'border-slate-200 bg-slate-50/60'
                          }`}
                        >
                          <label className="flex items-start gap-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={resp.selected}
                              onChange={e => updateCriterionResponse(item.id, 'selected', e.target.checked)}
                              className="mt-1 w-4 h-4 accent-red-600 shrink-0"
                            />
                            <div className="flex-1 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[10px] font-black uppercase bg-red-600 text-white px-2 py-0.5 rounded">
                                  {item.code}
                                </span>
                                <span className="text-xs font-bold text-slate-800 leading-snug">
                                  {item.content}
                                </span>
                              </div>
                              <div className="text-[11px] text-blue-800 bg-blue-50/80 px-2.5 py-1.5 rounded-lg border border-blue-100 mt-1">
                                <strong>Yêu cầu minh chứng (Phụ lục):</strong> {item.evidenceRequirement}
                              </div>
                            </div>
                          </label>

                          {resp.selected && (
                            <div className="mt-3 pl-7 space-y-2.5">
                              {(item.requiresText ?? true) && (
                                <div>
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-[11px] font-bold text-slate-700">
                                      Nội dung kê khai {item.maxWords ? `(Tối đa ${item.maxWords} chữ)` : ''}:
                                    </span>
                                    {item.maxWords && (
                                      <span
                                        className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                                          isOverWordLimit
                                            ? 'bg-rose-100 text-rose-700'
                                            : 'bg-slate-200 text-slate-700'
                                        }`}
                                      >
                                        {wCount} / {item.maxWords} chữ
                                      </span>
                                    )}
                                  </div>
                                  <textarea
                                    rows={3}
                                    placeholder={item.textPlaceholder || 'Nhập nội dung kê khai...'}
                                    value={resp.declarationText}
                                    onChange={e =>
                                      updateCriterionResponse(item.id, 'declarationText', e.target.value)
                                    }
                                    className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-red-500 text-slate-800"
                                  />
                                </div>
                              )}

                              {item.requiresFileLink && (
                                <div>
                                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                                    {item.fileLinkLabel || 'Link File scan PDF minh chứng'}:
                                  </label>
                                  <input
                                    type="url"
                                    placeholder="https://drive.google.com/... (Mở quyền xem cho mọi người có link)"
                                    value={resp.evidenceLink}
                                    onChange={e =>
                                      updateCriterionResponse(item.id, 'evidenceLink', e.target.value)
                                    }
                                    className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-red-500 text-slate-800"
                                  />
                                  {item.highlightNote && (
                                    <p className="text-[10px] text-amber-800 font-semibold mt-1">
                                      * Lưu ý bắt buộc: {tnttConfig.docInfo.generalNote}
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="pt-2 border-t border-slate-100">
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Link Thư mục Google Drive tổng hợp toàn bộ hồ sơ & minh chứng (Khuyến khích)
                    </label>
                    <input
                      type="url"
                      placeholder="https://drive.google.com/drive/folders/..."
                      value={folderEvidenceLink}
                      onChange={e => setFolderEvidenceLink(e.target.value)}
                      className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-red-500 text-slate-800"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submittingTntt}
                    className="w-full py-3.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md shadow-red-900/15 cursor-pointer transition"
                  >
                    <Send size={15} />
                    {submittingTntt
                      ? 'Đang lưu hồ sơ...'
                      : editingAppId
                      ? editingAppPriorStatus && editingAppPriorStatus !== 'pending'
                        ? 'Cập nhật minh chứng & Gửi thẩm định lại (Hủy thẩm định cũ)'
                        : 'Lưu cập nhật Hồ sơ & Minh chứng'
                      : isBranch
                      ? 'Nộp Hồ sơ Tập thể tiên tiến làm theo lời Bác'
                      : 'Nộp Hồ sơ Cá nhân Thanh niên tiên tiến làm theo lời Bác'}
                  </button>
                </div>
              </form>
            )}

            {/* 3.2 MY SUBMITTED APPLICATIONS (ĐOÀN VIÊN & CHI ĐOÀN) */}
            {tnttViewMode === 'my_apps' && !isAdmin && (
              <div className="space-y-3">
                {loadingTntt ? (
                  <p className="text-xs text-center text-slate-500 py-8">Đang tải hồ sơ...</p>
                ) : myTnttApps.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto">
                      <Award size={24} />
                    </div>
                    <p className="text-xs font-bold text-slate-700">
                      {isBranch
                        ? 'Chi đoàn của bạn chưa nộp hồ sơ "Tập thể tiên tiến làm theo lời Bác" nào.'
                        : 'Bạn chưa nộp hồ sơ Cá nhân "Thanh niên tiên tiến làm theo lời Bác" nào.'}
                    </p>
                    <button
                      onClick={() => setTnttViewMode('form')}
                      className="px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-bold cursor-pointer"
                    >
                      + Kê khai hồ sơ ngay
                    </button>
                  </div>
                ) : (
                  myTnttApps.map(app => {
                    const isReviewed = app.status && app.status !== 'pending';
                    return (
                      <div
                        key={app.id}
                        className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="flex flex-wrap items-center gap-1.5 mb-1">
                              <span className="text-[10px] font-black uppercase bg-red-600 text-white px-2 py-0.5 rounded">
                                {app.applicantType === 'collective' ? 'Tập thể (Chi đoàn)' : 'Cá nhân (Sinh viên)'}
                              </span>
                              <span className="text-[10px] font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded">
                                {app.awardLevel === 'tieubieu' ? 'Đề xuất Tiêu biểu cấp Trường' : 'Cấp Trường'}
                              </span>
                              <span className="text-[10px] font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                                {app.primaryCategoryName || app.primaryCategory}
                              </span>
                            </div>
                            <h4 className="text-sm font-extrabold text-slate-800">
                              {app.fullName} {app.mssv ? `(${app.mssv})` : ''} - Chi đoàn {app.branch}
                            </h4>
                          </div>
                          <span
                            className={`text-[10.5px] font-bold px-2.5 py-1 rounded-full border ${getTnttStatusBadge(
                              app.status
                            )}`}
                          >
                            {getTnttStatusLabel(app.status)}
                          </span>
                        </div>

                        {app.uncleHoPracticeWork && (
                          <div className="text-xs text-slate-700 bg-amber-50/60 p-3 rounded-xl border border-amber-100">
                            <strong className="text-slate-900">Phần việc làm theo lời Bác: </strong>
                            {app.uncleHoPracticeWork}
                          </div>
                        )}

                        {app.applicantType === 'individual' && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                            <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                              <span>
                                Điểm rèn luyện: <strong>{app.drlScore}</strong>
                              </span>
                              {app.drlEvidenceLink && (
                                <a
                                  href={app.drlEvidenceLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:underline font-bold flex items-center gap-1"
                                >
                                  <ExternalLink size={12} /> File PDF ĐRL
                                </a>
                              )}
                            </div>
                            <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                              <span>
                                ĐTB tích lũy (GPA): <strong>{app.gpaScore}</strong>
                              </span>
                              {app.gpaEvidenceLink && (
                                <a
                                  href={app.gpaEvidenceLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:underline font-bold flex items-center gap-1"
                                >
                                  <ExternalLink size={12} /> File PDF Bảng điểm
                                </a>
                              )}
                            </div>
                          </div>
                        )}

                        {app.reviewerNote && (
                          <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-xs text-indigo-950">
                            <div className="font-extrabold text-[10px] uppercase tracking-wider text-indigo-700 mb-0.5">
                              Nhận xét thẩm định từ BCH Đoàn khoa ĐTVT:
                            </div>
                            {app.reviewerNote}
                          </div>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                          <div>
                            <span>Cập nhật: {new Date(app.updatedAt || app.createdAt).toLocaleDateString('vi-VN')}</span>
                            {isReviewed && (
                              <span className="ml-2 text-amber-700 font-semibold">
                                • Nếu chỉnh sửa & nộp lại minh chứng sẽ hủy kết quả thẩm định hiện tại
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setViewingApp(app)}
                              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <Eye size={12} /> Xem chi tiết
                            </button>
                            <button
                              onClick={() => handleEditApplication(app)}
                              className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <Edit3 size={12} /> Chỉnh sửa & Nộp lại minh chứng
                            </button>
                            <button
                              onClick={() => handleDeleteTnttApplication(app.id)}
                              className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 size={12} /> Xóa
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* 3.3 APPENDIX QUICK REFERENCE TABLE */}
            {tnttViewMode === 'appendix_guide' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h4 className="text-sm font-extrabold text-slate-800">
                      Bảng tra cứu Phụ lục Yêu cầu minh chứng (Thông báo số {tnttConfig.docInfo.number})
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Đối chiếu đầy đủ các tiêu chuẩn Cá nhân (Sinh viên) và Tập thể (Chi đoàn) trước khi nộp hồ sơ
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isAdmin && (
                      <button
                        onClick={() => {
                          setConfigEditDraft(JSON.parse(JSON.stringify(tnttConfig)));
                          setTnttViewMode('config_editor');
                        }}
                        className="px-3 py-1.5 bg-amber-500 text-slate-950 rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Settings size={13} /> Chỉnh sửa Phụ lục
                      </button>
                    )}
                    <button
                      onClick={() => setShowPdfModal(true)}
                      className="px-3 py-1.5 bg-red-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <FileText size={13} /> Mở văn bản PDF
                    </button>
                  </div>
                </div>

                {tnttConfig.individualGroups.map(group => (
                  <div key={group.id} className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="bg-slate-100 px-3.5 py-2.5 font-extrabold text-xs text-slate-800 flex items-center gap-2">
                      <span>{group.badge}</span>
                      <span>{group.name}</span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {group.criteria.map(c => (
                        <div key={c.id} className="p-3 grid grid-cols-1 sm:grid-cols-12 gap-2 text-xs">
                          <div className="sm:col-span-1 font-extrabold text-red-600">{c.code}</div>
                          <div className="sm:col-span-7 text-slate-700">{c.content}</div>
                          <div className="sm:col-span-4 text-blue-900 bg-blue-50/60 p-2 rounded-lg text-[11px]">
                            <strong>Minh chứng:</strong> {c.evidenceRequirement}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-red-50 px-3.5 py-2.5 font-extrabold text-xs text-red-900 flex items-center gap-2">
                    <span>🏛️</span>
                    <span>Danh hiệu "Tập thể tiên tiến làm theo lời Bác" (Dành cho Chi đoàn)</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {tnttConfig.collectiveCriteria.map(c => (
                      <div key={c.id} className="p-3 grid grid-cols-1 sm:grid-cols-12 gap-2 text-xs">
                        <div className="sm:col-span-2 font-extrabold text-red-600">{c.code}</div>
                        <div className="sm:col-span-6 text-slate-700">{c.content}</div>
                        <div className="sm:col-span-4 text-blue-900 bg-blue-50/60 p-2 rounded-lg text-[11px]">
                          <strong>Minh chứng:</strong> {c.evidenceRequirement}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 3.4 MANAGE & REVIEW APPLICATIONS (ĐOÀN KHOA - ADMIN ONLY) */}
            {tnttViewMode === 'manage' && isAdmin && (
              <div className="space-y-3">
                <div className="bg-indigo-950 text-white p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-extrabold uppercase tracking-wider">
                      Hệ thống Thẩm định Hồ sơ & Minh chứng TNTT làm theo lời Bác (Đoàn khoa ĐTVT)
                    </h4>
                    <p className="text-[11px] text-indigo-200 mt-0.5">
                      Xem hồ sơ Cá nhân (Sinh viên) & Tập thể (Chi đoàn), kiểm tra các file PDF minh chứng và thẩm định.
                    </p>
                  </div>
                  <div className="flex gap-2 text-xs font-bold shrink-0">
                    <span className="bg-white/15 px-3 py-1.5 rounded-xl">
                      👤 {tnttList.filter(a => a.applicantType !== 'collective').length} Cá nhân
                    </span>
                    <span className="bg-white/15 px-3 py-1.5 rounded-xl">
                      🏛️ {tnttList.filter(a => a.applicantType === 'collective').length} Tập thể
                    </span>
                  </div>
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Tìm theo Tên, MSSV, Chi đoàn..."
                      value={searchTnttQuery}
                      onChange={e => setSearchTnttQuery(e.target.value)}
                      className="w-full text-xs pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>
                  <select
                    value={filterTnttCategory}
                    onChange={e => setFilterTnttCategory(e.target.value)}
                    className="text-xs p-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-700"
                  >
                    <option value="all">Tất cả lĩnh vực / đối tượng</option>
                    <option value="tap_the">🏛️ Hồ sơ Tập thể (Chi đoàn)</option>
                    {tnttConfig.individualGroups.map(g => (
                      <option key={g.id} value={g.id}>
                        {g.badge} {g.shortName}
                      </option>
                    ))}
                  </select>
                  <select
                    value={filterTnttStatus}
                    onChange={e => setFilterTnttStatus(e.target.value)}
                    className="text-xs p-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-700"
                  >
                    <option value="all">Tất cả trạng thái thẩm định</option>
                    <option value="pending">Chờ Đoàn khoa thẩm định</option>
                    <option value="approved_faculty">Đã thẩm định: Đạt cấp Khoa</option>
                    <option value="proposed_exemplary">Đã thẩm định: Đề xuất Tiêu biểu Trường</option>
                    <option value="needs_revision">Cần bổ sung minh chứng</option>
                    <option value="rejected">Chưa đạt yêu cầu</option>
                  </select>
                </div>

                {tnttList
                  .filter(app => {
                    if (filterTnttCategory !== 'all' && app.primaryCategory !== filterTnttCategory) return false;
                    if (filterTnttStatus !== 'all' && app.status !== filterTnttStatus) return false;
                    const q = searchTnttQuery.trim().toLowerCase();
                    if (!q) return true;
                    return (
                      (app.fullName || '').toLowerCase().includes(q) ||
                      (app.mssv || '').toLowerCase().includes(q) ||
                      (app.branch || '').toLowerCase().includes(q)
                    );
                  })
                  .map(app => (
                    <div
                      key={app.id}
                      className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-2.5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5 mb-1">
                            <span className="text-[10px] font-black uppercase bg-red-600 text-white px-2 py-0.5 rounded">
                              {app.applicantType === 'collective' ? 'Tập thể (Chi đoàn)' : 'Cá nhân (Sinh viên)'}
                            </span>
                            <span className="text-[10px] font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded">
                              {app.awardLevel === 'tieubieu' ? 'Hệ Tiêu biểu' : 'Cấp Trường'}
                            </span>
                            <span className="text-[10px] font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                              {app.primaryCategoryName || app.primaryCategory}
                            </span>
                          </div>
                          <h4 className="text-sm font-extrabold text-slate-800">
                            {app.fullName} {app.mssv ? `- MSSV: ${app.mssv}` : ''} •{' '}
                            <span className="text-red-600">{app.branch}</span>
                          </h4>
                          <div className="text-[10.5px] text-slate-500">
                            Email: {app.email || 'N/A'} • SĐT: {app.phone || 'N/A'}
                            {app.applicantType !== 'collective' && (
                              <>
                                {' '}
                                • ĐRL: <strong>{app.drlScore || '-'}</strong> • GPA:{' '}
                                <strong>{app.gpaScore || '-'}</strong>
                              </>
                            )}
                          </div>
                        </div>
                        <span
                          className={`text-[10.5px] font-bold px-2.5 py-1 rounded-full border ${getTnttStatusBadge(
                            app.status
                          )}`}
                        >
                          {getTnttStatusLabel(app.status)}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                        <div className="flex flex-wrap gap-2 text-[11px]">
                          {app.drlEvidenceLink && (
                            <a
                              href={app.drlEvidenceLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline font-bold flex items-center gap-1"
                            >
                              <ExternalLink size={12} /> Minh chứng ĐRL
                            </a>
                          )}
                          {app.gpaEvidenceLink && (
                            <a
                              href={app.gpaEvidenceLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline font-bold flex items-center gap-1"
                            >
                              <ExternalLink size={12} /> Minh chứng Bảng điểm
                            </a>
                          )}
                          {app.folderEvidenceLink && (
                            <a
                              href={app.folderEvidenceLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-emerald-700 hover:underline font-bold flex items-center gap-1"
                            >
                              <ExternalLink size={12} /> Folder Minh chứng tổng hợp
                            </a>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setViewingApp(app);
                              setReviewAppStatus(
                                app.status === 'pending' ? 'approved_faculty' : app.status || 'approved_faculty'
                              );
                              setReviewAppNote(app.reviewerNote || '');
                            }}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold cursor-pointer flex items-center gap-1.5"
                          >
                            <Eye size={13} /> Xem minh chứng & Thẩm định
                          </button>
                          <button
                            onClick={() => handleDeleteTnttApplication(app.id)}
                            className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl cursor-pointer"
                            title="Xóa hồ sơ"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* =========================================================
          MODAL 1: XEM VĂN BẢN PDF & PHỤ LỤC
         ========================================================= */}
      {showPdfModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3 sm:p-6">
          <div className="bg-white rounded-2xl w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-sm font-extrabold">
                  Thông báo số {tnttConfig.docInfo.number} & Phụ lục Yêu cầu minh chứng (PDF)
                </h3>
                <p className="text-[10.5px] text-slate-300">
                  {tnttConfig.docInfo.issuer} • Ban hành ngày {tnttConfig.docInfo.date}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={tnttConfig.docInfo.pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"
                >
                  <ExternalLink size={13} /> Mở tab mới / Tải PDF
                </a>
                <button
                  onClick={() => setShowPdfModal(false)}
                  className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-white cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-slate-100">
              <iframe
                src={tnttConfig.docInfo.pdfUrl}
                title={`Thông báo ${tnttConfig.docInfo.number}`}
                className="w-full h-full border-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL 2: XÉT DUYỆT & PHẢN HỒI Ý TƯỞNG SÁNG KIẾN (ĐOÀN KHOA)
         ========================================================= */}
      {reviewingIdea && isAdmin && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-extrabold text-slate-800">Xét duyệt & Phản hồi Ý tưởng sáng kiến</h3>
              <button onClick={() => setReviewingIdea(null)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleSaveIdeaReview} className="space-y-3">
              <div className="text-xs bg-slate-50 p-3 rounded-xl">
                <div className="font-bold text-slate-800">{reviewingIdea.title}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Tác giả: {reviewingIdea.authorName} ({reviewingIdea.branch})
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Trạng thái xét duyệt</label>
                <select
                  value={reviewIdeaStatus}
                  onChange={e => setReviewIdeaStatus(e.target.value)}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                >
                  <option value="pending">Đang chờ xem xét</option>
                  <option value="approved">Đã tiếp nhận</option>
                  <option value="implemented">Đang triển khai thực tế</option>
                  <option value="featured">🌟 Công nhận Sáng kiến tiêu biểu</option>
                  <option value="rejected">Chưa phù hợp</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Nhận xét / Phản hồi của BCH Đoàn khoa
                </label>
                <textarea
                  rows={4}
                  placeholder="Nhập góp ý, định hướng hỗ trợ triển khai hoặc phản hồi cho Đoàn viên..."
                  value={reviewIdeaFeedback}
                  onChange={e => setReviewIdeaFeedback(e.target.value)}
                  className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReviewingIdea(null)}
                  className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold"
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold cursor-pointer"
                >
                  Lưu kết quả
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL 3: XEM CHI TIẾT HỒ SƠ, MINH CHỨNG & THẨM ĐỊNH
         ========================================================= */}
      {viewingApp && (
        <div className="fixed inset-0 z-50 bg-black/65 flex items-center justify-center p-3 sm:p-6">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-sm font-extrabold">
                  Chi tiết Hồ sơ: {viewingApp.fullName} ({viewingApp.branch})
                </h3>
                <p className="text-[11px] text-slate-300">
                  {viewingApp.applicantType === 'collective' ? 'Hồ sơ Tập thể (Chi đoàn)' : 'Hồ sơ Cá nhân (Sinh viên)'}{' '}
                  • {viewingApp.primaryCategoryName} •{' '}
                  {viewingApp.awardLevel === 'tieubieu' ? 'Đề xuất Tiêu biểu cấp Trường' : 'Cấp Trường'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {!isAdmin && viewingApp.userId === currentUser?.uid && (
                  <button
                    type="button"
                    onClick={() => handleEditApplication(viewingApp)}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Edit3 size={12} /> Chỉnh sửa & Nộp lại minh chứng
                  </button>
                )}
                <button
                  onClick={() => setViewingApp(null)}
                  className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-white cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <span className="text-[10px] text-slate-400 block">Họ tên / Tập thể</span>
                  <strong className="text-slate-800">{viewingApp.fullName}</strong>
                </div>
                {viewingApp.applicantType !== 'collective' && (
                  <div>
                    <span className="text-[10px] text-slate-400 block">MSSV</span>
                    <strong className="text-slate-800">{viewingApp.mssv || 'N/A'}</strong>
                  </div>
                )}
                <div>
                  <span className="text-[10px] text-slate-400 block">Chi đoàn / Đơn vị</span>
                  <strong className="text-red-600">{viewingApp.branch}</strong>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">Xếp loại Đoàn viên / Tổ chức</span>
                  <strong className="text-slate-800">
                    {viewingApp.applicantType === 'collective'
                      ? viewingApp.collectiveOrgRating
                      : viewingApp.unionRating}
                  </strong>
                </div>
                {viewingApp.applicantType !== 'collective' && (
                  <>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Điểm rèn luyện</span>
                      <strong className="text-slate-800">{viewingApp.drlScore || '-'}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">ĐTB tích lũy (GPA)</span>
                      <strong className="text-slate-800">{viewingApp.gpaScore || '-'}</strong>
                    </div>
                  </>
                )}
              </div>

              {/* Direct Evidence Links Section */}
              <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-xl space-y-2">
                <div className="font-extrabold text-blue-950 uppercase text-[10.5px]">
                  Liên kết Minh chứng đính kèm:
                </div>
                <div className="flex flex-wrap gap-2.5">
                  {viewingApp.drlEvidenceLink && (
                    <a
                      href={viewingApp.drlEvidenceLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 bg-white border border-blue-200 text-blue-700 hover:bg-blue-100 rounded-lg font-bold inline-flex items-center gap-1.5"
                    >
                      <ExternalLink size={12} /> File PDF Điểm rèn luyện
                    </a>
                  )}
                  {viewingApp.gpaEvidenceLink && (
                    <a
                      href={viewingApp.gpaEvidenceLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 bg-white border border-blue-200 text-blue-700 hover:bg-blue-100 rounded-lg font-bold inline-flex items-center gap-1.5"
                    >
                      <ExternalLink size={12} /> File PDF Bảng điểm
                    </a>
                  )}
                  {viewingApp.folderEvidenceLink && (
                    <a
                      href={viewingApp.folderEvidenceLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg font-bold inline-flex items-center gap-1.5"
                    >
                      <ExternalLink size={12} /> Thư mục Drive Minh chứng tổng hợp
                    </a>
                  )}
                </div>
              </div>

              {viewingApp.uncleHoPracticeWork && (
                <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl">
                  <div className="font-extrabold text-amber-950 mb-1">
                    Tiêu chuẩn chung 3 - Phần việc làm theo lời Bác ({countWords(viewingApp.uncleHoPracticeWork)}/
                    {maxPracticeWords} chữ):
                  </div>
                  <p className="text-slate-800 whitespace-pre-line">{viewingApp.uncleHoPracticeWork}</p>
                </div>
              )}

              <div className="space-y-2">
                <div className="font-extrabold text-slate-800 uppercase text-[11px]">
                  Các Tiêu chuẩn & Minh chứng đã kê khai:
                </div>
                {Object.entries(viewingApp.criteriaResponses || {})
                  .filter(([_, val]: any) => val?.selected)
                  .map(([critId, val]: any) => {
                    const allItems = [
                      ...tnttConfig.individualGroups.flatMap(g => g.criteria),
                      ...tnttConfig.collectiveCriteria,
                    ];
                    const itemMeta = allItems.find(i => i.id === critId);
                    return (
                      <div key={critId} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                        <div className="font-bold text-slate-800">
                          <span className="text-red-600 mr-1.5">[{itemMeta?.code || critId}]</span>
                          {itemMeta?.content}
                        </div>
                        {val.declarationText && (
                          <div className="text-slate-700 bg-white p-2.5 rounded-lg border border-slate-100 whitespace-pre-line">
                            <strong>Kê khai ({countWords(val.declarationText)} chữ): </strong>
                            {val.declarationText}
                          </div>
                        )}
                        {val.evidenceLink && (
                          <div>
                            <a
                              href={val.evidenceLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-blue-600 hover:underline font-bold"
                            >
                              <ExternalLink size={12} /> Mở File scan PDF minh chứng của mục này
                            </a>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>

              {/* ONLY ĐOÀN KHOA (isAdmin) CAN REVIEW & EVALUATE */}
              {isAdmin && (
                <form onSubmit={handleSaveTnttReview} className="pt-3 border-t border-slate-200 space-y-3">
                  <h4 className="font-extrabold text-indigo-950 text-xs uppercase">
                    Thẩm định hồ sơ (Dành riêng cho BCH Đoàn khoa ĐTVT)
                  </h4>
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-1">Kết quả thẩm định</label>
                    <select
                      value={reviewAppStatus}
                      onChange={e => setReviewAppStatus(e.target.value)}
                      className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                    >
                      <option value="pending">Chờ Đoàn khoa thẩm định</option>
                      <option value="approved_faculty">✅ Đạt cấp Khoa - Đề xuất cấp Trường</option>
                      <option value="proposed_exemplary">🏆 Đề xuất Danh hiệu Tiêu biểu cấp Trường</option>
                      <option value="needs_revision">⚠️ Cần bổ sung / chỉnh sửa minh chứng</option>
                      <option value="rejected">❌ Chưa đạt tiêu chuẩn</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-1">
                      Nhận xét thẩm định / Yêu cầu bổ sung minh chứng
                    </label>
                    <textarea
                      rows={3}
                      placeholder="VD: Minh chứng giải thưởng cần bổ sung trang danh sách có tô vàng tên cá nhân..."
                      value={reviewAppNote}
                      onChange={e => setReviewAppNote(e.target.value)}
                      className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setViewingApp(null)}
                      className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold"
                    >
                      Đóng
                    </button>
                    <button
                      type="submit"
                      className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold cursor-pointer"
                    >
                      Lưu kết quả thẩm định
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
