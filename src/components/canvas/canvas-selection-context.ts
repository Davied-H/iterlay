import { createContext } from "react";

/** Shared by all node types so batch actions own the toolbar area. */
export const CanvasSelectionCountContext = createContext(0);
