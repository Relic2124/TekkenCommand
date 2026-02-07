import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react';

// 상대 base: 로컬에서는 localhost:3000/ 이 root, GitHub Pages에서는 .../TekkenCommand/ 이 root로 같은 빌드가 둘 다 동작
export default defineConfig({
    plugins: [react()],
    root: "./src",
    base: './',
    build: {
        outDir: "../dist"
    },
    server: {
        port: 3000
    }
})