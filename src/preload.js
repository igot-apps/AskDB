const { contextBridge, ipcRenderer } = require('electron');

const call = (ch) => (...args) => ipcRenderer.invoke(ch, ...args);

contextBridge.exposeInMainWorld('api', {
  getSettings: call('settings:get'),
  saveSettings: call('settings:save'),
  testConnection: call('conn:test'),
  addConnection: call('conn:add'),
  removeConnection: call('conn:remove'),
  setReadOnly: call('conn:setReadOnly'),
  connect: call('db:connect'),
  describe: call('db:describe'),
  query: call('db:query'),
  propose: call('db:propose'),
  apply: call('db:apply'),
  cancel: call('db:cancel'),
  getHistory: call('history:get'),
  saveHistory: call('history:save'),
  openExternal: call('open:external'),
});
