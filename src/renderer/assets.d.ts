// Vite resolves imported SVG files to URLs (small files are inlined as data URLs).
declare module '*.svg' {
  const url: string;
  export default url;
}
