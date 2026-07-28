/// <reference types="vite/client" />

interface Window {
  ethereum?: import("ethers").Eip1193Provider & {
    on?: (event: string, handler: (...args: unknown[]) => void) => void;
    removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
  };
}

interface ImportMetaEnv {
  readonly VITE_SEPOLIA_RPC_URL?: string;
  readonly VITE_CONTRACT_ADDRESS?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
