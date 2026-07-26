import 'dotenv/config';
import { McpApplicationFactory } from '@nitrostack/core';
import { AppModule } from './app.module.js';

const DEBUG_MCP = process.env.DEBUG_MCP === '1';

function installStdioLogger() {
    if (!DEBUG_MCP) return;

    const log = (direction: string, data: string) => {
        const lines = data.split('\n').filter(l => l.trim());
        for (const line of lines) {
            if (line.startsWith('{') || line.startsWith('[')) {
                try {
                    const parsed = JSON.parse(line);
                    const method = parsed.method || '(response)';
                    const id = parsed.id ?? '-';
                    const hasTools = parsed.result?.tools ? `  ⚠️ result.tools[${parsed.result.tools.length}]` : '';
                    const hasContent = parsed.result?.content ? `  ✅ result.content[${parsed.result.content.length}]` : '';
                    console.error(`[MCP ${direction}] id=${id} method=${method}${hasTools}${hasContent}`);
                    if (parsed.result?.tools) {
                        console.error(`[MCP ${direction}]   ^ This is a tools/list response (tool catalog)`);
                    }
                } catch { /* not JSON-RPC */ }
            }
        }
    };

    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = function (chunk: any, ...args: any[]) {
        const str = typeof chunk === 'string' ? chunk : chunk.toString();
        log('OUT', str);
        return origWrite(chunk, ...args);
    } as any;

    const origPush = process.stdin.push.bind(process.stdin);
    process.stdin.on('data', (chunk: Buffer) => {
        log('IN ', chunk.toString());
    });
}

async function bootstrap() {
    installStdioLogger();

    // NitroStack defaults HOST to 'localhost' which is unreachable from
    // cloud reverse-proxies. Bind to all interfaces unless overridden.
    if (!process.env.HOST) {
        process.env.HOST = '0.0.0.0';
    }

    const server = await McpApplicationFactory.create(AppModule);
    await server.start();

    console.error(`[bootstrap] Server started — NODE_ENV=${process.env.NODE_ENV}, HOST=${process.env.HOST}, PORT=${process.env.PORT}, MCP_TRANSPORT_TYPE=${process.env.MCP_TRANSPORT_TYPE ?? '(auto)'}`);
}

bootstrap().catch((error) => {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
});
