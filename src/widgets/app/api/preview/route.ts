import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';

/**
 * Find the output dir where the backend writes HTML (same as doc-assistant OUTPUT_DIR).
 * Checks templates/output and src/templates/output from cwd and parents.
 */
function findOutputDir(): string {
    const relPaths = ['templates/output', 'src/templates/output'];
    let dir = process.cwd();
    for (let i = 0; i < 8; i++) {
        for (const rel of relPaths) {
            const candidate = join(dir, rel);
            if (existsSync(candidate)) return candidate;
        }
        const parent = dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }
    for (const rel of [...relPaths, '../templates/output', '../../templates/output']) {
        const candidate = join(process.cwd(), rel);
        if (existsSync(candidate)) return candidate;
    }
    return join(process.cwd(), 'src', 'templates', 'output');
}

export function GET(req: NextRequest) {
    const name = req.nextUrl.searchParams.get('name');
    if (!name) {
        return new NextResponse('Missing ?name= parameter', { status: 400 });
    }

    const outputDir = findOutputDir();
    const htmlPath = join(outputDir, name + '.html');

    if (!existsSync(htmlPath)) {
        return new NextResponse(
            `<html><body style="font-family:sans-serif;padding:32px;color:#dc2626">
                <h2>Preview not available</h2>
                <p>HTML file not found at: <code>${htmlPath}</code></p>
                <p>CWD: <code>${process.cwd()}</code> — resolved output dir: <code>${outputDir}</code></p>
                <p>Make sure the document was generated first using fill_document_and_export_pdf.</p>
            </body></html>`,
            { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
    }

    const html = readFileSync(htmlPath, 'utf8');
    return new NextResponse(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
}
