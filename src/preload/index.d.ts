import type { VmexApi } from "../shared/types";

declare global {
  interface Window {
    vmex: VmexApi;
  }
}

export {};
