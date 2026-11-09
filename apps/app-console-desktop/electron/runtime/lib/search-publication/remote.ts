import type { SearchServiceSessionOverride } from '../../runtime-config';

/** One object a publication wants to write, as the service understands it. */
export interface SearchPublishObject {
  key:     string;
  bytes:   number;
  sha256?: string;
}

/** One signed upload the desktop performs directly against the bucket. */
export interface SignedSearchUpload {
  key:     string;
  url:     string;
  headers: Record<string, string>;
}

/** Upload targets the service signed, plus the objects it already has. */
export interface SearchUploadPlan {
  uploads:  SignedSearchUpload[];
  existing: string[];
}

/** Result of the service's light verification. */
export interface SearchVerifyResult {
  ok:         boolean;
  missing:    string[];
  mismatched: string[];
}

/** Remote front of the search publication endpoints. */
export interface SearchPublishRemote {
  requestUploads(input: { game: 'magic' | 'hearthstone', objects: SearchPublishObject[] }): Promise<SearchUploadPlan>;
  verify(input: { game: 'magic' | 'hearthstone', objects: SearchPublishObject[] }): Promise<SearchVerifyResult>;
}

/** Builds one authenticated client for the console service's search endpoints. */
export function createSearchPublishRemote(session: SearchServiceSessionOverride): SearchPublishRemote {
  /** Sends one JSON request with the stored console cookie. */
  async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await fetch(new URL(path, session.baseUrl), {
        method:  'POST',
        headers: { 'content-type': 'application/json', 'cookie': session.cookieHeader },
        body:    JSON.stringify(body),
      });
    } catch {
      throw new Error('无法连接控制台服务，请检查地址和网络。');
    }

    if (response.status === 401) throw new Error('登录已失效，请重新登录控制台服务。');
    if (response.status === 403) throw new Error('当前账号无权发布搜索数据。');

    const result = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok || result?.allowed !== true) {
      const message = typeof result?.message === 'string' && result.message.trim()
        ? result.message
        : `搜索数据发布请求失败（HTTP ${response.status}）。`;
      throw new Error(message);
    }
    return result;
  }

  return {
    async requestUploads(input) {
      const result = await post('search-publish/objects', input);
      const uploads = Array.isArray(result.uploads) ? result.uploads : [];
      return {
        uploads: uploads.map(upload => {
          const item = upload as { key?: unknown, url?: unknown, headers?: unknown };
          if (typeof item.key !== 'string' || typeof item.url !== 'string') {
            throw new Error('服务返回的上传地址无效。');
          }
          return {
            key:     item.key,
            url:     item.url,
            headers: isStringRecord(item.headers) ? item.headers : {},
          };
        }),
        existing: Array.isArray(result.existing)
          ? result.existing.filter((key): key is string => typeof key === 'string')
          : [],
      };
    },

    async verify(input) {
      const result = await post('search-publish/verify', input);
      const strings = (value: unknown) => Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string')
        : [];
      return {
        ok:         result.ok === true,
        missing:    strings(result.missing),
        mismatched: strings(result.mismatched),
      };
    },
  };
}

/** Reports whether one decoded value is a string-to-string map. */
function isStringRecord(value: unknown): value is Record<string, string> {
  return value != null
    && typeof value === 'object'
    && Object.values(value as Record<string, unknown>).every(item => typeof item === 'string');
}
