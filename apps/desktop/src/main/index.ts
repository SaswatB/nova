import { electronApp, is, optimizer } from "@electron-toolkit/utils";
import { app, BrowserWindow, globalShortcut, ipcMain, shell } from "electron";
import Screenshots from "electron-screenshots";
import { join } from "path";

import icon from "../../resources/icon.png?asset";

const isDev = true;

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: isDev ? 1728 : undefined,
    height: isDev ? 1080 : undefined,
    fullscreen: !isDev,
    simpleFullscreen: !isDev,
    autoHideMenuBar: true,
    frame: false,
    transparent: true,
    skipTaskbar: true,
    movable: false,
    resizable: false,
    // focusable: false,
    ...(process.platform === "linux" ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      webSecurity: false,
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app
  .whenReady()
  .then(() => {
    // Set app user model id for windows
    electronApp.setAppUserModelId("com.electron");

    // Default open or close DevTools by F12 in development
    // and ignore CommandOrControl + R in production.
    // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
    app.on("browser-window-created", (_, window) => {
      optimizer.watchWindowShortcuts(window);
    });

    // IPC test
    ipcMain.on("ping", () => console.log("pong"));

    createWindow();

    app.on("activate", function () {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });

    const screenshots = new Screenshots({
      singleWindow: true,
      lang: {
        magnifier_position_label: "Position",
        operation_ok_title: "Ok",
        operation_cancel_title: "Cancel",
        operation_save_title: "Save",
        operation_redo_title: "Redo",
        operation_undo_title: "Undo",
        operation_mosaic_title: "Mosaic",
        operation_text_title: "Text",
        operation_brush_title: "Brush",
        operation_arrow_title: "Arrow",
        operation_ellipse_title: "Ellipse",
        operation_rectangle_title: "Rectangle",
      },
    });
    globalShortcut.register("ctrl+shift+a", () => {
      screenshots.startCapture().catch(console.error);
      screenshots.$view.webContents.openDevTools();
    });
    screenshots.on("ok", (_e, buffer, bounds) => {
      console.log("capture ok", buffer, bounds);
    });
    globalShortcut.register("esc", () => {
      if (screenshots.$win?.isFocused()) {
        void screenshots.endCapture();
      }
    });
  })
  .catch(console.error);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.
