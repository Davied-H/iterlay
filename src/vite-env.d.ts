/// <reference types="vite/client" />

import type { ImageWorkbenchApi } from "../electron/preload/preload";

declare global {
  interface Window {
    imageWorkbench?: ImageWorkbenchApi;
  }
}
