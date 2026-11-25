import { BRAND } from "@/config/brand";

export const NAV = [
  { href: "/workspace", label: "Workspace" },
  { href: "/deals", label: "Deals" },
  { href: "/method", label: "Method" },
  { href: "/token", label: BRAND.symbol },
] as const;

/** Every public route, for the sitemap. */
export const ROUTES = ["/", "/workspace", "/deals", "/method", "/token"] as const;
