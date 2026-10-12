declare module "libavoid-js" {
  export const AvoidLib: {
    load(wasmUrl?: string): Promise<void>;
    getInstance(): unknown;
  };
}

declare module "/node_modules/libavoid-js/dist/libavoid.wasm?url" {
  const url: string;
  export default url;
}
