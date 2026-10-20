// Lets TypeScript accept side-effect CSS imports like `import './globals.css'`.
// Newer TypeScript versions (e.g. the one bundled with VS Code) flag these as
// error 2882 when no declaration exists.
declare module '*.css';
