import { createReadStream, existsSync, statSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const port = Number(process.env.PORT || 3000);
const host = process.env.HOSTNAME || '0.0.0.0';
const rootDir = join(process.cwd(), 'out');

const CONTENT_TYPES = {
    '.bcmap': 'application/octet-stream',
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
};

function safeJoin(pathname) {
    const decoded = decodeURIComponent(pathname.split('?')[0]);
    const normalized = normalize(decoded).replace(/^(\.\.[/\\])+/, '');
    return join(rootDir, normalized);
}

async function resolvePath(pathname) {
    const directPath = safeJoin(pathname);
    if (existsSync(directPath)) {
        const info = await stat(directPath);
        if (info.isDirectory()) {
            const indexPath = join(directPath, 'index.html');
            if (existsSync(indexPath)) {
                return indexPath;
            }
        } else {
            return directPath;
        }
    }

    const htmlPath = safeJoin(`${pathname}.html`);
    if (existsSync(htmlPath)) {
        return htmlPath;
    }

    const nestedIndexPath = safeJoin(join(pathname, 'index.html'));
    if (existsSync(nestedIndexPath)) {
        return nestedIndexPath;
    }

    return join(rootDir, '404.html');
}

createServer(async (req, res) => {
    try {
        const pathname = req.url || '/';
        const filePath = await resolvePath(pathname === '/' ? '/index.html' : pathname);

        if (!existsSync(filePath)) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Not found');
            return;
        }

        const ext = extname(filePath);
        const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';
        const fileStat = statSync(filePath);

        res.writeHead(filePath.endsWith('404.html') ? 404 : 200, {
            'Content-Length': fileStat.size,
            'Content-Type': contentType,
            'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
        });

        createReadStream(filePath).pipe(res);
    } catch {
        const message = await readFile(join(rootDir, '404.html')).catch(() => Buffer.from('Not found'));
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(message);
    }
}).listen(port, host, () => {
    console.log(`Serving static export from ${rootDir} at http://${host}:${port}`);
});
