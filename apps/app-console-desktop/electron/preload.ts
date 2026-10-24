import { contextBridge, ipcRenderer } from 'electron';

import { HEALTH_CHANNEL, SETTINGS_CHANNEL, CLOSE_CHANNEL, CLOSE_REQUESTED, type DesktopBridge } from './contract';

const bridge: DesktopBridge = {
  settings: {
    read: () => ipcRenderer.invoke(SETTINGS_CHANNEL, { action: 'read' }),
    update: (key, value) => ipcRenderer.invoke(SETTINGS_CHANNEL, { action: 'update', key, value }),
    saveJson: (text, revision) => ipcRenderer.invoke(SETTINGS_CHANNEL, { action: 'json', text, revision }),
    setSecret: (key, value) => ipcRenderer.invoke(SETTINGS_CHANNEL, { action: 'secret', key, value }),
    pickDirectory: current => ipcRenderer.invoke(SETTINGS_CHANNEL, { action: 'directory', current }),
    openDirectory: () => ipcRenderer.invoke(SETTINGS_CHANNEL, { action: 'openDirectory' }),
    paths: game => ipcRenderer.invoke(SETTINGS_CHANNEL, { action: 'paths', game }),
    setDirty: value => ipcRenderer.invoke(CLOSE_CHANNEL, { action: 'dirty', value }),
    resolveClose: choice => ipcRenderer.invoke(CLOSE_CHANNEL, { action: 'resolve', choice }),
    onCloseRequested(listener) {
      const handler = () => listener();
      ipcRenderer.on(CLOSE_REQUESTED, handler);
      return () => ipcRenderer.removeListener(CLOSE_REQUESTED, handler);
    },
  },
  runtime: {
    health: () => ipcRenderer.invoke(HEALTH_CHANNEL),
  },
};

contextBridge.exposeInMainWorld('desktop', bridge);
