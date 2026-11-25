"use client";

import { BRAND } from "@/config/brand";
import { NETWORKS } from "@/config/networks";
import { WALLETCONNECT_PROJECT_ID } from "@/config/wallets";

/* WalletConnect as a plain EIP-1193 provider, so the rest of the wallet code
   treats it like any browser wallet. The SDK and its QR dialog are large, so
   they load only when someone picks WalletConnect or a saved session is resumed. */

type Handler = (...args: unknown[]) => void;

type WcProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  enable: () => Promise<string[]>;
  disconnect: () => Promise<void>;
  on: (event: string, handler: Handler) => void;
  removeListener: (event: string, handler: Handler) => void;
};

let loading: Promise<WcProvider> | null = null;

function load(): Promise<WcProvider> {
  loading ??= import("@walletconnect/ethereum-provider").then(({ EthereumProvider }) =>
    EthereumProvider.init({
      projectId: WALLETCONNECT_PROJECT_ID,
      optionalChains: [NETWORKS.mainnet.id, NETWORKS.testnet.id],
      rpcMap: { [NETWORKS.mainnet.id]: NETWORKS.mainnet.publicRpc, [NETWORKS.testnet.id]: NETWORKS.testnet.publicRpc },
      showQrModal: true,
      metadata: {
        name: BRAND.name,
        description: BRAND.description,
        url: window.location.origin,
        icons: [`${window.location.origin}/icon.png`],
      },
    }) as unknown as Promise<WcProvider>,
  );
  // A failed start (offline, bad project id) must not stick: the next click retries.
  loading.catch(() => {
    loading = null;
  });
  return loading;
}

/**
 * EIP-1193 facade. `eth_requestAccounts` opens the QR dialog, and revoking
 * permissions ends the WalletConnect session.
 */
export const walletConnectProvider = {
  async request({ method, params }: { method: string; params?: unknown[] }) {
    const provider = await load();
    if (method === "eth_requestAccounts") return provider.enable();
    if (method === "wallet_revokePermissions") {
      await provider.disconnect();
      return null;
    }
    return provider.request({ method, params });
  },
  on(event: string, handler: Handler) {
    void load().then((provider) => provider.on(event, handler));
  },
  removeListener(event: string, handler: Handler) {
    void load().then((provider) => provider.removeListener(event, handler));
  },
};
