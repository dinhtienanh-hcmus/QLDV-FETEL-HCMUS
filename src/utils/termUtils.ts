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
