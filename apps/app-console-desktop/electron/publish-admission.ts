import type { AdmissionGame } from './contract.ts';
import { authSessionEnvelope } from './auth-core.ts';
import type { Settings } from './settings.ts';

/** User-facing game names shared by admission errors and publish confirmations. */
export const PUBLISH_GAME_LABELS: Record<AdmissionGame, string> = {
  magic:       '万智牌',
  hearthstone: '炉石传说',
  yugioh:      '游戏王',
  shadowverse: '影之诗',
};

/**
 * Fail-closed publish admission: asks the deployed console backend whether the
 * stored session's account may publish one game's data. Refusal and unreachability
 * both stop the publish before any run exists.
 */
export async function admitPublish(settings: Settings, game: AdmissionGame): Promise<string> {
  const session = await authSessionEnvelope(settings);
  if (!session) throw new Error('此操作需要先登录。');
  let response: Response;
  try {
    response = await fetch(new URL('publish/admission', session.baseUrl), {
      method:  'POST',
      headers: { 'content-type': 'application/json', 'cookie': session.cookieHeader },
      body:    JSON.stringify({ game }),
    });
  } catch {
    throw new Error('无法连接服务验证发布权限，已取消发布。');
  }
  if (response.status === 401) throw new Error('登录已失效，请重新登录。');
  if (response.status === 403) throw new Error(`当前账号没有发布${PUBLISH_GAME_LABELS[game]}数据的权限。`);
  if (!response.ok) throw new Error(`发布权限验证失败（HTTP ${response.status}）。`);
  // The verdict body is authoritative; a permissive proxy answer must not publish.
  const verdict = await response.json().catch(() => null) as {
    allowed?: boolean;
    game?:    AdmissionGame;
    userId?:  string;
  } | null;
  if (
    verdict?.allowed !== true
    || verdict.game !== game
    || typeof verdict.userId !== 'string'
    || !verdict.userId.trim()
  ) throw new Error('发布权限验证失败。');
  return verdict.userId;
}
