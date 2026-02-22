import { spawn } from 'child_process';
import waitOn from 'wait-on';

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
        const electron = spawn('npx', ['electron', '.'], {
            stdio: 'inherit',
            shell: true,
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
