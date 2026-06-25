const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  openTracker: () => ipcRenderer.invoke('open-tracker'),
  jiraOpenLogin: () => ipcRenderer.invoke('jira-open-login'),
  jiraFetchIssue: (issueKey) => ipcRenderer.invoke('jira-fetch-issue', issueKey),
  jiraCheckAuth: () => ipcRenderer.invoke('jira-check-auth'),
  jiraWriteSync: (data) => ipcRenderer.invoke('jira-write-sync', data),
  jiraReadSync: () => ipcRenderer.invoke('jira-read-sync'),
  onJiraAuthSuccess: (callback) => ipcRenderer.on('jira-auth-success', (event, data) => callback(data)),
  onOpenInSplit: (callback) => ipcRenderer.on('open-in-split', (event, url) => callback(url))
});
