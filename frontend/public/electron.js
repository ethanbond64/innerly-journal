// electron.js
const { app, BrowserWindow, protocol } = require('electron');
// import { app, BrowserWindow } from 'electron.mjd';
const path = require('path');
// import path from 'path';
const url = require('url');
const fs = require('fs');
const asar = require('asar');
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

  const pyURL = url.format({
    pathname: path.join(__dirname, '../build/entrypoint'),
    protocol: 'file:',
    slashes: true,
  });

  // const userDataPath = app.getPath('userData');
  // const asarPath = path.join(process.resourcesPath, 'app.asar');
  // const binaryPathInAsar = 'build/entrypoint'; // Adjust the path inside your ASAR
  // const binaryDestinationPath = path.join(userDataPath, 'entrypoint');

  // // Extract binary from ASAR
  // asar.extractFile(asarPath, binaryPathInAsar, binaryDestinationPath);

  // // Make the binary executable (if necessary, for Unix-based systems)
  // fs.chmodSync(binaryDestinationPath, 0o755);


  copyFileOutsideOfElectronAsar('/build/entrypoint', app.getPath('userData') + '/entrypoint');
  const logFilePath = path.join('/Users/ethanbond/Desktop', 'electron.log');
  // fs.appendFileSync(logFilePath, `Userpath: ${app.getPath('userData')}`);

  // const newExePath = app.getPath('userData').replace(/(\s+)/g, '\\$1') + '/entrypoint';
  // const newExePath = url.format({
  //   pathname: path.join(app.getPath('userData'), 'entrypoint'),
  //   protocol: 'file:',
  //   slashes: true,
  // });


  fs.chmodSync(app.getPath('userData') + '/entrypoint', '755');

  // const newExePath = url.format({
  //   pathname: path.join(app.getPath('userData'), 'entrypoint'),
  //   protocol: 'file:',
  //   slashes: true,
  // });

  const newExePath = app.getPath('userData').replace(/(\s+)/g, '\\$1') + '/entrypoint';

  var subpy = require( "child_process" ).exec(newExePath, (error, stdout, stderr) => {
    if (error) {
      fs.appendFileSync(logFilePath, `Error executing command: ${error}`);
      return;
    }
    
    if (stderr) {
      fs.appendFileSync(logFilePath, `stderr: ${stderr}`);
      return;
    }
  
    fs.appendFileSync(logFilePath, `stdout: ${stdout}`);
  });
  // subpy.stdout.pipe(process.stdout);

  // const startURL = 'http://localhost:3000';
  console.log('dirname: ', __dirname);
  const startURL = url.format({
    pathname: path.join(__dirname, '../build/index.html'),
    protocol: 'file:',
    slashes: true,
  });

  console.log('startURL: ', startURL);
  mainWindow.loadURL(startURL);
  // mainWindow.loadFile('build/index.html');

  mainWindow.on('closed', () => {
    mainWindow = null;
    subpy.kill('SIGINT');
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

var copyFileOutsideOfElectronAsar = function (sourceInAsarArchive, destOutsideAsarArchive) {
  if (fs.existsSync(app.getAppPath() + "/" + sourceInAsarArchive)) {

      // file will be copied
      if (fs.statSync(app.getAppPath() + "/" + sourceInAsarArchive).isFile()) {

          let file = destOutsideAsarArchive 
          let dir = path.dirname(file);
          if (!fs.existsSync(dir)) {
              fs.mkdirSync(dir, { recursive: true });
          }

          fs.writeFileSync(file, fs.readFileSync(app.getAppPath() + "/" + sourceInAsarArchive));

      }

      // dir is browsed
      else if (fs.statSync(app.getAppPath() + "/" + sourceInAsarArchive).isDirectory()) {

          fs.readdirSync(app.getAppPath() + "/" + sourceInAsarArchive).forEach(function (fileOrFolderName) {

              copyFileOutsideOfElectronAsar(sourceInAsarArchive + "/" + fileOrFolderName, destOutsideAsarArchive + "/" + fileOrFolderName);
          });
      }
  }

}