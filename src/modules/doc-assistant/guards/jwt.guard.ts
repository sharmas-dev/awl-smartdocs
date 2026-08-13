import { JWTModule, SecretValue, type ExecutionContext, verifyJWT } from '@nitrostack/core';

function parseTokenFromMetadata(metadata?: Record<string, unknown>): string | null {
    if (!metadata) return null;

    const candidates = [
        metadata.authorization,
        metadata.Authorization,
        metadata.bearerToken,
        metadata.token,
        metadata.jwt,
    ];

    for (const candidate of candidates) {
        if (typeof candidate !== 'string') continue;
        const value = candidate.trim();
        if (!value) continue;
        if (value.toLowerCase().startsWith('bearer ')) return value.slice(7).trim();
        return value;
    }

    return null;
}

function buildScopes(payload: Record<string, unknown>): string[] {
    const scopes = payload.scopes;
    if (Array.isArray(scopes)) {
        return scopes.filter((s): s is string => typeof s === 'string');
    }
    if (typeof payload.scope === 'string') {
        return payload.scope
            .split(' ')
            .map((s) => s.trim())
            .filter(Boolean);
    }
    return [];
}

export class JwtGuard {
    canActivate(context: ExecutionContext): boolean {
        if (context.auth?.subject || context.auth?.tokenPayload) {
            return true;
        }

        const token = parseTokenFromMetadata(context.metadata as Record<string, unknown> | undefined);
        if (!token) {
            throw new Error(
                'Unauthorized: missing JWT. Pass a token via tool args `_meta.authorization` as `Bearer <token>`.',
            );
        }

        const jwtConfig = JWTModule.getConfig();
        const rawSecret = JWTModule.getSecret();
        if (!rawSecret) {
            throw new Error('JWT is not configured on server. Set JWT_SECRET (or JWTModule secret config).');
        }

        const secret =
            jwtConfig.secretEnvVar && process.env[jwtConfig.secretEnvVar]
                ? SecretValue.fromEnv(jwtConfig.secretEnvVar)
                : SecretValue.fromValue(rawSecret, { allowHardcoded: true });

        const payload = verifyJWT(token, {
            secret,
            audience: jwtConfig.audience,
            issuer: jwtConfig.issuer,
        });

        if (!payload) {
            throw new Error('Unauthorized: invalid or expired JWT.');
        }

        const verifiedPayload = payload as Record<string, unknown>;

        context.auth = {
            subject: typeof verifiedPayload.sub === 'string' ? verifiedPayload.sub : undefined,
            scopes: buildScopes(verifiedPayload),
            clientId:
                typeof verifiedPayload.client_id === 'string'
                    ? verifiedPayload.client_id
                    : (typeof verifiedPayload.sub === 'string' ? verifiedPayload.sub : undefined),
            exp: typeof verifiedPayload.exp === 'number' ? verifiedPayload.exp : undefined,
            iat: typeof verifiedPayload.iat === 'number' ? verifiedPayload.iat : undefined,
            iss: typeof verifiedPayload.iss === 'string' ? verifiedPayload.iss : undefined,
            tokenPayload: payload,
        };

        return true;
    }
}
