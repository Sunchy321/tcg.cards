import { streamText } from 'ai';
import { createQwen } from 'qwen-ai-provider-v5';

const qwen = createQwen({ baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1' });

export interface CardEmbed {
    cardId: string;
    mode:   'image' | 'text' | 'compact';
    game:   string;
}

export interface ChatMessage {
    role:    'user' | 'assistant' | 'system';
    content: string;
    cards?:  CardEmbed[];
}

export interface StreamChunk {
    type:     'text' | 'card' | 'done' | 'error';
    content?: string;
    card?:    CardEmbed;
    error?:   string;
}

/**
 * Parse card tags in AI response
 * Format: [Card Name](card:card_id) or [Card Name](card:card_id?mode=image)
 */
export function parseCardEmbeds(text: string, game: string): { text: string, cards: CardEmbed[] } {
    // Match Markdown link format with card: protocol
    const cardRegex = /\[([^\]]+)\]\(card:([^?)]+)(?:\?mode=(image|text|compact))?\)/g;
    const cards: CardEmbed[] = [];
    let match;

    // Extract all card tags
    while ((match = cardRegex.exec(text)) !== null) {
        cards.push({
            cardId: match[2],
            mode:   (match[3] as 'image' | 'text' | 'compact') || 'compact',
            game,
        });
    }

    // Keep the link format in the text for Markdown rendering
    return { text, cards };
}

/**
 * Get game-specific system prompt
 */
function getGameSystemPrompt(game: string): string {
    const basePrompt = `你是一个专业的TCG卡牌搜索助手。你的任务是帮助用户找到他们需要的卡牌，并提供有用的建议。

重要规则：
1. 当你提到具体的卡牌时，使用 Markdown 链接格式：[Card Name](card:card_id)
2. 你可以指定显示模式：[Card Name](card:card_id?mode=image) 显示图片，或 [Card Name](card:card_id?mode=text) 显示文本
3. 默认使用 compact 模式（紧凑显示）
4. 回答要简洁、专业，重点突出
5. 如果用户的查询不清楚，礼貌地要求澄清
6. 提供卡组构建建议时，解释卡牌之间的配合

示例对话：
用户: "推荐一些蓝色快速咒语"
助手: "这里是一些强力的蓝色快速咒语：

- [Counterspell](card:counterspell) - 经典的康牌，2费反击任何咒语
- [Lightning Bolt](card:lightning_bolt?mode=image) - 高效的去除法术

这些卡牌在控制套牌中非常有用。"`;

    const gameSpecifics: Record<string, string> = {
        magic: `
你专注于万智牌(MTG)。了解各种赛制(标准、现代、指挥官等)和卡牌之间的配合。`,
        yugioh: `
你专注于游戏王。了解OCG/TCG的差异、禁卡表和常见卡组。`,
        hearthstone: `
你专注于炉石传说。了解各职业的特点和当前环境。`,
    };

    return basePrompt + (gameSpecifics[game] || '');
}

/**
 * Create AI chat stream
 * @param game Game type
 * @param messages Conversation history
 * @param searchResults Search results (optional, for context)
 */
export async function* createChatStream(
    game: 'magic' | 'yugioh' | 'hearthstone' | 'lorcana' | 'ptcg',
    messages: ChatMessage[],
    searchResults?: { cardId: string, name: string }[],
): AsyncGenerator<StreamChunk> {
    try {
        // Build context
        let contextMessage = '';
        if (searchResults && searchResults.length > 0) {
            contextMessage = `\n\n当前搜索结果包含以下卡牌：\n${searchResults
                .slice(0, 10)
                .map(c => `- ${c.name} (ID: ${c.cardId})`)
                .join('\n')}`;
        }

        const systemPrompt = getGameSystemPrompt(game) + contextMessage;

        // Convert message format
        const aiMessages = messages.map(m => ({
            role:    m.role,
            content: m.content,
        }));

        // Create streaming response
        const result = streamText({
            model:    qwen('qwen-plus'), // or 'qwen-turbo', 'qwen-max'
            system:   systemPrompt,
            messages: aiMessages as any,
        });

        let fullText = '';

        // Stream text output
        for await (const chunk of result.textStream) {
            fullText += chunk;
            yield {
                type:    'text',
                content: chunk,
            };
        }

        // Parse card embeds
        const { cards } = parseCardEmbeds(fullText, game);

        // Send card information
        for (const card of cards) {
            yield {
                type: 'card',
                card,
            };
        }

        // Done marker
        yield { type: 'done' };
    } catch (error) {
        console.error('Chat stream error:', error);
        yield {
            type:  'error',
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Non-streaming chat (for simple queries)
 */
export async function chat(
    game: 'magic' | 'yugioh' | 'hearthstone' | 'lorcana' | 'ptcg',
    userMessage: string,
    conversationHistory: ChatMessage[] = [],
): Promise<{ response: string, cards: CardEmbed[] }> {
    const systemPrompt = getGameSystemPrompt(game);

    const messages = [
        ...conversationHistory.map(m => ({
            role:    m.role,
            content: m.content,
        })),
        { role: 'user' as const, content: userMessage },
    ];

    try {
        const result = streamText({
            model:    qwen('qwen-plus'), // or 'qwen-turbo', 'qwen-max'
            system:   systemPrompt,
            messages: messages as any,
        });

        let fullText = '';
        for await (const chunk of result.textStream) {
            fullText += chunk;
        }

        const { text: cleanText, cards } = parseCardEmbeds(fullText, game);

        return {
            response: cleanText,
            cards,
        };
    } catch (error) {
        console.error('Chat error:', error);
        return {
            response: '抱歉，我遇到了一些问题。请稍后再试。',
            cards:    [],
        };
    }
}

/**
 * Generate deck building suggestions
 */
export async function generateDeckSuggestions(
    game: 'magic' | 'yugioh' | 'hearthstone',
    deckTheme: string,
    existingCards?: string[],
): Promise<{ suggestions: string, recommendedCards: CardEmbed[] }> {
    const prompt = `用户想要构建一个${deckTheme}主题的卡组。${
        existingCards && existingCards.length > 0
            ? `当前卡组包含: ${existingCards.join(', ')}`
            : ''
    }

请提供：
1. 卡组构建建议
2. 推荐的核心卡牌（使用[Card Name](card:card_id)格式）
3. 简要的策略说明`;

    const result = await chat(game, prompt);

    return {
        suggestions:      result.response,
        recommendedCards: result.cards,
    };
}

/**
 * Analyze card synergy
 */
export async function analyzeCardSynergy(
    game: 'magic' | 'yugioh' | 'hearthstone',
    cardIds: string[],
): Promise<string> {
    const prompt = `分析以下卡牌之间的配合：${cardIds
        .map(id => `[CARD:${id}]`)
        .join(', ')}

请说明：
1. 这些卡牌如何配合
2. 优势和劣势
3. 可以加入的其他卡牌`;

    const result = await chat(game, prompt);
    return result.response;
}
