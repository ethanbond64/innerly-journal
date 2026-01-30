const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const path = require('path');

let mainWindow;
let pythonProcess;

function startPythonProcess() {
  const executablePath = path.join(__dirname, 'entrypoint'); // adjust accordingly

  pythonProcess = spawn(executablePath, [], {
    cwd: path.dirname(executablePath),
    // optionally set env vars, etc.
  });

  pythonProcess.stdout.on('data', (data) => {
    console.log(`Python stdout: ${data}`);
  });

  pythonProcess.stderr.on('data', (data) => {
    console.error(`Python stderr: ${data}`);
  });

  pythonProcess.on('close', (code) => {
    console.error(`Python process exited with code ${code}`);
    // Optionally add a delay here to avoid a tight loop on crashes
    setTimeout(() => {
      console.log('Restarting Python process...');
      startPythonProcess();
    }, 1000);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true, // if needed
    },
  });

  // Load your React frontend (this could be a local file or a URL)
  mainWindow.loadURL('http://localhost:3000'); // or use loadFile('index.html') if pre-built
}

app.whenReady().then(() => {
  startPythonProcess();
  createWindow();
});

app.on('before-quit', () => {
  if (pythonProcess) {
    pythonProcess.kill();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
