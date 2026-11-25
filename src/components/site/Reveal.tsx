/* Fades a block up once it scrolls into view (driven by components/site/Motion.tsx). Without JavaScript or with reduced motion it is simply visible. */
export function Reveal({ children, className = "", delay = 0, as: Tag = "div" }: { children: React.ReactNode; className?: string; delay?: number; as?: "div" | "section" | "li" | "article" | "p" }) {
  const Any = Tag as React.ElementType;
  return (
    <Any data-reveal="" className={className} style={delay ? ({ "--delay": `${delay}ms` } as React.CSSProperties) : undefined}>
      {children}
    </Any>
  );
}
