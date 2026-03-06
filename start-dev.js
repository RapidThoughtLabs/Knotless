import { spawn } from 'child_process';
import waitOn from 'wait-on';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Resolve the local Electron binary directly — avoids npx / createRequire issues
const isWin = process.platform === 'win32';
const electronBin = path.join(__dirname, 'node_modules', '.bin', isWin ? 'electron.cmd' : 'electron');

// Start Vite dev server
console.log('Starting Vite dev server...');
const vite = spawn('npx', ['vite', '--port', '5173', '--strictPort'], {
    stdio: 'inherit',
    shell: true,
});

// Wait for Vite to be ready, then start Electron
waitOn({ resources: ['http://localhost:5173'], timeout: 60000 })
    .then(() => {
        console.log('Vite is ready. Starting Electron...');
        const electron = spawn(electronBin, ['.'], {
            stdio: 'inherit',
            shell: isWin,
        });

        electron.on('close', () => {
            vite.kill();
            process.exit(0);
        });
    })
    .catch((err) => {
        console.error('Error waiting for Vite:', err);
        vite.kill();
        process.exit(1);
    });

process.on('SIGINT', () => {
    vite.kill();
    process.exit(0);
});
