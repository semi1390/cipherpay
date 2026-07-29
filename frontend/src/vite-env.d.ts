/// <reference types="vite/client" />

interface Window {
  ethereum?: import("ethers").Eip1193Provider & {
    on?: (event: string, handler: (...args: unknown[]) => void) => void;
    removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
  };
}

interface ImportMetaEnv {
  readonly VITE_ARBITRUM_RPC_URL?: string;
  readonly VITE_TREASURY_ADDRESS?: string;
  readonly VITE_ARBISCAN_API_KEY?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}