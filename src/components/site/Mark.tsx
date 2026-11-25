/*
 * Semvio's mark: the owner's logo (25 Nov 2026, assets/SEMVIO.png, white on transparent, portrait 2016x2912), fitted into
 * public/brand/mark.webp by referensi/tools/apply-owner-assets.mjs. Drawn as a CSS mask filled with currentColor in a box with the
 * mark's own proportions (never stretched). Bump ?v= when the file changes so cached copies are replaced.
 */
const MARK_URL = "/brand/mark.webp?v=0f8a5188";

export function MarkGlyph({ size = 22 }: { size?: number }) {
  const mask = `url(${MARK_URL}) center / contain no-repeat`;
  // The mark is portrait (about 0.75 : 1 with its margin); the box follows it so the mask fills it edge to edge.
  return <span aria-hidden="true" data-testid="brand-mark" className="block shrink-0 bg-current" style={{ width: Math.round(size * 0.75), height: size, WebkitMask: mask, mask }} />;
}

export function Wordmark({ size = 20 }: { size?: number }) {
  return (
    <span className="wordmark" style={{ fontSize: size }}>
      <MarkGlyph size={Math.round(size * 1.35)} />
      <span>Semvio</span>
    </span>
  );
}
