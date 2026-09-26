// Build-time settings. `npm start` serves this file as is; the static builds
// (scripts/build-static.js) rewrite it for GitHub Pages.
// MODE: which transport links the screen and the phone (see net.js).
// ENV: 'local' | 'production' | 'staging' — staging shows a badge and keeps its
// own peer-to-peer rooms so it never mixes with the public version.
export const MODE = 'server';
export const ENV = 'local';
