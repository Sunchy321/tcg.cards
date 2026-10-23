import { contextBridge, ipcRenderer } from 'electron';

import { HEALTH_CHANNEL, type DesktopBridge } from './contract';

const bridge: DesktopBridge = {
  runtime: {
    health: () => ipcRenderer.invoke(HEALTH_CHANNEL),
  },
};

contextBridge.exposeInMainWorld('desktop', bridge);
