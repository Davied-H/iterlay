/// <reference types="vite/client" />

import type { ImageWorkbenchApi } from "@shared/workbench-client";

declare global {
  interface Window {
    imageWorkbench?: ImageWorkbenchApi;
  }
}
