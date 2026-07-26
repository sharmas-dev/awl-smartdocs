import { McpApp, Module, ConfigModule, JWTModule } from '@nitrostack/core';
import { DocAssistantModule } from './modules/doc-assistant/doc-assistant.module.js';

JWTModule.forRoot({
    secretEnvVar: 'JWT_SECRET',
    audience: process.env.JWT_AUDIENCE,
    issuer: process.env.JWT_ISSUER,
    expiresIn: process.env.JWT_EXPIRES_IN ?? '24h',
});

/**
 * Root Application Module
 */
@McpApp({
    module: AppModule,
    server: {
        name: 'doc-assistant-mcp',
        version: '1.0.0'
    },
    logging: {
        level: 'info'
    }
})
@Module({
    name: 'doc-assistant-mcp',
    description: 'Document assistant MCP server which can fill documents and export them as PDFs',
    imports: [
        ConfigModule.forRoot(),
        DocAssistantModule,
    ],
})
export class AppModule { }
