/**
 * Optimizes image URLs for fast web delivery by ensuring proper dimensions,
 * WebP/modern formats, and compression quality where supported.
 */
export function optimizeProductImageUrl(url?: string | null, width = 450): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';

  // 1. Unsplash Images: Add dynamic width, auto webp formatting, and 80% compression
  if (trimmed.includes('images.unsplash.com')) {
    try {
      const u = new URL(trimmed);
      u.searchParams.set('w', String(width));
      u.searchParams.set('auto', 'format');
      u.searchParams.set('fit', 'crop');
      u.searchParams.set('q', '80');
      return u.toString();
    } catch {
      return trimmed;
    }
  }

  // 2. Cloudinary Images: Insert f_auto,q_auto,w_xxx transformation
  if (trimmed.includes('res.cloudinary.com') && trimmed.includes('/upload/')) {
    try {
      return trimmed.replace('/upload/', `/upload/f_auto,q_auto,w_${width}/`);
    } catch {
      return trimmed;
    }
  }

  // 3. Supabase / Firebase Storage / Standard URLs
  return trimmed;
}
