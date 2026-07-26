import { LRUCache } from 'lru-cache';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getDb } from './mongo.service.js';

export interface SessionData {
    sessionId: string;
    userId: string;
    documentId: string;
    /** When set, `user_documents` row _id — used to update `link` exactly on confirm. */
    userDocumentId?: string;
    templateName: string;
    variables: Record<string, string | number>;
    completedGroups: string[];
    /** Ephemeral HTML preview in S3 (`previews/...`); removed when superseded or on confirm. */
    previewHtmlS3Key?: string;
    createdAt: string;
    updatedAt: string;
}

export interface SessionStore {
    get(sessionId: string): Promise<SessionData | null>;
    save(session: SessionData): Promise<void>;
    delete(sessionId: string): Promise<void>;
    dump(): {
        size: number;
        sessions: Array<{
            sessionId: string;
            userId: string;
            templateName: string;
            variableCount: number;
            completedGroups: string[];
            updatedAt: string;
        }>;
    };
}

function emptySession(sessionId: string): SessionData {
    const now = new Date().toISOString();
    return {
        sessionId,
        userId: '',
        documentId: '',
        templateName: '',
        variables: {},
        completedGroups: [],
        createdAt: now,
        updatedAt: now,
    };
}

const MAX_SESSIONS = 10_000;

export class LruSessionStore implements SessionStore {
    private cache: LRUCache<string, SessionData>;

    constructor() {
        this.cache = new LRUCache<string, SessionData>({
            max: MAX_SESSIONS,
        });
        console.error('[doc-assistant] Using in-memory LRU session store (max=' + MAX_SESSIONS + ', no TTL)');
    }

    async get(sessionId: string): Promise<SessionData | null> {
        const data = this.cache.get(sessionId) ?? null;
        console.log(`[lru-cache] GET "${sessionId}" → ${data ? `found (template="${data.templateName}", vars=${Object.keys(data.variables).length}, groups=${data.completedGroups.length})` : 'miss'} | cache size: ${this.cache.size}`);
        return data;
    }

    async save(session: SessionData): Promise<void> {
        session.updatedAt = new Date().toISOString();
        this.cache.set(session.sessionId, structuredClone(session));
        console.log(`[lru-cache] SET "${session.sessionId}" → template="${session.templateName}", vars=${Object.keys(session.variables).length}, groups=[${session.completedGroups.join(',')}] | cache size: ${this.cache.size}`);
    }

    async delete(sessionId: string): Promise<void> {
        this.cache.delete(sessionId);
        console.log(`[lru-cache] DEL "${sessionId}" | cache size: ${this.cache.size}`);
    }

    dump(): {
        size: number;
        sessions: Array<{
            sessionId: string;
            userId: string;
            templateName: string;
            variableCount: number;
            completedGroups: string[];
            updatedAt: string;
        }>;
    } {
        const sessions: Array<{
            sessionId: string;
            userId: string;
            templateName: string;
            variableCount: number;
            completedGroups: string[];
            updatedAt: string;
        }> = [];
        for (const [key, value] of this.cache.entries()) {
            sessions.push({
                sessionId: key,
                userId: value.userId,
                templateName: value.templateName,
                variableCount: Object.keys(value.variables).length,
                completedGroups: value.completedGroups,
                updatedAt: value.updatedAt,
            });
        }
        return { size: this.cache.size, sessions };
    }
}

type SessionIndexMap = Record<string, SessionData>;

export class FileSessionStore implements SessionStore {
    private cache = new Map<string, SessionData>();
    private readonly filePath: string;

    constructor(filePath: string) {
        this.filePath = filePath;
        this.load();
        console.error(
            `[doc-assistant] Using file-backed session store (${this.filePath}), loaded=${this.cache.size}`,
        );
    }

    private load() {
        try {
            if (!existsSync(this.filePath)) return;
            const raw = readFileSync(this.filePath, 'utf8').trim();
            if (!raw) return;
            const parsed = JSON.parse(raw) as SessionIndexMap;
            if (!parsed || typeof parsed !== 'object') return;
            for (const [sessionId, session] of Object.entries(parsed)) {
                if (!session || typeof session !== 'object') continue;
                this.cache.set(sessionId, session);
            }
        } catch (err) {
            console.error('[doc-assistant] Failed to load session file store, starting empty', err);
        }
    }

    private persist() {
        const parent = dirname(this.filePath);
        if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
        const snapshot: SessionIndexMap = {};
        for (const [k, v] of this.cache.entries()) snapshot[k] = v;
        const tempPath = `${this.filePath}.tmp`;
        writeFileSync(tempPath, JSON.stringify(snapshot), 'utf8');
        renameSync(tempPath, this.filePath);
    }

    async get(sessionId: string): Promise<SessionData | null> {
        const data = this.cache.get(sessionId) ?? null;
        return data ? structuredClone(data) : null;
    }

    async save(session: SessionData): Promise<void> {
        session.updatedAt = new Date().toISOString();
        this.cache.set(session.sessionId, structuredClone(session));
        this.persist();
    }

    async delete(sessionId: string): Promise<void> {
        this.cache.delete(sessionId);
        this.persist();
    }

    dump(): {
        size: number;
        sessions: Array<{
            sessionId: string;
            userId: string;
            templateName: string;
            variableCount: number;
            completedGroups: string[];
            updatedAt: string;
        }>;
    } {
        const sessions: Array<{
            sessionId: string;
            userId: string;
            templateName: string;
            variableCount: number;
            completedGroups: string[];
            updatedAt: string;
        }> = [];
        for (const [sessionId, value] of this.cache.entries()) {
            sessions.push({
                sessionId,
                userId: value.userId,
                templateName: value.templateName,
                variableCount: Object.keys(value.variables).length,
                completedGroups: value.completedGroups,
                updatedAt: value.updatedAt,
            });
        }
        return { size: this.cache.size, sessions };
    }
}

interface SessionDoc {
    _id: string;
    userId: string;
    documentId: string;
    userDocumentId?: string;
    templateName: string;
    variables: Record<string, string | number>;
    completedGroups: string[];
    previewHtmlS3Key?: string;
    createdAt: string;
    updatedAt: string;
    expireAt: Date;
}

export class MongoSessionStore implements SessionStore {
    private collectionName = 'chat_sessions';
    private indexCreated = false;

    constructor() {
        console.error(`[doc-assistant] Using database-backed MongoDB session store (collection="${this.collectionName}")`);
    }

    private async getCollection() {
        const db = await getDb();
        const collection = db.collection<SessionDoc>(this.collectionName);
        if (!this.indexCreated) {
            this.indexCreated = true;
            try {
                await collection.createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 });
                console.error(`[doc-assistant] Verified TTL index on "expireAt" for collection "${this.collectionName}"`);
            } catch (err) {
                console.error(`[doc-assistant] Failed to create TTL index on collection "${this.collectionName}"`, err);
            }
        }
        return collection;
    }

    async get(sessionId: string): Promise<SessionData | null> {
        try {
            const col = await this.getCollection();
            const doc = await col.findOne({ _id: sessionId });
            if (!doc) {
                console.log(`[mongo-session-store] GET "${sessionId}" → miss`);
                return null;
            }

            console.log(`[mongo-session-store] GET "${sessionId}" → found (template="${doc.templateName}", vars=${Object.keys(doc.variables ?? {}).length}, groups=${(doc.completedGroups ?? []).length})`);
            return {
                sessionId: doc._id,
                userId: doc.userId,
                documentId: doc.documentId,
                userDocumentId: doc.userDocumentId,
                templateName: doc.templateName,
                variables: doc.variables ?? {},
                completedGroups: doc.completedGroups ?? [],
                previewHtmlS3Key: doc.previewHtmlS3Key,
                createdAt: doc.createdAt,
                updatedAt: doc.updatedAt,
            };
        } catch (err) {
            console.error(`[doc-assistant] MongoSessionStore.get failed for "${sessionId}"`, err);
            return null;
        }
    }

    async save(session: SessionData): Promise<void> {
        try {
            session.updatedAt = new Date().toISOString();
            const col = await this.getCollection();

            const { sessionId, ...rest } = session;
            const expireAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days TTL

            await col.updateOne(
                { _id: sessionId },
                { $set: { ...rest, expireAt } },
                { upsert: true }
            );
            console.log(`[mongo-session-store] SAVE "${sessionId}" → template="${session.templateName}", vars=${Object.keys(session.variables).length}, groups=[${session.completedGroups.join(',')}]`);
        } catch (err) {
            console.error(`[doc-assistant] MongoSessionStore.save failed for "${session.sessionId}"`, err);
        }
    }

    async delete(sessionId: string): Promise<void> {
        try {
            const col = await this.getCollection();
            await col.deleteOne({ _id: sessionId });
            console.log(`[mongo-session-store] DELETE "${sessionId}"`);
        } catch (err) {
            console.error(`[doc-assistant] MongoSessionStore.delete failed for "${sessionId}"`, err);
        }
    }

    dump(): {
        size: number;
        sessions: Array<{
            sessionId: string;
            userId: string;
            templateName: string;
            variableCount: number;
            completedGroups: string[];
            updatedAt: string;
        }>;
    } {
        return {
            size: -1,
            sessions: [],
        };
    }
}

let _store: SessionStore | null = null;

export function getSessionStore(): SessionStore {
    if (!_store) {
        const configured = (process.env.DOC_ASSISTANT_SESSION_STORE ?? '').trim().toLowerCase();
        const isTesting =
            process.env.NODE_ENV === 'test' ||
            process.execArgv.includes('--test') ||
            process.argv.some(arg => arg.includes('.test.js') || arg.includes('.test.ts'));
        const mode = configured || (isTesting ? 'lru' : (process.env.MONGO_URI ? 'mongo' : 'file'));
        if (mode === 'mongo') {
            _store = new MongoSessionStore();
        } else if (mode === 'file') {
            const filePath =
                process.env.DOC_ASSISTANT_SESSION_FILE?.trim() ||
                join(process.cwd(), '.doc-assistant-sessions.json');
            _store = new FileSessionStore(filePath);
        } else {
            _store = new LruSessionStore();
        }
    }
    return _store;
}

/**
 * LRU keys are `{userDocumentId}_{userId}` where userDocumentId is the user_documents purchase row _id.
 * Catalog documents._id is stored on SessionData.documentId for Mongo / confirm flows.
 * A secondary index maps `{templateName}_{userId}` → session key for lookups
 * where only templateName is available (e.g. generate_pdf, update_variable).
 */
export class SessionManager {
    private store: SessionStore;
    private templateIndex = new Map<string, string>();

    private static buildSessionKey(userDocumentPurchaseId: string, userId: string): string {
        return `${userDocumentPurchaseId}_${userId}`;
    }

    private static buildTemplateIndexKey(templateName: string, userId: string): string {
        return `${templateName}_${userId}`;
    }

    constructor(store: SessionStore) {
        this.store = store;
    }

    /**
     * @param catalogDocumentId — `documents` collection _id (SessionData.documentId)
     * @param userDocumentPurchaseId — `user_documents` row _id; used as the LRU cache session key with userId
     */
    async start(
        templateName: string,
        userId: string,
        catalogDocumentId: string,
        userDocumentPurchaseId: string,
    ): Promise<SessionData> {
        const sessionKey = SessionManager.buildSessionKey(userDocumentPurchaseId, userId);
        const session = emptySession(sessionKey);
        session.templateName = templateName;
        session.userId = userId;
        session.documentId = catalogDocumentId;
        session.userDocumentId = userDocumentPurchaseId;
        await this.store.save(session);

        const indexKey = SessionManager.buildTemplateIndexKey(templateName, userId);
        this.templateIndex.set(indexKey, sessionKey);

        return session;
    }

    async getSession(templateName: string, userId: string): Promise<SessionData | null> {
        const indexKey = SessionManager.buildTemplateIndexKey(templateName, userId);
        const sessionKey = this.templateIndex.get(indexKey);
        if (!sessionKey) return null;

        const session = await this.store.get(sessionKey);
        if (!session) {
            this.templateIndex.delete(indexKey);
            return null;
        }
        return session;
    }

    /** Load session by user_documents purchase row _id + user (same key as start()). */
    async getSessionByPurchaseId(userDocumentPurchaseId: string, userId: string): Promise<SessionData | null> {
        const sessionKey = SessionManager.buildSessionKey(userDocumentPurchaseId, userId);
        return this.store.get(sessionKey);
    }

    async getCompletedGroupsByPurchaseId(userDocumentPurchaseId: string, userId: string): Promise<string[]> {
        const session = await this.getSessionByPurchaseId(userDocumentPurchaseId, userId);
        return [...(session?.completedGroups ?? [])];
    }

    async getVariablesByPurchaseId(userDocumentPurchaseId: string, userId: string): Promise<Record<string, string | number>> {
        const session = await this.getSessionByPurchaseId(userDocumentPurchaseId, userId);
        return { ...(session?.variables ?? {}) };
    }

    /** Update session variables without completing a schema group (internal flags, etc.). */
    async patchVariablesByPurchaseId(
        userDocumentPurchaseId: string,
        userId: string,
        variables: Record<string, string | number>,
    ): Promise<void> {
        const session = await this.getSessionByPurchaseId(userDocumentPurchaseId, userId);
        if (!session) return;
        Object.assign(session.variables, variables);
        await this.store.save(session);
    }

    /** Replace the full variables map (used after normalize so PDF fragments persist consistently). */
    async replaceVariablesByPurchaseId(
        userDocumentPurchaseId: string,
        userId: string,
        variables: Record<string, string | number>,
    ): Promise<void> {
        const session = await this.getSessionByPurchaseId(userDocumentPurchaseId, userId);
        if (!session) return;
        session.variables = { ...variables };
        await this.store.save(session);
    }

    async updatePreviewHtmlKeyByPurchaseId(
        userDocumentPurchaseId: string,
        userId: string,
        previewHtmlS3Key: string | undefined,
    ): Promise<void> {
        const session = await this.getSessionByPurchaseId(userDocumentPurchaseId, userId);
        if (!session) return;
        session.previewHtmlS3Key = previewHtmlS3Key;
        await this.store.save(session);
    }

    /**
     * Remove one purchase's session. If the template index pointed at this session, clear it so
     * another concurrent purchase of the same template is not orphaned.
     */
    async clearByPurchaseId(userDocumentPurchaseId: string, userId: string, templateName: string): Promise<void> {
        const sessionKey = SessionManager.buildSessionKey(userDocumentPurchaseId, userId);
        const indexKey = SessionManager.buildTemplateIndexKey(templateName, userId);
        if (this.templateIndex.get(indexKey) === sessionKey) {
            this.templateIndex.delete(indexKey);
        }
        await this.store.delete(sessionKey);
    }

    async storeGroupAnswers(
        groupId: string,
        vars: Record<string, string | number> | null | undefined,
        templateName: string,
        userId: string,
    ): Promise<{ totalStored: number; completedGroups: string[] }> {
        const session = await this.getSession(templateName, userId);
        if (!session) throw new Error('No active session. Call start_filling first.');

        if (vars && typeof vars === 'object') {
            Object.assign(session.variables, vars);
        }
        if (!session.completedGroups.includes(groupId)) {
            session.completedGroups.push(groupId);
        }
        await this.store.save(session);
        return {
            totalStored: Object.keys(session.variables).length,
            completedGroups: session.completedGroups,
        };
    }

    async storeGroupAnswersByPurchaseId(
        userDocumentPurchaseId: string,
        userId: string,
        groupId: string,
        vars: Record<string, string | number> | null | undefined,
    ): Promise<{ totalStored: number; completedGroups: string[] }> {
        const session = await this.getSessionByPurchaseId(userDocumentPurchaseId, userId);
        if (!session) throw new Error('No active session. Call submit_group_answers with only userDocumentId first.');

        if (vars && typeof vars === 'object') {
            Object.assign(session.variables, vars);
        }
        if (!session.completedGroups.includes(groupId)) {
            session.completedGroups.push(groupId);
        }
        await this.store.save(session);
        return {
            totalStored: Object.keys(session.variables).length,
            completedGroups: session.completedGroups,
        };
    }

    async getVariables(templateName: string, userId: string): Promise<Record<string, string | number>> {
        const session = await this.getSession(templateName, userId);
        return { ...( session?.variables ?? {} ) };
    }

    async getCompletedGroups(templateName: string, userId: string): Promise<string[]> {
        const session = await this.getSession(templateName, userId);
        return [...( session?.completedGroups ?? [] )];
    }

    async getTemplateName(templateName: string, userId: string): Promise<string> {
        const session = await this.getSession(templateName, userId);
        return session?.templateName ?? '';
    }

    async clear(templateName: string, userId: string): Promise<void> {
        const indexKey = SessionManager.buildTemplateIndexKey(templateName, userId);
        const sessionKey = this.templateIndex.get(indexKey);
        if (sessionKey) {
            await this.store.delete(sessionKey);
            this.templateIndex.delete(indexKey);
        }
    }

    /** Track S3 key for ephemeral preview HTML (delete old object before replacing). */
    async updatePreviewHtmlKey(templateName: string, userId: string, previewHtmlS3Key: string | undefined): Promise<void> {
        const session = await this.getSession(templateName, userId);
        if (!session) return;
        session.previewHtmlS3Key = previewHtmlS3Key;
        await this.store.save(session);
    }

    async debugSession(): Promise<{ cache: ReturnType<SessionStore['dump']>; templateIndex: Record<string, string> }> {
        return {
            cache: this.store.dump(),
            templateIndex: Object.fromEntries(this.templateIndex),
        };
    }
}
