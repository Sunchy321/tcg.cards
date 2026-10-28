import { contextBridge, ipcRenderer } from 'electron';

import {
  API_CANCEL_CHANNEL,
  API_CHANNEL,
  API_STREAM_CHANNEL,
  AUTH_CHANNEL,
  HEALTH_CHANNEL,
  OPEN_SETTINGS,
  SETTINGS_CHANNEL,
  CLOSE_CHANNEL,
  CLOSE_REQUESTED,
  EXTERNAL_OPEN_CHANNEL,
  FILE_DIALOG_CHANNEL,
  TASK_CHANNEL,
  TASK_CHANGED_CHANNEL,
  type DesktopBridge,
  type DesktopApiStreamEvent,
  type TaskView,
} from './contract';

let settingsListener: (() => void) | undefined;
let settingsRequested = false;
// Keep menu requests received after document load but before Nuxt mounts.
ipcRenderer.on(OPEN_SETTINGS, () => {
  if (settingsListener) settingsListener();
  else settingsRequested = true;
});

const bridge: DesktopBridge = {
  onOpenSettings(listener) {
    settingsListener = listener;
    if (settingsRequested) {
      settingsRequested = false;
      listener();
    }
    return () => {
      if (settingsListener === listener) settingsListener = undefined;
    };
  },
  auth: {
    status:             () => ipcRenderer.invoke(AUTH_CHANNEL, { action: 'status' }),
    profile:            () => ipcRenderer.invoke(AUTH_CHANNEL, { action: 'profile' }),
    login:              (baseUrl, username, password) => ipcRenderer.invoke(AUTH_CHANNEL, { action: 'login', baseUrl, username, password }),
    logout:             () => ipcRenderer.invoke(AUTH_CHANNEL, { action: 'logout' }),
    listMagicRuleFiles: () => ipcRenderer.invoke(AUTH_CHANNEL, { action: 'listMagicRuleFiles' }),
  },
  external: {
    open: url => ipcRenderer.invoke(EXTERNAL_OPEN_CHANNEL, url),
  },
  files: {
    pickZipArchive: () => ipcRenderer.invoke(FILE_DIALOG_CHANNEL, { action: 'zipArchive' }),
  },
  settings: {
    read:          () => ipcRenderer.invoke(SETTINGS_CHANNEL, { action: 'read' }),
    update:        (key, value) => ipcRenderer.invoke(SETTINGS_CHANNEL, { action: 'update', key, value }),
    saveJson:      (text, revision) => ipcRenderer.invoke(SETTINGS_CHANNEL, { action: 'json', text, revision }),
    setSecret:     (key, value) => ipcRenderer.invoke(SETTINGS_CHANNEL, { action: 'secret', key, value }),
    pickDirectory: current => ipcRenderer.invoke(SETTINGS_CHANNEL, { action: 'directory', current }),
    openDirectory: () => ipcRenderer.invoke(SETTINGS_CHANNEL, { action: 'openDirectory' }),
    paths:         game => ipcRenderer.invoke(SETTINGS_CHANNEL, { action: 'paths', game }),
    setDirty:      value => ipcRenderer.invoke(CLOSE_CHANNEL, { action: 'dirty', value }),
    resolveClose:  choice => ipcRenderer.invoke(CLOSE_CHANNEL, { action: 'resolve', choice }),
    onCloseRequested(listener) {
      const handler = () => listener();
      ipcRenderer.on(CLOSE_REQUESTED, handler);
      return () => ipcRenderer.removeListener(CLOSE_REQUESTED, handler);
    },
  },
  runtime: {
    health: () => ipcRenderer.invoke(HEALTH_CHANNEL),
  },
  api: {
    request: input => ipcRenderer.invoke(API_CHANNEL, input),
    cancel:  requestId => ipcRenderer.send(API_CANCEL_CHANNEL, requestId),
    onStream(listener) {
      const handler = (_event: Electron.IpcRendererEvent, value: DesktopApiStreamEvent) => listener(value);
      ipcRenderer.on(API_STREAM_CHANNEL, handler);
      return () => ipcRenderer.removeListener(API_STREAM_CHANNEL, handler);
    },
  },
  tasks: {
    start:         (taskType, params) => ipcRenderer.invoke(TASK_CHANNEL, { action: 'start', taskType, params }),
    retry:         taskRunId => ipcRenderer.invoke(TASK_CHANNEL, { action: 'retry', taskRunId }),
    control:       (taskRunId, kind) => ipcRenderer.invoke(TASK_CHANNEL, { action: 'control', taskRunId, kind }),
    latestByTypes: taskTypes => ipcRenderer.invoke(TASK_CHANNEL, { action: 'latestByTypes', taskTypes }),
    list:          () => ipcRenderer.invoke(TASK_CHANNEL, { action: 'list' }),
    get:           taskRunId => ipcRenderer.invoke(TASK_CHANNEL, { action: 'get', taskRunId }),
    onChange(listener) {
      const handler = (_event: Electron.IpcRendererEvent, task: TaskView) => listener(task);
      ipcRenderer.on(TASK_CHANGED_CHANNEL, handler);
      return () => ipcRenderer.removeListener(TASK_CHANGED_CHANNEL, handler);
    },
  },
};

contextBridge.exposeInMainWorld('desktop', bridge);
