import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from './firebase';
import { formatDateToDDMMYYYY } from '../utils/termUtils';

// In-memory token cache (never stored in localStorage/sessionStorage per security guidelines)
let cachedAccessToken: string | null = null;

export function getCachedToken(): string | null {
  return cachedAccessToken;
}

export function setCachedToken(token: string | null) {
  cachedAccessToken = token;
}

export function hasCachedToken(): boolean {
  return !!cachedAccessToken;
}

export const SHEETS_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file'
];

/**
 * Request or retrieve Google Sheets OAuth access token from Firebase Auth client
 */
export async function getGoogleSheetsAccessToken(interactive = false): Promise<string> {
  if (cachedAccessToken && !interactive) {
    return cachedAccessToken;
  }

  const provider = new GoogleAuthProvider();
  SHEETS_SCOPES.forEach(scope => provider.addScope(scope));

  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken;

    if (!token) {
      throw new Error('Không nhận được mã xác thực Google Sheets từ phiên đăng nhập.');
    }

    cachedAccessToken = token;
    return token;
  } catch (err: any) {
    const code = err?.code || '';
    if (code === 'auth/popup-closed-by-user') {
      throw new Error('Cửa sổ đăng nhập Google đã bị tắt trước khi cấp quyền. Vui lòng bấm thử lại để tiếp tục.');
    }
    if (code === 'auth/popup-blocked') {
      throw new Error('Trình duyệt đang chặn cửa sổ pop-up. Bạn hãy nhấp vào biểu tượng chặn pop-up trên thanh địa chỉ, chọn "Luôn cho phép" và thử lại nhé.');
    }
    if (code === 'auth/cancelled-popup-request') {
      throw new Error('Yêu cầu xác thực pop-up đã bị hủy do có yêu cầu mới.');
    }
    throw err;
  }
}

/**
 * Extract clean spreadsheet ID from full URL or return ID as-is
 */
export function extractSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return trimmed;
}

export interface ActivityData {
  id: string;
  name: string;
  startTime: number;
  endTime: number;
  pointsParticipant?: number;
  pointsOrganizer?: number;
  drlCategory?: string;
  targetAudience?: string;
  semester?: number;
  academicYear?: string;
  creatorId?: string;
  status: 'pending' | 'approved' | 'rejected';
  planLink?: string;
  evidenceLink?: string;
  description?: string;
  branch?: string;
  branches?: string[];
  activityType?: string;
}

export interface BranchData {
  id?: string;
  name: string;
}

export interface UserData {
  id?: string;
  name?: string;
  mssv?: string;
  role?: string;
  branch?: string;
  branchRole?: string;
  email?: string;
}

export function getRoleRank(roleStr = ''): number {
  const r = roleStr.toLowerCase();
  if (r.includes('bí thư') && !r.includes('phó bí')) return 1;
  if (r.includes('phó bí')) return 2;
  if (r.includes('thường vụ') || r.includes('btv')) return 3;
  if (r.includes('chấp hành') || r.includes('bch') || r.includes('ủy viên') || r.includes('uv')) return 4;
  return 5;
}

export function getActivityTypeLabel(act: ActivityData): string {
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
}

/**
 * Builds the 2D values matrix matching the table in image_f0a32102.png
 */
export function buildTrackingTableRows(
  branches: BranchData[],
  activities: ActivityData[],
  usersList: UserData[],
  semesterFilter: string = 'all',
  yearFilter: string = 'all'
): { rows: (string | number)[][]; merges: Array<{ startRow: number; endRow: number; startCol: number; endCol: number }> } {
  const rows: (string | number)[][] = [
    ['CHI ĐOÀN', 'NGƯỜI PHỤ TRÁCH', 'HOẠT ĐỘNG ĐÃ/ĐANG TỔ CHỨC', '', '', 'HOẠT ĐỘNG DỰ KIẾN TỔ CHỨC', '', ''],
    ['', '', 'TÊN HOẠT ĐỘNG', 'BẮT ĐẦU', 'KẾT THÚC', 'TÊN HOẠT ĐỘNG DỰ KIẾN', 'THỜI GIAN DỰ KIẾN', 'PHÂN LOẠI CHỦ ĐỀ']
  ];

  const merges: Array<{ startRow: number; endRow: number; startCol: number; endCol: number }> = [
    // Row 0 & 1 header merges
    { startRow: 0, endRow: 2, startCol: 0, endCol: 1 }, // CHI ĐOÀN
    { startRow: 0, endRow: 2, startCol: 1, endCol: 2 }, // NGƯỜI PHỤ TRÁCH
    { startRow: 0, endRow: 1, startCol: 2, endCol: 5 }, // HOẠT ĐỘNG ĐÃ/ĐANG TỔ CHỨC (Cols C, D, E)
    { startRow: 0, endRow: 1, startCol: 5, endCol: 8 }, // HOẠT ĐỘNG DỰ KIẾN TỔ CHỨC (Cols F, G, H)
  ];

  const sortedBranches = [...branches].sort((a, b) => a.name.localeCompare(b.name));

  let currentRowIndex = 2;

  for (const branch of sortedBranches) {
    // Leader name
    const cdBch = usersList.filter(u =>
      u.branch &&
      u.branch.trim().toLowerCase() === branch.name.trim().toLowerCase() &&
      u.branchRole &&
      u.branchRole.trim() !== ''
    );
    let leaderName = 'CHƯA CÓ BCH';
    if (cdBch.length > 0) {
      cdBch.sort((a, b) => getRoleRank(a.branchRole) - getRoleRank(b.branchRole));
      leaderName = (cdBch[0].name || '').toUpperCase();
    }

    // Filter approved activities
    const approvedActs = activities.filter(a => {
      const belongs = a.branch === branch.name || (a.branches && a.branches.includes(branch.name));
      const isApproved = a.status === 'approved';
      const semMatch = semesterFilter === 'all' || String(a.semester) === semesterFilter;
      const yearMatch = yearFilter === 'all' || a.academicYear === yearFilter;
      return belongs && isApproved && semMatch && yearMatch;
    });

    // Filter pending activities
    const pendingActs = activities.filter(a => {
      const belongs = a.branch === branch.name || (a.branches && a.branches.includes(branch.name));
      const isPending = a.status === 'pending';
      const semMatch = semesterFilter === 'all' || String(a.semester) === semesterFilter;
      const yearMatch = yearFilter === 'all' || a.academicYear === yearFilter;
      return belongs && isPending && semMatch && yearMatch;
    });

    const rowCount = Math.max(approvedActs.length, pendingActs.length, 1);

    if (rowCount > 1) {
      // Merge branch and leader across rowCount rows
      merges.push({ startRow: currentRowIndex, endRow: currentRowIndex + rowCount, startCol: 0, endCol: 1 });
      merges.push({ startRow: currentRowIndex, endRow: currentRowIndex + rowCount, startCol: 1, endCol: 2 });
    }

    for (let i = 0; i < rowCount; i++) {
      const appAct = approvedActs[i];
      const penAct = pendingActs[i];

      const startStr = appAct ? formatDateToDDMMYYYY(appAct.startTime) : '-';
      const endStr = appAct ? formatDateToDDMMYYYY(appAct.endTime) : '-';
      const pendTimeStr = penAct
        ? `${formatDateToDDMMYYYY(penAct.startTime)}${penAct.endTime !== penAct.startTime ? ' - ' + formatDateToDDMMYYYY(penAct.endTime) : ''}`
        : '-';

      const penType = penAct ? getActivityTypeLabel(penAct) : '-';

      rows.push([
        i === 0 ? branch.name : '',
        i === 0 ? leaderName : '',
        appAct ? appAct.name : '-',
        startStr,
        endStr,
        penAct ? penAct.name : '-',
        pendTimeStr,
        penType
      ]);
    }

    currentRowIndex += rowCount;
  }

  return { rows, merges };
}

/**
 * Builds the log table rows for approved activities
 */
export function buildApprovedLogRows(activities: ActivityData[]): (string | number)[][] {
  const approved = activities
    .filter(a => a.status === 'approved')
    .sort((a, b) => (b.startTime || 0) - (a.startTime || 0));

  const rows: (string | number)[][] = [
    ['STT', 'CHI ĐOÀN', 'TÊN HOẠT ĐỘNG', 'NGÀY BẮT ĐẦU', 'NGÀY KẾT THÚC', 'ĐIỂM ĐV', 'ĐIỂM BTC', 'HỌC KỲ', 'NĂM HỌC', 'PHÂN LOẠI', 'TRẠNG THÁI']
  ];

  approved.forEach((act, idx) => {
    rows.push([
      idx + 1,
      act.branch || (act.branches ? act.branches.join(', ') : 'Đoàn khoa'),
      act.name,
      formatDateToDDMMYYYY(act.startTime),
      formatDateToDDMMYYYY(act.endTime),
      act.pointsParticipant ?? 0,
      act.pointsOrganizer ?? 0,
      act.semester ? `Học kỳ ${act.semester}` : '',
      act.academicYear || '',
      getActivityTypeLabel(act),
      'ĐÃ PHÊ DUYỆT'
    ]);
  });

  return rows;
}

/**
 * Create a new Google Spreadsheet with the tracking matrix layout
 */
export async function createTrackingSpreadsheet(
  token: string,
  options: {
    title?: string;
    branches: BranchData[];
    activities: ActivityData[];
    usersList: UserData[];
    semesterFilter?: string;
    yearFilter?: string;
  }
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  const title = options.title || 'Bảng Theo Dõi & Quản Lý Hoạt Động Chi Đoàn - FETEL';

  // 1. Create spreadsheet
  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      properties: { title },
      sheets: [
        {
          properties: {
            sheetId: 0,
            title: 'Theo dõi HĐ Chi đoàn',
            gridProperties: {
              frozenRowCount: 2
            }
          }
        },
        {
          properties: {
            sheetId: 1,
            title: 'Nhật ký HĐ đã duyệt',
            gridProperties: {
              frozenRowCount: 1
            }
          }
        }
      ]
    })
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Lỗi tạo Google Sheet (${createRes.status}): ${errText}`);
  }

  const sheetData = await createRes.json();
  const spreadsheetId = sheetData.spreadsheetId;
  const spreadsheetUrl = sheetData.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

  // 2. Populate and format the sheets
  await syncTrackingSpreadsheet(token, spreadsheetId, options);

  return { spreadsheetId, spreadsheetUrl };
}

/**
 * Sync all data into an existing Google Spreadsheet
 */
export async function syncTrackingSpreadsheet(
  token: string,
  spreadsheetId: string,
  options: {
    branches: BranchData[];
    activities: ActivityData[];
    usersList: UserData[];
    semesterFilter?: string;
    yearFilter?: string;
  }
): Promise<void> {
  // First, verify the spreadsheet and find the sheet IDs
  const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!metaRes.ok) {
    const errText = await metaRes.text();
    throw new Error(`Không thể truy cập Google Sheet ID ${spreadsheetId}: ${errText}`);
  }

  const metaData = await metaRes.json();
  const sheets: any[] = metaData.sheets || [];
  
  // Find or determine sheet names
  let trackingSheet = sheets.find(s => s.properties?.title === 'Theo dõi HĐ Chi đoàn');
  if (!trackingSheet && sheets.length > 0) {
    trackingSheet = sheets[0];
  }
  const trackingSheetId = trackingSheet?.properties?.sheetId ?? 0;
  const trackingSheetTitle = trackingSheet?.properties?.title ?? 'Sheet1';

  let logSheet = sheets.find(s => s.properties?.title === 'Nhật ký HĐ đã duyệt');
  if (!logSheet && sheets.length > 1) {
    logSheet = sheets[1];
  }

  // If logSheet doesn't exist, create it
  if (!logSheet) {
    const addSheetRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: [
          {
            addSheet: {
              properties: {
                title: 'Nhật ký HĐ đã duyệt',
                gridProperties: { frozenRowCount: 1 }
              }
            }
          }
        ]
      })
    });
    if (addSheetRes.ok) {
      const addedData = await addSheetRes.json();
      logSheet = addedData.replies?.[0]?.addSheet;
    }
  }

  const logSheetTitle = logSheet?.properties?.title ?? 'Nhật ký HĐ đã duyệt';
  const logSheetId = logSheet?.properties?.sheetId ?? 1;

  // Build matrix
  const { rows: trackingRows, merges } = buildTrackingTableRows(
    options.branches,
    options.activities,
    options.usersList,
    options.semesterFilter,
    options.yearFilter
  );

  const logRows = buildApprovedLogRows(options.activities);

  // Clear previous content in both sheets
  await Promise.all([
    fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${encodeURIComponent(trackingSheetTitle)}'!A1:Z1000:clear`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    }),
    fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${encodeURIComponent(logSheetTitle)}'!A1:Z1000:clear`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    })
  ]);

  // Write values to both sheets
  const updateRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      valueInputOption: 'USER_ENTERED',
      data: [
        {
          range: `'${trackingSheetTitle}'!A1:H${trackingRows.length}`,
          values: trackingRows
        },
        {
          range: `'${logSheetTitle}'!A1:K${logRows.length}`,
          values: logRows
        }
      ]
    })
  });

  if (!updateRes.ok) {
    const errText = await updateRes.text();
    throw new Error(`Lỗi cập nhật dữ liệu vào Google Sheet: ${errText}`);
  }

  // Format headers, background colors, and column widths
  const formattingRequests: any[] = [
    // Column widths for trackingSheet
    {
      updateDimensionProperties: {
        range: { sheetId: trackingSheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 120 },
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: { sheetId: trackingSheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 },
        properties: { pixelSize: 180 },
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: { sheetId: trackingSheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 },
        properties: { pixelSize: 260 },
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: { sheetId: trackingSheetId, dimension: 'COLUMNS', startIndex: 3, endIndex: 5 },
        properties: { pixelSize: 110 },
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: { sheetId: trackingSheetId, dimension: 'COLUMNS', startIndex: 5, endIndex: 6 },
        properties: { pixelSize: 260 },
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: { sheetId: trackingSheetId, dimension: 'COLUMNS', startIndex: 6, endIndex: 7 },
        properties: { pixelSize: 160 },
        fields: 'pixelSize'
      }
    },
    {
      updateDimensionProperties: {
        range: { sheetId: trackingSheetId, dimension: 'COLUMNS', startIndex: 7, endIndex: 8 },
        properties: { pixelSize: 140 },
        fields: 'pixelSize'
      }
    },
    // Row 1 header formats: C1:E1 (Green)
    {
      repeatCell: {
        range: { sheetId: trackingSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 2, endColumnIndex: 5 },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.85, green: 0.95, blue: 0.88 },
            textFormat: { bold: true, foregroundColor: { red: 0.05, green: 0.45, blue: 0.2 } },
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE'
          }
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
      }
    },
    // Row 1 header formats: F1:H1 (Purple/Indigo)
    {
      repeatCell: {
        range: { sheetId: trackingSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 5, endColumnIndex: 8 },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.9, green: 0.9, blue: 0.98 },
            textFormat: { bold: true, foregroundColor: { red: 0.3, green: 0.15, blue: 0.6 } },
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE'
          }
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
      }
    },
    // Row 1 & 2 headers A1:B2 (Slate)
    {
      repeatCell: {
        range: { sheetId: trackingSheetId, startRowIndex: 0, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 2 },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.94, green: 0.96, blue: 0.98 },
            textFormat: { bold: true, foregroundColor: { red: 0.2, green: 0.25, blue: 0.3 } },
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE'
          }
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
      }
    },
    // Row 2 sub-headers C2:E2
    {
      repeatCell: {
        range: { sheetId: trackingSheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 2, endColumnIndex: 5 },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.94, green: 0.98, blue: 0.95 },
            textFormat: { bold: true, fontSize: 9, foregroundColor: { red: 0.05, green: 0.45, blue: 0.2 } },
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE'
          }
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
      }
    },
    // Row 2 sub-headers F2:H2
    {
      repeatCell: {
        range: { sheetId: trackingSheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 5, endColumnIndex: 8 },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.95, green: 0.95, blue: 0.99 },
            textFormat: { bold: true, fontSize: 9, foregroundColor: { red: 0.3, green: 0.15, blue: 0.6 } },
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE'
          }
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
      }
    },
    // All rows alignment & wrap
    {
      repeatCell: {
        range: { sheetId: trackingSheetId, startRowIndex: 2, endRowIndex: trackingRows.length, startColumnIndex: 0, endColumnIndex: 8 },
        cell: {
          userEnteredFormat: {
            verticalAlignment: 'MIDDLE',
            wrapStrategy: 'WRAP'
          }
        },
        fields: 'userEnteredFormat(verticalAlignment,wrapStrategy)'
      }
    },
    // Center Chi Doan & Leader columns
    {
      repeatCell: {
        range: { sheetId: trackingSheetId, startRowIndex: 2, endRowIndex: trackingRows.length, startColumnIndex: 0, endColumnIndex: 2 },
        cell: {
          userEnteredFormat: {
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE',
            textFormat: { bold: true }
          }
        },
        fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment,textFormat)'
      }
    },
    // Log Sheet Header Styling
    {
      repeatCell: {
        range: { sheetId: logSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 11 },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.1, green: 0.45, blue: 0.8 },
            textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE'
          }
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
      }
    }
  ];

  // Add merge requests
  merges.forEach(m => {
    formattingRequests.push({
      mergeCells: {
        range: {
          sheetId: trackingSheetId,
          startRowIndex: m.startRow,
          endRowIndex: m.endRow,
          startColumnIndex: m.startCol,
          endColumnIndex: m.endCol
        },
        mergeType: 'MERGE_ALL'
      }
    });
  });

  try {
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ requests: formattingRequests })
    });
  } catch (err) {
    console.warn('Không thể áp dụng toàn bộ định dạng Sheet (dữ liệu vẫn được lưu):', err);
  }
}

/**
 * Appends a new approved activity to the log sheet tab
 */
export async function appendApprovedActivityToSheet(
  token: string,
  spreadsheetId: string,
  activity: ActivityData
): Promise<void> {
  const row = [
    '=ROW()-1', // dynamic STT
    activity.branch || (activity.branches ? activity.branches.join(', ') : 'Đoàn khoa'),
    activity.name,
    formatDateToDDMMYYYY(activity.startTime),
    formatDateToDDMMYYYY(activity.endTime),
    activity.pointsParticipant ?? 0,
    activity.pointsOrganizer ?? 0,
    activity.semester ? `Học kỳ ${activity.semester}` : '',
    activity.academicYear || '',
    getActivityTypeLabel(activity),
    'ĐÃ PHÊ DUYỆT'
  ];

  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'Nhật ký HĐ đã duyệt'!A:K:append?valueInputOption=USER_ENTERED`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      range: "'Nhật ký HĐ đã duyệt'!A:K",
      majorDimension: 'ROWS',
      values: [row]
    })
  });
}
