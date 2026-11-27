import { ipcMain } from "electron";
import { registerBoardCommands, type BoardIpcDependencies } from "./board-commands.js";

export function registerBoardIpc(dependencies: BoardIpcDependencies): void {
  registerBoardCommands(dependencies, (channel, handler) => ipcMain.handle(channel, handler));
}
