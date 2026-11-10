import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from './firebase';

let cachedGmailAccessToken: string | null = null;
let cachedGmailUserEmail: string | null = null;

export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file'
];

export function getCachedGmailToken(): string | null {
  return cachedGmailAccessToken;
}

export function getCachedGmailEmail(): string | null {
  return cachedGmailUserEmail;
}

export function hasCachedGmailToken(): boolean {
  return !!cachedGmailAccessToken;
}

export function setCachedGmailToken(token: string | null, email: string | null = null) {
  cachedGmailAccessToken = token;
  cachedGmailUserEmail = email;
}

/**
 * Obtain access token for Gmail API via Google Sign-In popup
 */
export async function getGmailAccessToken(forceInteractive = false, loginHint = 'dkdtvt.hcmus@gmail.com'): Promise<{ token: string; email: string }> {
  if (cachedGmailAccessToken && !forceInteractive) {
    return { token: cachedGmailAccessToken, email: cachedGmailUserEmail || 'dkdtvt.hcmus@gmail.com' };
  }

  const provider = new GoogleAuthProvider();
  GMAIL_SCOPES.forEach(scope => provider.addScope(scope));
  
  if (loginHint) {
    provider.setCustomParameters({
      login_hint: loginHint,
      prompt: 'select_account'
    });
  }

  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken;
    const email = result.user?.email || loginHint;

    if (!token) {
      throw new Error('Không thể nhận quyền truy cập Gmail từ tài khoản Google.');
    }

    cachedGmailAccessToken = token;
    cachedGmailUserEmail = email;
    return { token, email };
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
    if (code === 'auth/unauthorized-domain') {
      throw new Error('Tên miền ứng dụng chưa được ủy quyền trong Firebase Auth.');
    }
    throw err;
  }
}

export interface EmailAttachment {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId?: string;
  dataBase64?: string;
}

export interface GmailMessageSummary {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  bodyText: string;
  attachments: EmailAttachment[];
}

/**
 * Fetch recent incoming emails (e.g. from Đoàn trường or containing keywords)
 */
export async function fetchRecentEmails(
  token: string,
  searchQuery = 'from:doantruong OR "Đoàn trường" OR "Đoàn Khoa" OR "Thông báo" OR "KHTN"'
): Promise<GmailMessageSummary[]> {
  const queryParam = encodeURIComponent(searchQuery);
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${queryParam}&maxResults=10`,
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );

  if (!listRes.ok) {
    const errText = await listRes.text();
    throw new Error(`Lỗi tải danh sách email (${listRes.status}): ${errText}`);
  }

  const listData = await listRes.json();
  const messages: any[] = listData.messages || [];

  if (messages.length === 0) {
    // If specific query returned nothing, fetch latest 10 messages from Inbox
    const fallbackRes = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10',
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );
    if (fallbackRes.ok) {
      const fallbackData = await fallbackRes.json();
      messages.push(...(fallbackData.messages || []));
    }
  }

  const summaries: GmailMessageSummary[] = [];

  for (const item of messages.slice(0, 8)) {
    try {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=full`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      if (!msgRes.ok) continue;
      const msgData = await msgRes.json();
      const headers = msgData.payload?.headers || [];
      
      const getHeader = (name: string) => {
        const found = headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase());
        return found ? found.value : '';
      };

      const subject = getHeader('Subject') || '(Không có tiêu đề)';
      const from = getHeader('From') || '';
      const date = getHeader('Date') || '';
      const snippet = msgData.snippet || '';

      // Extract body & attachments
      let bodyText = '';
      const attachments: EmailAttachment[] = [];

      const parseParts = (payload: any) => {
        if (!payload) return;
        if (payload.body && payload.body.data && payload.mimeType === 'text/plain') {
          try {
            const decoded = atob(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
            bodyText += new TextDecoder('utf-8').decode(Uint8Array.from(decoded, c => c.charCodeAt(0)));
          } catch {}
        }
        if (payload.filename && payload.body && payload.body.attachmentId) {
          attachments.push({
            filename: payload.filename,
            mimeType: payload.mimeType || 'application/octet-stream',
            size: payload.body.size || 0,
            attachmentId: payload.body.attachmentId
          });
        }
        if (payload.parts && Array.isArray(payload.parts)) {
          payload.parts.forEach(parseParts);
        }
      };

      parseParts(msgData.payload);

      if (!bodyText.trim()) {
        bodyText = snippet;
      }

      summaries.push({
        id: item.id,
        threadId: item.threadId,
        subject,
        from,
        date,
        snippet,
        bodyText: bodyText.trim(),
        attachments
      });
    } catch (e) {
      console.warn('Error reading message detail:', e);
    }
  }

  return summaries;
}

/**
 * Fetch raw base64 data for an attachment from Gmail
 */
export async function fetchAttachmentContent(
  token: string,
  messageId: string,
  attachmentId: string
): Promise<string> {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`,
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );

  if (!res.ok) {
    throw new Error('Không thể tải tệp đính kèm từ Gmail.');
  }

  const data = await res.json();
  // Gmail returns base64url data
  return data.data ? data.data.replace(/-/g, '+').replace(/_/g, '/') : '';
}

/**
 * Helper to encode Uint8Array into binary string in fast chunks without intermediate Array.from
 */
function bytesToBinaryString(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.length;
  const CHUNK = 8192;
  for (let i = 0; i < len; i += CHUNK) {
    const end = Math.min(i + CHUNK, len);
    binary += String.fromCharCode.apply(null, bytes.subarray(i, end) as unknown as number[]);
  }
  return binary;
}

/**
 * Helper to encode UTF-8 string to Base64 safely and quickly
 */
function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  return btoa(bytesToBinaryString(bytes));
}

/**
 * Convert string or RFC 822 email content to base64url for Gmail API
 */
function stringToBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  return btoa(bytesToBinaryString(bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Sends a notification email with optional attachments to multiple recipients via Gmail API
 * Uses single broadcast MIME message so all recipients receive the email instantly in 1 request
 */
export async function sendBulkNotificationEmail(
  token: string,
  options: {
    fromEmail: string;
    fromName?: string;
    replyToEmail?: string;
    recipients: string[];
    subject: string;
    bodyText: string;
    attachments?: Array<{ filename: string; mimeType: string; dataBase64: string }>;
  }
): Promise<{ successCount: number; failedRecipients: string[]; errors: string[] }> {
  const { 
    fromEmail, 
    fromName = 'BCH Đoàn khoa Điện tử - Viễn thông', 
    replyToEmail = 'dkdtvt.hcmus@gmail.com', 
    recipients, 
    subject, 
    bodyText, 
    attachments = [] 
  } = options;

  const validRecipients = Array.from(
    new Set(
      recipients
        .map(r => r.trim())
        .filter(r => r.length > 0 && r.includes('@'))
    )
  );

  if (validRecipients.length === 0) {
    throw new Error('Không có địa chỉ email người nhận hợp lệ. Vui lòng thêm ít nhất 1 email nhận thông báo.');
  }

  const boundary = `====_FETEL_NOTIFICATION_${Date.now()}_====`;
  const subjectEncoded = `=?UTF-8?B?${utf8ToBase64(subject)}?=`;
  const fromHeader = `=?UTF-8?B?${utf8ToBase64(fromName)}?= <${fromEmail}>`;
  const replyToHeader = `=?UTF-8?B?${utf8ToBase64(fromName)}?= <${replyToEmail}>`;

  // Build the email body once
  const bodyPartLines: string[] = [];
  if (attachments.length > 0) {
    bodyPartLines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
    bodyPartLines.push('');
    bodyPartLines.push(`--${boundary}`);
    bodyPartLines.push('Content-Type: text/plain; charset="UTF-8"');
    bodyPartLines.push('Content-Transfer-Encoding: base64');
    bodyPartLines.push('');
    bodyPartLines.push(utf8ToBase64(bodyText));
    bodyPartLines.push('');

    for (const att of attachments) {
      const encodedFilename = `=?UTF-8?B?${utf8ToBase64(att.filename)}?=`;
      bodyPartLines.push(`--${boundary}`);
      bodyPartLines.push(`Content-Type: ${att.mimeType || 'application/pdf'}; name="${encodedFilename}"`);
      bodyPartLines.push('Content-Transfer-Encoding: base64');
      bodyPartLines.push(`Content-Disposition: attachment; filename="${encodedFilename}"`);
      bodyPartLines.push('');
      // Clean up base64 data: strip data URL prefix and whitespace
      const cleanBase64 = (att.dataBase64 || '').replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '');
      bodyPartLines.push(cleanBase64);
      bodyPartLines.push('');
    }

    bodyPartLines.push(`--${boundary}--`);
  } else {
    bodyPartLines.push('Content-Type: text/plain; charset="UTF-8"');
    bodyPartLines.push('Content-Transfer-Encoding: base64');
    bodyPartLines.push('');
    bodyPartLines.push(utf8ToBase64(bodyText));
  }

  const commonBodyContent = bodyPartLines.join('\r\n');

  // Attempt Broadcast send (all recipients in To) in 1 fast call
  try {
    const emailLines: string[] = [];
    emailLines.push(`From: ${fromHeader}`);
    emailLines.push(`Reply-To: ${replyToHeader}`);
    emailLines.push(`To: ${validRecipients.join(', ')}`);
    emailLines.push(`Subject: ${subjectEncoded}`);
    emailLines.push('MIME-Version: 1.0');
    emailLines.push(commonBodyContent);

    const rawEmail = emailLines.join('\r\n');
    const base64UrlRaw = stringToBase64Url(rawEmail);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    const sendRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ raw: base64UrlRaw }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!sendRes.ok) {
      const errDetail = await sendRes.text();
      let parsedErr = errDetail;
      try {
        const jsonErr = JSON.parse(errDetail);
        parsedErr = jsonErr.error?.message || errDetail;
      } catch {}
      throw new Error(`Gmail API phản hồi lỗi (${sendRes.status}): ${parsedErr}`);
    }

    return { successCount: validRecipients.length, failedRecipients: [], errors: [] };
  } catch (broadcastErr: any) {
    // If broadcast failed due to recipient header limits, try sending individually with concurrency limit
    console.warn('Broadcast send failed, falling back to individual delivery:', broadcastErr);
    
    let successCount = 0;
    const failedRecipients: string[] = [];
    const errors: string[] = [];

    for (const recipient of validRecipients) {
      try {
        const indLines: string[] = [];
        indLines.push(`From: ${fromHeader}`);
        indLines.push(`Reply-To: ${replyToHeader}`);
        indLines.push(`To: ${recipient}`);
        indLines.push(`Subject: ${subjectEncoded}`);
        indLines.push('MIME-Version: 1.0');
        indLines.push(commonBodyContent);

        const indRaw = indLines.join('\r\n');
        const indBase64Url = stringToBase64Url(indRaw);

        const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ raw: indBase64Url })
        });

        if (res.ok) {
          successCount++;
        } else {
          const detail = await res.text();
          failedRecipients.push(recipient);
          errors.push(`${recipient}: ${detail}`);
        }
      } catch (indErr: any) {
        failedRecipients.push(recipient);
        errors.push(`${recipient}: ${indErr?.message || String(indErr)}`);
      }
    }

    if (successCount === 0 && errors.length > 0) {
      throw new Error(broadcastErr?.message || errors[0]);
    }

    return { successCount, failedRecipients, errors };
  }
}
