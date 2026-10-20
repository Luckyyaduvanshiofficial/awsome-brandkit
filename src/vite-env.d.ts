/// <reference types="vite/client" />

import type { PocResults } from "./lab/types";

declare global {
  interface Window {
    __proofsheetPoc?: {
      runAll: (onProgress?: (stage: string) => void) => Promise<PocResults>;
      getResults: () => PocResults | null;
    };
    __proofsheetCanary?: string;
    __proofsheetCspViolations?: string[];
  }
}
