// Copies files Vite doesn't know about (nothing links to them from an HTML
// entry) into dist/ after each build: the manifest and the icon set.
import { cpSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = dirname(fileURLToPath(import.meta.url));
cpSync(join(root, 'manifest.json'), join(root, 'dist', 'manifest.json'));
cpSync(join(root, 'icons'), join(root, 'dist', 'icons'), { recursive: true });
console.log('copied manifest.json and icons/ into dist/');
