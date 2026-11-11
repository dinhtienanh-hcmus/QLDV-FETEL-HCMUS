// Utility for handling BCH terms and periods expiry based on October (Month 10) cutoff
export const isTermExpired = (termStr?: string | null, now = new Date()): boolean => {
  if (!termStr) return false;
  const cleanStr = termStr.trim();
  const parts = cleanStr.split('-').map(s => s.trim());
  if (parts.length < 2) return false;
  const endYear = parseInt(parts[1], 10);
  if (isNaN(endYear)) return false;
  
  // Expiry threshold: October 1st of endYear (Note: JS Month is 0-indexed, so 9 = October)
  const expiryDate = new Date(endYear, 9, 1);
  return now >= expiryDate;
};

// Default initial terms/periods
export const DEFAULT_DOAN_KHOA_TERMS = ['2025-2027'];
export const DEFAULT_DOAN_KHOA_PERIODS = ['2026-2027'];
export const DEFAULT_CHI_DOAN_TERMS = ['2026-2027'];

export const filterActiveTerms = (terms: string[]): string[] => {
  return Array.from(new Set(terms)).filter(t => t && t.trim() !== '' && !isTermExpired(t));
};

export const formatDateToDDMMYYYY = (timeValue: any): string => {
  if (!timeValue) return 'N/A';
  const d = new Date(timeValue);
  if (isNaN(d.getTime())) return 'N/A';
  const date = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const year = d.getFullYear();
  return `${date}/${month}/${year}`;
};

export const CANONICAL_BRANCHES = [
  '25DTV_DKD',
  '25DTV1',
  '25DTV2',
  '25ICD',
  '26DTV_DKD',
  '26DTV1',
  '26DTV2',
  '26ICD'
];

export const normalizeCanonicalBranch = (raw?: string | null): string => {
  if (!raw) return '';
  let s = String(raw).trim();
  if (!s) return '';

  // Remove common prefixes: "chi đoàn", "bch chi đoàn", "bch", "đoàn khoa", etc.
  s = s.replace(/^(BCH\s*CHI\s*ĐOÀN|BCH\s*CHI\s*DOAN|CHI\s*ĐOÀN|CHI\s*DOAN|BCH|BAN\s*CHẤP\s*HÀNH|BAN\s*CHAP\s*HANH)\s*/i, '').trim();
  s = s.replace(/^[._\s-]+|[._\s-]+$/g, '').trim();

  const upper = s.toUpperCase();
  // ICD variants
  if (upper === 'ICD25' || upper === '25ICD1' || upper === '25-ICD' || upper === '25ICD') return '25ICD';
  if (upper === 'ICD26' || upper === '26ICD1' || upper === '26-ICD' || upper === '26ICD') return '26ICD';

  // DTV DKD variants
  if (upper === '25DTVDKD' || upper === '25DTV-DKD' || upper === '25DTV_DKD') return '25DTV_DKD';
  if (upper === '26DTVDKD' || upper === '26DTV-DKD' || upper === '26DTV_DKD') return '26DTV_DKD';

  // 25DTV1, 25DTV2, etc.
  if (upper.includes('25DTV1') || upper === '25DTV1') return '25DTV1';
  if (upper.includes('25DTV2') || upper === '25DTV2') return '25DTV2';
  if (upper.includes('26DTV1') || upper === '26DTV1') return '26DTV1';
  if (upper.includes('26DTV2') || upper === '26DTV2') return '26DTV2';

  const canonicalMatch = CANONICAL_BRANCHES.find(cb => cb.toLowerCase() === upper.toLowerCase());
  if (canonicalMatch) return canonicalMatch;

  return s;
};

