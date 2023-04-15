// Modules to control application life and create native browser window
const { app, BrowserWindow, ipcMain, Menu, Tray, dialog, webContents, webFrameMain } = require('electron')
const { execSync } = require("child_process")
const iconv = require('iconv-lite')
const fs = require("fs")
const path = require('path')
const log = require("electron-log")
const md5 = require("md5")
const Store = require("electron-store")
const store = new Store()

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock)
    app.quit()
else {
    let mainWindow, isHiding = false
    let tray = null

    function createWindow() {
        // Create the browser window.
        mainWindow = new BrowserWindow({
            width: 480,
            height: 640,
            minWidth: 300,
            frame: false,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
                preload: path.join(__dirname, 'preload.js')
            },
            icon: path.join(__dirname, './logo.ico')
        })

        // 托盘
        if (!tray) {
            tray = new Tray('./logo.ico')
            const contextMenu = Menu.buildFromTemplate([
                {
                    label: "退出", click: function () {
                        mainWindow.destroy()
                        app.quit()
                    }
                },
            ])
            tray.setToolTip('Vool!')
            tray.setContextMenu(contextMenu)
            mainWindow.on('close', (e) => {
                e.preventDefault()  // 阻止退出程序
                mainWindow.setSkipTaskbar(true)   // 取消任务栏显示
                mainWindow.hide()    // 隐藏主程序窗口
                isHiding = true
            })
            tray.on("click", (e) => {
                mainWindow.setSkipTaskbar(false)
                mainWindow.show()
                isHiding = false
            })
        }

        // and load the index.html of the app.
        mainWindow.loadFile('./pages/index.html')

        function mkdirs(dirname, callback) {
            fs.exists(dirname, function (es) {
                if (es) {
                    callback()
                } else {
                    mkdirs(path.dirname(dirname), function () {
                        fs.mkdir(dirname, callback)
                    })
                }
            })
        }

        // 主程序

        let apps = []

        function parsePath(...p) {
            return path.join(app.getAppPath(), ...p)
        }

        function getAppsSync() {
            let res = []
            let appTemplate = {
                "AppName": "Vool App",
                "AppDescription": "An App for Vool",
                "AppAuthor": "yemaster",
                "AppWindowSettings": {
                    frame: false,
                    width: 480,
                    height: 600,
                    icon: "./logo.ico"
                }

            }
            // 先检测 extends 文件夹有没有
            if (!fs.existsSync("./extends")) {
                fs.mkdirSync("./extends")
            }
            // 遍历全部的目录，并获取app
            let dirs = fs.readdirSync("./extends")
            for (let i in dirs) {
                let t = fs.statSync(parsePath("./extends", dirs[i]))
                if (t.isDirectory()) {
                    if (fs.existsSync(parsePath("./extends", dirs[i], "app.json"))) {
                        let appInfo = JSON.parse(fs.readFileSync(parsePath("./extends", dirs[i], "app.json")))
                        // 验证 AppId 是否与目录名一致
                        if ("AppId" in appInfo && "AppVersion" in appInfo && appInfo.AppId == dirs[i]) {
                            for (let j in appTemplate) {
                                if (!(j in appInfo))
                                    appInfo[j] = appTemplate[j]
                            }
                            for (let j in appInfo.AppFiles) {
                                appInfo.AppFiles[j] = path.join(app.getAppPath(), "extends", dirs[i], appInfo.AppFiles[j])
                            }
                            /*if (fs.existsSync(parsePath("./extends", dirs[i], "preload.js"))) {
                                appInfo.AppWindowSettings.webPreferences = {}
                                appInfo.AppWindowSettings.webPreferences.preload = parsePath("./extends", dirs[i], "preload.js")
                            }*/
                            appInfo.AppWindowSettings.webPreferences = {}
                            appInfo.AppWindowSettings.webPreferences.preload = parsePath("./extendsPreload.js")
                            res.push(appInfo)
                        }
                    }
                }
            }
            return res
        }
        apps = getAppsSync() // 先获取App列表

        // 处理事件
        let appWindows = []

        //有关store的事件
        ipcMain.on("store-set", (e, k, v) => {
            store.set(k, v)
        })
        ipcMain.on("store-get", (e, k) => {
            e.reply("store-get-receive", store.get(k))
        })
        ipcMain.on("store-delete", (e, k) => {
            store.delete(k)
        })
        ipcMain.on("store-clear", (e, k) => {
            store.clear()
        })
        function getFrameWindowById(id) {
            let p = appWindows.find(item => item.id == id) || -1
            if (p === -1)
                return mainWindow
            else
                return p.w
        }
        ipcMain.on('window-min', function (e) {
            getFrameWindowById(e.senderFrame.name).minimize();
        })
        ipcMain.on('window-max', function (e) {
            let w = getFrameWindowById(e.senderFrame.name)
            if (w.isMaximized()) {
                w.restore();
            } else {
                w.maximize();
            }
        })
        ipcMain.on('window-close', function (e) {
            getFrameWindowById(e.senderFrame.name).close();
        })
        ipcMain.on('window-reload', function (e) {
            getFrameWindowById(e.senderFrame.name).reload();
        })
        ipcMain.on('window-debug', function (e) {
            e.sender.toggleDevTools();
        })
        ipcMain.on('openFileDialog', function (e, p) {
            dialog.showOpenDialog(JSON.parse(p)).then((result) => {
                e.reply("onFileResult", result)
            })
        })
        mainWindow.on('maximize', () => {
            mainWindow.webContents.send('mainWin-max', true)
        })
        mainWindow.on('unmaximize', () => {
            mainWindow.webContents.send('mainWin-max', false)
        })
        mainWindow.webContents.on("did-create-window", (w, d) => {
            appWindows.push({ id: d.frameName, w })
            w.on('maximize', () => {
                w.webContents.send('mainWin-max', true)
            })
            w.on('unmaximize', () => {
                w.webContents.send('mainWin-max', false)
            })
            w.on("close", () => {
                appWindows = appWindows.filter(item => item.id != d.frameName)
            })
        })
        ipcMain.on('getApps', function () {
            mainWindow.webContents.send("updateAppList", apps)
        })

        mainWindow.webContents.setWindowOpenHandler(({ url }) => {
            url = url.replace(/\\/g, "/")
            let t = -1
            for (let i in apps) {
                if (url.indexOf(parsePath("extends", apps[i]["AppId"]).replace(/\\/g, "/")) != -1) {
                    t = i
                    break
                }
            }
            if (t !== -1) {
                return {
                    action: 'allow',
                    overrideBrowserWindowOptions: apps[t]["AppWindowSettings"]
                }
            }
            return { action: 'deny' }
        })

    }

    // This method will be called when Electron has finished
    // initialization and is ready to create browser windows.
    // Some APIs can only be used after this event occurs.
    app.whenReady().then(() => {
        createWindow()
        app.on('activate', function () {
            // On macOS it's common to re-create a window in the app when the
            // dock icon is clicked and there are no other windows open.
            if (BrowserWindow.getAllWindows().length === 0) createWindow()
        })
    })

    // Quit when all windows are closed, except on macOS. There, it's common
    // for applications and their menu bar to stay active until the user quits
    // explicitly with Cmd + Q.
    app.on('window-all-closed', function () {
        if (process.platform !== 'darwin') app.quit()
    })

    app.on('second-instance', () => {
        if (mainWindow) {
            if (isHiding)
                mainWindow.show()
            if (mainWindow.isMinimized())
                mainWindow.restore()
            mainWindow.focus()
        }
    })

    // In this file you can include the rest of your app's specific main process
    // code. You can also put them in separate files and require them here.
}