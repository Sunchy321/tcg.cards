import { generateText } from 'ai';
import { createQwen } from 'qwen-ai-provider-v5';

const qwen = createQwen({ baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1' });

interface ConversionResult {
    syntax:      string;
    explanation: string;
    confidence:  'high' | 'medium' | 'low';
}

// Magic: The Gathering search syntax system prompt
function getMagicSystemPrompt(): string {
    return `你是一个MTG(万智牌)卡牌搜索专家。你的任务是将用户的自然语言查询转换为搜索语法。

搜索语法规则：
1. 颜色查询：
   - color:w/u/b/r/g/c (白/蓝/黑/红/绿/无色)
   - 多色：color=rg (红绿), color=wub (白蓝黑)
   - 颜色标识：color-identity=wr 或 identity=wr

2. 类型查询：
   - type:creature/instant/sorcery/artifact/enchantment/planeswalker/land
   - type:legendary/basic/snow
   - 子类型：type:elf type:goblin type:aura

3. 费用查询：
   - mana-value:3 或 mv:3 或 cmc:3 (总法术力费用等于3)
   - mv>3, mv<3, mv>=3, mv<=3 (比较操作符)
   - cost:2RR (精确法术力费用)

4. 数值查询：
   - power:3 (力量等于3)
   - power>2, power<5 (比较)
   - toughness:4 或 tou:4
   - loyalty:3 或 loy:3 (旅法师忠诚度)

5. 文本搜索：
   - name:"Lightning Bolt" 或 n:"Lightning Bolt" (精确卡牌名)
   - oracle:"抽牌" (规则文本包含"抽牌")
   - text:"飞行" 或 x:"飞行" (任何文本字段)

6. 系列和稀有度：
   - set:dom/war/m20 (系列代码)
   - rarity:common/uncommon/rare/mythic 或 r:c/u/r/m

7. 赛制：
   - format:standard/modern/legacy/vintage/commander/pioneer

8. 关键字异能：
   - keyword:flying/trample/vigilance/lifelink/deathtouch
   - keyword:haste/hexproof/menace

9. 逻辑运算符：
   - & 或 空格 (且)：color:r type:creature
   - | (或)：type:instant | type:sorcery
   - - 或 ! (非)：-color:u 或 !type:creature
   - (...) (分组)：(type:instant | type:sorcery) color:r

10. 特殊搜索：
   - #标签搜索：#removal #token #counterspell
   - 统计搜索：{{power}}/{{toughness}} 如 3/3

示例转换：
"蓝色快速咒语" → color:u type:instant
"费用小于3的红色生物" → color:r type:creature mv<3
"白色传奇生物，费用4或5" → color:w supertype:legendary type:creature (mv:4 | mv:5)
"有飞行异能的生物" → type:creature keyword:flying
"能抽牌的蓝色或黑色快速咒语" → (color:u | color:b) type:instant oracle:抽牌
"3费2/2绿色生物" → color:g type:creature mv:3 power:2 toughness:2
"黑色移除咒语" → color:b (type:instant | type:sorcery) (oracle:消灭 | oracle:放逐)
"红色神器或结界" → color:r (type:artifact | type:enchantment)

输出格式要求：
必须返回JSON格式：
{
  "syntax": "转换后的搜索语法",
  "explanation": "简短解释你的转换逻辑",
  "confidence": "high/medium/low"
}

confidence说明：
- high: 查询明确，转换准确
- medium: 查询有歧义，选择了最可能的解释
- low: 查询模糊，可能需要用户确认

注意事项：
1. 保持语法简洁，避免冗余
2. 使用缩写提高可读性（如mv代替mana-value）
3. 合理使用括号来明确优先级
4. 对于中文查询，识别对应的英文术语
5. 如果查询过于模糊，在explanation中说明你的假设`;
}

// Yu-Gi-Oh! search syntax system prompt
function getYugiohSystemPrompt(): string {
    return `你是一个游戏王(Yu-Gi-Oh!)卡牌搜索专家。你的任务是将用户的自然语言查询转换为搜索语法。

搜索语法规则：
1. 卡片类型：
   - type:monster/spell/trap (怪兽/魔法/陷阱)
   - type:effect/normal/fusion/synchro/xyz/link/pendulum

2. 属性（怪兽）：
   - attribute:dark/light/earth/water/fire/wind/divine

3. 种族（怪兽）：
   - race:dragon/warrior/spellcaster/zombie/machine/...

4. 等级/阶级/连接：
   - level:4 或 lv:4 (等级)
   - rank:4 (超量阶级)
   - link:3 (连接值)

5. 攻击力/守备力：
   - atk:2500 或 attack:2500
   - atk>2000, atk<=3000
   - def:2000 或 defense:2000

6. 文本搜索：
   - name:"青眼白龙"
   - text:"破坏" (效果文本)

7. 系列和稀有度：
   - set:code (系列代码)
   - rarity:common/rare/super/ultra/secret

8. 赛制：
   - format:ocg/tcg
   - banlist:forbidden/limited/semi-limited

示例转换：
"4星暗属性怪兽" → type:monster attribute:dark level:4
"攻击力2500以上的龙族" → race:dragon atk>=2500
"能破坏魔法陷阱的怪兽" → type:monster text:破坏 (text:魔法 | text:陷阱)

输出JSON格式同上。`;
}

// Hearthstone search syntax system prompt
function getHearthstoneSystemPrompt(): string {
    return `你是一个炉石传说(Hearthstone)卡牌搜索专家。你的任务是将用户的自然语言查询转换为搜索语法。

搜索语法规则：
1. 职业：
   - class:mage/warrior/priest/rogue/druid/hunter/shaman/warlock/paladin/demonhunter/neutral

2. 卡牌类型：
   - type:minion/spell/weapon/hero/location

3. 稀有度：
   - rarity:common/rare/epic/legendary/free

4. 费用：
   - cost:3 或 mana:3
   - cost>5, cost<=7

5. 数值（随从）：
   - attack:3 或 atk:3
   - health:4 或 hp:4

6. 种族（随从）：
   - race:beast/dragon/demon/mech/murloc/pirate/elemental/totem/undead

7. 关键字：
   - keyword:taunt/divine-shield/windfury/charge/rush/lifesteal

8. 文本搜索：
   - name:"烈焰风暴"
   - text:"抽牌"

9. 系列：
   - set:classic/tgt/wog/...

示例转换：
"3费法师法术" → class:mage type:spell cost:3
"有嘲讽的野兽" → type:minion race:beast keyword:taunt
"能抽牌的传奇随从" → type:minion rarity:legendary text:抽牌

输出JSON格式同上。`;
}

/**
 * Convert natural language query to search syntax
 * @param game Game type
 * @param naturalQuery User's natural language query
 * @returns Conversion result
 */
export async function convertNaturalToSearch(
    game: 'magic' | 'yugioh' | 'hearthstone' | 'lorcana' | 'ptcg',
    naturalQuery: string,
): Promise<ConversionResult> {
    const systemPrompts: Record<string, string> = {
        magic:       getMagicSystemPrompt(),
        yugioh:      getYugiohSystemPrompt(),
        hearthstone: getHearthstoneSystemPrompt(),
        lorcana:     getMagicSystemPrompt(), // temporarily use Magic's prompt
        ptcg:        getMagicSystemPrompt(), // temporarily use Magic's prompt
    };

    const systemPrompt = systemPrompts[game] || systemPrompts.magic;

    try {
        const { text } = await generateText({
            model:  qwen('qwen-plus'), // or 'qwen-turbo', 'qwen-max'
            system: systemPrompt,
            prompt: naturalQuery,
        });

        // Parse JSON response
        const result = JSON.parse(text) as ConversionResult;

        return result;
    } catch (error) {
        console.error('Query conversion error:', error);

        // Fallback: if AI fails, return original query
        return {
            syntax:      naturalQuery,
            explanation: '无法转换查询，请使用标准搜索语法',
            confidence:  'low',
        };
    }
}

/**
 * Batch convert multiple queries (for Few-Shot Learning)
 */
export async function batchConvertQueries(
    game: 'magic' | 'yugioh' | 'hearthstone',
    queries: string[],
): Promise<ConversionResult[]> {
    return Promise.all(queries.map(q => convertNaturalToSearch(game, q)));
}

/**
 * Validate generated search syntax
 * Check validity by attempting to parse
 */
export function validateSearchSyntax(syntax: string): { valid: boolean, error?: string } {
    try {
        // Can call existing Parser to validate
        // Simple check for basic rules for now
        const hasInvalidChars = /[<>](?![=])|[&|](?![&|])/.test(syntax);

        if (hasInvalidChars) {
            return { valid: false, error: 'Invalid operators' };
        }

        return { valid: true };
    } catch (error) {
        return { valid: false, error: String(error) };
    }
}
