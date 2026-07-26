/**
 * Absolute URL for GET /api/preview so fetch() works inside embedded widgets.
 *
 * Relative URLs like `/api/preview?...` fail with:
 *   Failed to execute 'fetch' on 'Window': Failed to parse URL from /api/preview?...
 * when the widget document has no valid base (opaque origin, about:blank, etc.),
 * which happens with Nitro's ui:// widget host.
 */

function normalizeEnvOrigin(raw: string): string {
  const trimmed = raw.trim().replace(/\/$/, '');
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  return `https://${trimmed}`;
}

function readWidgetApiOriginFromEnv(): string | undefined {
  if (typeof process === 'undefined' || !process.env) return undefined;
  const v =
    process.env.NEXT_PUBLIC_WIDGET_API_ORIGIN?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim();
  return v ? normalizeEnvOrigin(v) : undefined;
}

export function getPreviewFetchUrl(templateName: string): string {
  const name = templateName.normalize('NFC');
  const path = `/api/preview?name=${encodeURIComponent(name)}`;

  const envOrigin = readWidgetApiOriginFromEnv();
  if (envOrigin) {
    return `${envOrigin}${path}`;
  }

  if (typeof window !== 'undefined') {
    const { origin, href } = window.location;
    if (origin && origin !== 'null') {
      try {
        return new URL(path, href).href;
      } catch {
        /* fall through */
      }
    }
    try {
      const base = document.baseURI;
      if (base && !base.startsWith('about:') && base !== 'null') {
        return new URL(path, base).href;
      }
    } catch {
      /* fall through */
    }
  }

  throw new Error(
    'Cannot resolve preview API URL (widget has no valid document origin). Set NEXT_PUBLIC_WIDGET_API_ORIGIN to your widget app base URL (e.g. https://your-app.example.com).'
  );
}
