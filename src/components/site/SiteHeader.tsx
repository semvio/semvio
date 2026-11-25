"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NAV } from "@/config/nav";
import { Wordmark } from "@/components/site/Mark";
import { CloseIcon, MenuIcon } from "@/components/site/Icons";
import { NavWallet } from "@/components/wallet/WalletButton";
import { Bell } from "@/components/alerts/Bell";
import { CaBox } from "@/components/site/CaCopy";
import { useFocusTrap } from "@/components/site/useFocusTrap";

/* The reference's header: logo left, small mono links centred, one white button right; sticky and transparent over the page. */
export function SiteHeader() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <>
      <header className="hd">
        <div className="wrap-wide">
          <div className="hd-bar">
            <Link href="/" aria-label="Semvio home" className="shrink-0">
              <Wordmark size={18} />
            </Link>
            <nav aria-label="Main" className="hd-nav">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} aria-current={path === n.href || path.startsWith(`${n.href}/`) ? "page" : undefined}>
                  {n.label}
                </Link>
              ))}
            </nav>
            <div className="ml-auto flex min-w-0 items-center gap-2 min-[900px]:ml-0">
              <CaBox compact testid="header-ca" className="max-[1179px]:hidden" />
              <Bell />
              <NavWallet label="Connect wallet" />
              <button type="button" className="rq-iconbtn min-[900px]:hidden" aria-label="Open the menu" aria-expanded={open} onClick={() => setOpen(true)} data-testid="menu-open">
                <MenuIcon size={18} />
              </button>
            </div>
          </div>
        </div>
      </header>
      {open ? <MobileMenu onClose={() => setOpen(false)} path={path} /> : null}
    </>
  );
}

function MobileMenu({ onClose, path }: { onClose: () => void; path: string }) {
  const trap = useRef<HTMLDivElement>(null);
  useFocusTrap(trap, true, onClose);
  return createPortal(
    <div className="hd-menu" role="dialog" aria-modal="true" aria-label="Menu" ref={trap} data-testid="menu">
      <div className="wrap flex h-16 items-center justify-between">
        <Wordmark size={18} />
        <button type="button" className="rq-iconbtn" aria-label="Close the menu" onClick={onClose}>
          <CloseIcon size={16} />
        </button>
      </div>
      <nav className="wrap mt-4" aria-label="Main">
        {[{ href: "/", label: "Home" }, ...NAV].map((n) => (
          <Link key={n.href} href={n.href} onClick={onClose} className="big" aria-current={path === n.href ? "page" : undefined}>
            {n.label}
          </Link>
        ))}
      </nav>
      <div className="wrap mt-8 grid gap-3 pb-10">
        <Link href="/workspace" className="btn btn-white btn-lg w-full" onClick={onClose}>
          Open the workspace
        </Link>
        <CaBox testid="menu-ca" />
      </div>
    </div>,
    document.body,
  );
}
