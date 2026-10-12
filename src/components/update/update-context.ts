import { createContext, useContext } from "react";
import type { UpdateChannel, UpdateStateSnapshot } from "@shared/app-update";

export interface UpdateContextValue {
  state: UpdateStateSnapshot | null;
  /** 手动检查是否进行中（用于画板库侧栏入口反馈）。 */
  checking: boolean;
  /** 是否有待处理的新版本（用于画板库侧栏状态提示）。 */
  hasUpdate: boolean;
  /** 打开更新面板；没有已知更新时会先触发一次手动检查。 */
  openUpdateCenter: () => void;
  /** 切换更新渠道（参与/退出开发者计划）。 */
  setChannel: (channel: UpdateChannel) => Promise<void>;
}

export const UpdateContext = createContext<UpdateContextValue>({
  state: null,
  checking: false,
  hasUpdate: false,
  openUpdateCenter: () => undefined,
  setChannel: async () => undefined
});

export function useUpdateCenter(): UpdateContextValue {
  return useContext(UpdateContext);
}
