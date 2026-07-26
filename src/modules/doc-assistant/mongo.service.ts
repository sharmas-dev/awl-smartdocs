import { MongoClient, Db, ObjectId } from 'mongodb';

let _client: MongoClient | null = null;
let _db: Db | null = null;

export async function getDb(): Promise<Db> {
    if (_db) return _db;

    const uri = process.env.MONGO_URI;
    if (!uri) throw new Error('MONGO_URI environment variable is not set');

    const options: ConstructorParameters<typeof MongoClient>[1] = {};
    const authSource = process.env.MONGO_AUTH_SOURCE?.trim();
    if (authSource) {
        options.authSource = authSource;
    }

    _client = new MongoClient(uri, options);
    await _client.connect();
    const dbName = process.env.MONGO_DB_NAME?.trim();
    _db = dbName ? _client.db(dbName) : _client.db();
    console.log('[mongo] Connected to MongoDB');
    return _db;
}

export interface DocumentRecord {
    _id: ObjectId;
    title: string;
    status: string;
    isDeleted: boolean;
    [key: string]: unknown;
}

export interface UserDocumentRecord {
    _id: ObjectId;
    user_id: ObjectId;
    document_id: ObjectId;
    status: string;
    is_active: boolean;
    is_deleted: boolean;
    order_id: ObjectId;
    /** Presigned download URL set when the user confirms PDF generation in the assistant. */
    link?: string;
    /** Same URL as `link`; explicit S3 field on the purchase schema. */
    s3_link?: string;
    [key: string]: unknown;
}

export function isValidObjectId(id: string): boolean {
    return /^[a-fA-F0-9]{24}$/.test(id);
}

export class MongoService {
    async findDocumentById(documentId: string): Promise<DocumentRecord | null> {
        if (!isValidObjectId(documentId)) return null;
        const db = await getDb();
        return db.collection<DocumentRecord>('documents').findOne({
            _id: new ObjectId(documentId),
        });
    }

    async findUserDocumentByDocId(documentId: string, userId?: string): Promise<UserDocumentRecord | null> {
        if (!isValidObjectId(documentId)) return null;
        const db = await getDb();
        const filter: Record<string, unknown> = {
            document_id: new ObjectId(documentId),
            is_active: true,
            is_deleted: false,
        };
        if (userId && isValidObjectId(userId)) {
            filter.user_id = new ObjectId(userId);
        }
        return db.collection<UserDocumentRecord>('user_documents').findOne(filter);
    }

    /** Lookup purchase row by `user_documents._id` and owning user (primary embed flow — no catalog id required). */
    async findUserDocumentByIdForUser(purchaseId: string, userId: string): Promise<UserDocumentRecord | null> {
        if (!isValidObjectId(purchaseId) || !isValidObjectId(userId)) {
            return null;
        }
        const db = await getDb();
        return db.collection<UserDocumentRecord>('user_documents').findOne({
            _id: new ObjectId(purchaseId),
            user_id: new ObjectId(userId),
            is_active: true,
            is_deleted: false,
        });
    }

    /** Set status on a purchase row (e.g. IN_PROGRESS when the assistant asks the first question). */
    async updateUserDocumentStatusByPurchaseId(
        purchaseId: string,
        userId: string,
        status: string,
    ): Promise<{ matched: boolean; modified: boolean }> {
        if (!isValidObjectId(purchaseId) || !isValidObjectId(userId)) {
            return { matched: false, modified: false };
        }
        const db = await getDb();
        const now = new Date();
        const result = await db.collection<UserDocumentRecord>('user_documents').updateOne(
            {
                _id: new ObjectId(purchaseId),
                user_id: new ObjectId(userId),
                is_deleted: false,
            },
            {
                $set: {
                    status,
                    updated_at: now,
                    updated_by: new ObjectId(userId),
                },
            },
        );
        return { matched: result.matchedCount > 0, modified: result.modifiedCount > 0 };
    }

    /** Lookup purchase row by its own _id and ensure it matches catalog document + user (anti-tamper). */
    async findUserDocumentByPurchaseId(
        purchaseId: string,
        userId: string,
        catalogDocumentId: string,
    ): Promise<UserDocumentRecord | null> {
        if (!isValidObjectId(purchaseId) || !isValidObjectId(userId) || !isValidObjectId(catalogDocumentId)) {
            return null;
        }
        const db = await getDb();
        return db.collection<UserDocumentRecord>('user_documents').findOne({
            _id: new ObjectId(purchaseId),
            user_id: new ObjectId(userId),
            document_id: new ObjectId(catalogDocumentId),
            is_active: true,
            is_deleted: false,
        });
    }

    /**
     * After successful S3 upload on confirm, persist the download URL and set status to DELIVERED.
     * Prefer this when the client passed the purchase row id (e.g. redirect query param).
     */
    async updateUserDocumentLinkByPurchaseId(
        purchaseId: string,
        userId: string,
        link: string,
    ): Promise<{ matched: boolean; modified: boolean }> {
        if (!isValidObjectId(purchaseId) || !isValidObjectId(userId)) {
            return { matched: false, modified: false };
        }
        const db = await getDb();
        const now = new Date();
        const result = await db.collection<UserDocumentRecord>('user_documents').updateOne(
            {
                _id: new ObjectId(purchaseId),
                user_id: new ObjectId(userId),
                is_deleted: false,
            },
            {
                $set: {
                    link,
                    s3_link: link,
                    status: 'DELIVERED',
                    updated_at: now,
                    updated_by: new ObjectId(userId),
                },
            },
        );
        return { matched: result.matchedCount > 0, modified: result.modifiedCount > 0 };
    }

    /**
     * After successful S3 upload on confirm, persist the download URL and set status to DELIVERED.
     * `catalogDocumentId` is the `documents` collection _id (same as session.documentId in the purchase flow).
     */
    async updateUserDocumentLink(
        catalogDocumentId: string,
        userId: string,
        link: string,
    ): Promise<{ matched: boolean; modified: boolean }> {
        if (!isValidObjectId(catalogDocumentId) || !isValidObjectId(userId)) {
            return { matched: false, modified: false };
        }
        const db = await getDb();
        const now = new Date();
        const result = await db.collection<UserDocumentRecord>('user_documents').updateOne(
            {
                document_id: new ObjectId(catalogDocumentId),
                user_id: new ObjectId(userId),
                is_deleted: false,
            },
            {
                $set: {
                    link,
                    s3_link: link,
                    status: 'DELIVERED',
                    updated_at: now,
                    updated_by: new ObjectId(userId),
                },
            },
        );
        return { matched: result.matchedCount > 0, modified: result.modifiedCount > 0 };
    }
}
