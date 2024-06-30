// electron.js
const { app, BrowserWindow, protocol } = require('electron');
// import { app, BrowserWindow } from 'electron.mjd';
const path = require('path');
// import path from 'path';
const url = require('url');
// // const isDev = require('electron-is-dev');
// import isDev from 'electron-is-dev';

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    titleBarStyle: 'hidden',
    webPreferences: {
      nodeIntegration: true,
    },
  });

  // const pyURL = url.format({
  //   pathname: path.join(__dirname, '../entrypoint'),
  //   protocol: 'file:',
  //   slashes: true,
  // });
  // var subpy = require( "child_process" ).spawn(pyURL);
  // subpy.stdout.pipe(process.stdout);

  const startURL = 'http://localhost:3000';
  // console.log('dirname: ', __dirname);
  // const startURL = url.format({
  //   pathname: path.join(__dirname, 'index.html'),
  //   protocol: 'file:',
  //   slashes: true,
  // });

  // console.log('startURL: ', startURL);
  mainWindow.loadURL(startURL);
  // mainWindow.loadFile('build/index.html');

  mainWindow.on('closed', () => {
    mainWindow = null;
    // subpy.kill('SIGINT');
  });
}

// function setupLocalFilesNormalizerProxy() {
//   protocol.registerHttpProtocol(
//     "file",
//     (request, callback) => {
//       const url = request.url.substr(8);
//       callback({ path: path.normalize(`${__dirname}/${url}`) });
//     },
//     (error) => {
//       if (error) console.error("Failed to register protocol");
//     },
//   );
// }

app.on('ready', () => {
  // setupLocalFilesNormalizerProxy();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});