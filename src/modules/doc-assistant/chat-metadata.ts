/** Extract latest user chat text from MCP / Nitro tool execution metadata. */
export function extractUserMessageFromMetadata(metadata?: Record<string, unknown>): string {
    if (!metadata) return '';
    const candidates: unknown[] = [
        metadata.userMessage,
        metadata.lastUserMessage,
        metadata.user_message,
        metadata.message,
        metadata.lastMessage,
        metadata.input,
        metadata.prompt,
    ];
    for (const c of candidates) {
        if (typeof c !== 'string') continue;
        const t = c.trim();
        if (t.length > 0) return t;
    }
    return '';
}
