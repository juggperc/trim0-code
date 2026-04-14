import { contextBridge, ipcRenderer } from "electron";
import type {
  AgentEvent,
  McpAuthMode,
  McpValidateResult,
  SaveAutomationInput,
  SaveMcpServerInput,
  SaveProviderInput,
  Trim0DesktopApi,
} from "../shared/types.js";

const api: Trim0DesktopApi = {
  bootstrap: () => ipcRenderer.invoke("bootstrap"),
  openFolder: () => ipcRenderer.invoke("workspace:open"),
  createChat: () => ipcRenderer.invoke("chat:create"),
  deleteChat: (sessionId: string) => ipcRenderer.invoke("chat:delete", sessionId),
  prefetchChat: (sessionId) => ipcRenderer.invoke("chat:prefetch", sessionId),
  sendMessage: (input) => ipcRenderer.invoke("agent:send", input),
  saveProvider: (input: SaveProviderInput) => ipcRenderer.invoke("provider:save", input),
  saveTrim0License: (licenseKey: string, authMode: McpAuthMode) =>
    ipcRenderer.invoke("trim0:license", licenseKey, authMode),
  validateTrim0Connection: () => ipcRenderer.invoke("trim0:validate") as Promise<McpValidateResult>,
  saveMcpServer: (input: SaveMcpServerInput) => ipcRenderer.invoke("mcp:save", input),
  discoverMcpTools: (serverId: string) => ipcRenderer.invoke("mcp:discover", serverId),
  saveAutomation: (input: SaveAutomationInput) => ipcRenderer.invoke("automation:save", input),
  deleteAutomation: (id: string) => ipcRenderer.invoke("automation:delete", id),
  runAutomation: (id: string) => ipcRenderer.invoke("automation:run", id),
  fetchModels: () => ipcRenderer.invoke("provider:models"),
  onAgentEvent: (listener: (event: AgentEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: AgentEvent) => {
      listener(payload);
    };
    ipcRenderer.on("agent:event", handler);
    return () => ipcRenderer.removeListener("agent:event", handler);
  },
  confirmAction: (confirmationId: string, approved: boolean) =>
    ipcRenderer.invoke("agent:confirm", confirmationId, approved),
};

contextBridge.exposeInMainWorld("trim0", api);
