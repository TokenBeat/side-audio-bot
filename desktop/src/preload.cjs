const { contextBridge, ipcRenderer } = require('electron')

function sendPoint(channel, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return
  ipcRenderer.send(channel, { x, y })
}

contextBridge.exposeInMainWorld('sideAudioBotDesktop', {
  dragStart: (x, y) => sendPoint('side-audio-bot:drag-start', x, y),
  dragMove: (x, y) => sendPoint('side-audio-bot:drag-move', x, y),
  dragEnd: () => ipcRenderer.send('side-audio-bot:drag-end'),
  setTaskCardCount: count => ipcRenderer.send(
    'side-audio-bot:task-card-count',
    count,
  ),
  onTaskCardPlacement: callback => {
    if (typeof callback !== 'function') return () => {}
    const listener = (_event, layout) => {
      callback({
        placement: layout?.placement === 'above' ? 'above' : 'below',
        orbOffsetX: Number.isFinite(layout?.orbOffsetX)
          ? layout.orbOffsetX
          : 0,
      })
    }
    ipcRenderer.on('side-audio-bot:task-card-placement', listener)
    return () => ipcRenderer.removeListener(
      'side-audio-bot:task-card-placement',
      listener,
    )
  },
  openSettings: () => ipcRenderer.send('side-audio-bot:open-settings'),
  loadSurface: () => ipcRenderer.invoke('side-audio-bot:surface-load'),
  setSurface: mode => ipcRenderer.invoke(
    'side-audio-bot:surface-set',
    mode,
  ),
  setConversationSession: sessionId => ipcRenderer.invoke(
    'side-audio-bot:conversation-session-set',
    sessionId,
  ),
  enterHide: options => ipcRenderer.invoke(
    'side-audio-bot:enter-hide',
    options,
  ),
  wake: () => ipcRenderer.send('side-audio-bot:wake'),
  acceptWakeWordAudio: (audio, sampleRate) => ipcRenderer.send(
    'side-audio-bot:wake-word-audio',
    { audio, sampleRate },
  ),
  lifecycleReady: () => ipcRenderer.send('side-audio-bot:lifecycle-ready'),
  loadLifecycle: () => ipcRenderer.invoke('side-audio-bot:lifecycle-load'),
  pauseWakeShortcut: () => ipcRenderer.invoke(
    'side-audio-bot:wake-shortcut-pause',
  ),
  resumeWakeShortcut: () => ipcRenderer.invoke(
    'side-audio-bot:wake-shortcut-resume',
  ),
  onLifecycle: callback => {
    if (typeof callback !== 'function') return () => {}
    const listener = (_event, lifecycle) => callback(lifecycle)
    ipcRenderer.on('side-audio-bot:lifecycle', listener)
    return () => ipcRenderer.removeListener(
      'side-audio-bot:lifecycle',
      listener,
    )
  },
  onClientSettings: callback => {
    if (typeof callback !== 'function') return () => {}
    const listener = (_event, settings) => callback(settings || {})
    ipcRenderer.on('side-audio-bot:client-settings', listener)
    return () => ipcRenderer.removeListener(
      'side-audio-bot:client-settings',
      listener,
    )
  },
  loadSettings: () => ipcRenderer.invoke('side-audio-bot:settings-load'),
  loadRuntimeStatus: () => ipcRenderer.invoke(
    'side-audio-bot:settings-runtime-status',
  ),
  detectBackends: options => ipcRenderer.invoke(
    'side-audio-bot:settings-detect-backends',
    { force: options?.force === true },
  ),
  installBackend: backend => ipcRenderer.invoke(
    'side-audio-bot:backend-install',
    { backend },
  ),
  configureBackend: backend => ipcRenderer.invoke(
    'side-audio-bot:backend-configure',
    { backend },
  ),
  onBackendInstallProgress: callback => {
    if (typeof callback !== 'function') return () => {}
    const listener = (_event, progress) => callback(progress)
    ipcRenderer.on('side-audio-bot:backend-install-progress', listener)
    return () => ipcRenderer.removeListener(
      'side-audio-bot:backend-install-progress',
      listener,
    )
  },
  loadUpdaterStatus: () => ipcRenderer.invoke(
    'side-audio-bot:updater-status',
  ),
  checkUpdates: () => ipcRenderer.invoke('side-audio-bot:updater-check'),
  installUpdate: () => ipcRenderer.invoke('side-audio-bot:updater-install'),
  openLogs: () => ipcRenderer.invoke('side-audio-bot:open-logs'),
  onUpdaterStatus: callback => {
    if (typeof callback !== 'function') return () => {}
    const listener = (_event, status) => callback(status)
    ipcRenderer.on('side-audio-bot:updater-status', listener)
    return () => ipcRenderer.removeListener(
      'side-audio-bot:updater-status',
      listener,
    )
  },
  saveSettings: settings => ipcRenderer.invoke(
    'side-audio-bot:settings-save',
    settings,
  ),
  importSkin: () => ipcRenderer.invoke('side-audio-bot:skin-import'),
  removeSkin: id => ipcRenderer.invoke('side-audio-bot:skin-remove', id),
  setNodePath: nodePath => ipcRenderer.invoke(
    'side-audio-bot:set-node-path',
    nodePath,
  ),
  openExternal: url => {
    if (typeof url !== 'string') return
    ipcRenderer.send('side-audio-bot:open-external', url)
  },
  quit: () => ipcRenderer.send('side-audio-bot:quit'),
})
