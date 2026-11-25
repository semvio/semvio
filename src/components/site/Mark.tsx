/*
 * Semvio's mark: two stacked deal cards (placeholder drawn by referensi/tools/make-assets.mjs until the owner's logo arrives).
 * Drawn as a CSS mask filled with currentColor. Bump ?v= when the file changes so cached copies are replaced.
 */
const MARK_URL = "/brand/mark.webp?v=147202e2";

export function MarkGlyph({ size = 22 }: { size?: number }) {
  const mask = `url(${MARK_URL}) center / contain no-repeat`;
  return <span aria-hidden="true" data-testid="brand-mark" className="block shrink-0 bg-current" style={{ width: size, height: size, WebkitMask: mask, mask }} />;
}

export function Wordmark({ size = 20 }: { size?: number }) {
  return (
    <span className="wordmark" style={{ fontSize: size }}>
      <MarkGlyph size={Math.round(size * 1.35)} />
      <span>Semvio</span>
    </span>
  );
}
