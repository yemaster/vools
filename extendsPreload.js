const ipc = require('electron').ipcRenderer
const { contextBridge, shell, dialog } = require('electron')
const { exec } = require('child_process')

contextBridge.exposeInMainWorld('store', {
    get: (k, cb) => {
        ipc.send("store-get", k)
        ipc.on("store-get-receive", cb)
    },
    set: (k, v) => ipc.send("store-set", k, v),
    delete: (k) => ipc.send("store-delete", k),
    clear: () => ipc.send("store-clear")

})

contextBridge.exposeInMainWorld('dialog', {
    askFile: (p, cb) => {
        ipc.send("openFileDialog", JSON.stringify(p))
        ipc.on("onFileResult", cb)
    }
})

contextBridge.exposeInMainWorld('childProcess', {
    run: (command, callback) => exec(command, callback)
})

contextBridge.exposeInMainWorld('windowSize', {
    minimize: () => ipc.send('window-min'),
    maximize: () => ipc.send('window-max'),
    onWindowMaximize: (callback) => ipc.on('mainWin-max', callback)
})