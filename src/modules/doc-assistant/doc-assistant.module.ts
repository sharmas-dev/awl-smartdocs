import { Module } from '@nitrostack/core';
import { DocAssistantService } from './doc-assistant.service.js';
import { DocAssistantTools } from './doc-assistant.tools.js';
import { DocAssistantPrompts } from './doc-assistant.prompt.js';
import { MongoService } from './mongo.service.js';

@Module({
    name: 'doc-assistant',
    description: `Legal document filling assistant. Collects variables group by group and generates PDFs.`,
    controllers: [DocAssistantTools, DocAssistantPrompts],
    providers: [DocAssistantService, MongoService],
})
export class DocAssistantModule {}
