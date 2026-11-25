"use client";

import { useState } from "react";
import { encodeAbiParameters } from "viem";
import { useWallet } from "@/components/wallet/WalletProvider";
import { useWalletModal } from "@/components/wallet/WalletButton";
import { NETWORKS, explorerAddress, explorerTx } from "@/config/networks";
import { explain, waitForReceipt } from "@/lib/client";
import artifacts from "@/lib/contracts/artifacts.json";

/** forge gas report, 25 Nov 2026: SemvioDealRoom 2,671,681 gas (12,058 bytes); SemvioPracticeToken 501,716 gas. */
export const DEPLOY_GAS = "about 2.7 million";

type Done = { address: string; tx: string; block: number };

export function DeployPanel() {
  const { address, onChain, sendTransaction, switchNetwork, target, setTarget } = useWallet();
  const { open } = useWalletModal();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [room, setRoom] = useState<Done | null>(null);
  const [token, setToken] = useState<Done | null>(null);
  const net = target.key;

  async function deploy(what: "room" | "token") {
    if (!address) return open();
    if (!onChain) return switchNetwork();
    setBusy(what);
    setMsg(null);
    try {
      const data =
        what === "room"
          ? (artifacts.contracts.SemvioDealRoom.creation as `0x${string}`)
          : ((artifacts.contracts.SemvioPracticeToken.creation +
              encodeAbiParameters([{ type: "string" }, { type: "string" }, { type: "uint8" }], ["Semvio Test Dollar", "tUSD", 6]).slice(2)) as `0x${string}`);
      const hash = await sendTransaction({ data });
      setMsg(`Sent ${hash}. Waiting for the block…`);
      const rc = await waitForReceipt(hash, net, 300_000);
      if (!rc.ok || !rc.contractAddress) throw new Error("The deployment reverted.");
      const done = { address: rc.contractAddress, tx: hash, block: rc.blockNumber };
      if (what === "room") setRoom(done);
      else setToken(done);
      setMsg(null);
    } catch (e) {
      setMsg(explain(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 min-[1000px]:grid-cols-2">
      <div className="panel-line p-6" data-testid="deploy-panel">
        <div className="seg" role="group" aria-label="Network">
          {(["mainnet", "testnet"] as const).map((k) => (
            <button key={k} type="button" aria-pressed={net === k} onClick={() => setTarget(k)} data-testid={`deploy-net-${k}`}>
              {NETWORKS[k].name}
            </button>
          ))}
        </div>
        <h2 className="h-card mt-6">SemvioDealRoom</h2>
        <p className="small mt-2">No constructor arguments, no owner. Creation code sha256 {artifacts.contracts.SemvioDealRoom.sha256.slice(0, 16)}…</p>
        <button type="button" className="btn btn-white btn-lg mt-5 w-full" disabled={Boolean(busy)} onClick={() => deploy("room")} data-testid="deploy-submit">
          {!address ? "Connect wallet" : !onChain ? `Switch to ${target.name}` : busy === "room" ? "Confirm in wallet…" : `Deploy on ${target.name}`}
        </button>
        {net === "testnet" ? (
          <>
            <h2 className="h-card mt-8">Test dollar (testnet only)</h2>
            <p className="small mt-2">SemvioPracticeToken &quot;Semvio Test Dollar&quot; (tUSD, 6 decimals). Anyone may mint up to 100,000 per call. No value.</p>
            <button type="button" className="btn btn-dark mt-4 w-full" disabled={Boolean(busy)} onClick={() => deploy("token")} data-testid="deploy-token">
              {busy === "token" ? "Confirm in wallet…" : "Deploy the test dollar"}
            </button>
          </>
        ) : null}
        {msg ? (
          <p className="rq-alert mt-3" role="status">
            {msg}
          </p>
        ) : null}
        {room ? (
          <div className="mt-4 text-[12.5px] leading-relaxed" data-testid="deploy-done">
            <p>Deployed on {target.name}.</p>
            <p className="break-all">
              Address{" "}
              <a className="underline" href={explorerAddress(room.address, net)} target="_blank" rel="noreferrer">
                {room.address}
              </a>
              <br />
              Tx{" "}
              <a className="underline" href={explorerTx(room.tx, net)} target="_blank" rel="noreferrer">
                {room.tx}
              </a>{" "}
              · block {room.block}
            </p>
            <p className="mt-2">
              Paste into src/config/contracts.ts ({net}): <code className="break-all">{`room: "${room.address}", block: ${room.block}, tx: "${room.tx}"`}</code>. Then run{" "}
              <code className="break-all">
                npm run verify-deployment -- --room {room.address} --room-tx {room.tx}
                {net === "testnet" ? " --testnet" : ""}
              </code>{" "}
              and verify the source with the kit in referensi/explorer.
            </p>
          </div>
        ) : null}
        {token ? (
          <p className="mt-4 break-all text-[12.5px]" data-testid="deploy-token-done">
            Test dollar at {token.address} (tx {token.tx}). Paste it as testToken for testnet in src/config/contracts.ts.
          </p>
        ) : null}
      </div>
      <div className="panel-line p-6">
        <h2 className="h-card">Before you deploy</h2>
        <ul className="small mt-3 grid list-disc gap-2 pl-5">
          <li>The room never holds a balance, has no payable function and no admin. It moves the two parties&apos; tokens only under their own ERC-20 allowances, in one settlement transaction.</li>
          <li>Unit, fuzz, invariant and Robinhood Chain fork tests and a written self-review exist, but no outside security review yet. Start on the testnet, then with small amounts.</li>
          <li>Measured deploy gas: {DEPLOY_GAS}, paid in ETH. Testnet ETH comes from {NETWORKS.testnet.faucet}.</li>
        </ul>
      </div>
    </div>
  );
}
