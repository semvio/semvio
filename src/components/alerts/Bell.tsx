"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWallet } from "@/components/wallet/WalletProvider";
import { explorerTx } from "@/config/networks";
import { roomLive } from "@/config/contracts";

/*
 * Alerts, free for everyone, web only. Level 1: an inbox (bell) computed from the deal room's events for the connected wallet; new
 * since your last look are counted. Level 2: browser notifications (Notification API) while a tab of this site is open, after you
 * click "Enable". No email, no push service, nothing stored on the server.
 */

type Alert = { key: string; kind: string; dealId: number; block: number | null; tx: string | null; text: string };
const seenKey = (net: string, a: string) => `sv1.alerts.seen.${net}.${a.toLowerCase()}`;
const readSeen = (k: string): string[] => {
  try {
    return JSON.parse(localStorage.getItem(k) ?? "[]") as string[];
  } catch {
    return [];
  }
};

export function Bell() {
  const w = useWallet();
  const net = w.target.key;
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [seen, setSeen] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [perm, setPerm] = useState<string>("default");
  const notified = useRef(new Set<string>());

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (typeof Notification !== "undefined") setPerm(Notification.permission);
      if (w.address) setSeen(readSeen(seenKey(net, w.address)));
    }, 0);
    return () => window.clearTimeout(t);
  }, [w.address, net]);

  const load = useCallback(async () => {
    if (!w.address || !roomLive(net) || document.visibilityState === "hidden") return;
    const r = await fetch(`/api/alerts?net=${net}&addr=${w.address}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    const list = (r?.alerts as Alert[] | undefined) ?? null;
    if (!list) return;
    setAlerts(list);
    const s = new Set(readSeen(seenKey(net, w.address)));
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      for (const a of list) {
        if (s.has(a.key) || notified.current.has(a.key)) continue;
        notified.current.add(a.key);
        try {
          new Notification("Semvio", { body: a.text, tag: a.key });
        } catch {
          // some browsers only allow notifications from a service worker; the inbox still shows it
        }
      }
    }
  }, [w.address, net]);

  useEffect(() => {
    if (!w.address) return;
    const first = window.setTimeout(() => void load(), 0);
    const t = window.setInterval(() => void load(), 30_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(t);
    };
  }, [w.address, load]);

  if (!w.address) return null;
  const unread = alerts.filter((a) => !seen.includes(a.key)).length;
  const markRead = () => {
    const keys = [...new Set([...seen, ...alerts.map((a) => a.key)])].slice(-500);
    setSeen(keys);
    try {
      localStorage.setItem(seenKey(net, w.address!), JSON.stringify(keys));
    } catch {}
  };
  const enable = async () => {
    if (typeof Notification === "undefined") return setPerm("unsupported");
    setPerm(await Notification.requestPermission());
  };

  return (
    <div className="relative">
      <button type="button" className="rq-iconbtn relative" aria-label={`Alerts, ${unread} new`} aria-expanded={open} onClick={() => setOpen((o) => !o)} data-testid="bell">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
          <path d="M4 11V7a4 4 0 0 1 8 0v4l1 1.5H3L4 11zM6.5 14h3" />
        </svg>
        {unread ? (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--yellow)] px-1 text-[10px] text-black" data-testid="bell-count">
            {unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="rq-menu right-0 top-11 w-[min(340px,calc(100vw-24px))]" style={{ position: "absolute" }} role="dialog" aria-label="Alerts" data-testid="bell-menu">
          <div className="flex items-center justify-between gap-2 px-3 py-2 text-[12px]">
            <b className="font-normal">Alerts · {w.target.short}</b>
            {alerts.length ? (
              <button type="button" className="underline" onClick={markRead}>
                Mark all read
              </button>
            ) : null}
          </div>
          <ul className="max-h-[320px] overflow-y-auto px-3 pb-2 text-[12px]">
            {!roomLive(net) ? <li className="text-[var(--muted)]">The deal room is not deployed on this network yet, so there is nothing to watch.</li> : null}
            {roomLive(net) && alerts.length === 0 ? <li className="text-[var(--muted)]">No alerts for your deals.</li> : null}
            {alerts.map((a) => (
              <li key={a.key} className={`border-t border-[var(--line)] py-2 ${seen.includes(a.key) ? "text-[var(--muted)]" : ""}`} data-testid="bell-item">
                {a.text}
                {a.tx ? (
                  <>
                    {" "}
                    <a className="underline" href={explorerTx(a.tx, net)} target="_blank" rel="noreferrer">
                      tx
                    </a>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="border-t border-[var(--line)] px-3 py-2 text-[11.5px] text-[var(--muted)]">
            {perm === "granted" ? (
              "Browser notifications on while a tab of this site is open."
            ) : perm === "denied" ? (
              "Browser notifications are blocked for this site in your browser settings."
            ) : perm === "unsupported" ? (
              "This browser has no notifications."
            ) : (
              <button type="button" className="btn btn-dark w-full" onClick={() => void enable()} data-testid="bell-enable">
                Enable browser notifications
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
