import { ORPCError } from '@orpc/server';
import { os as create } from '@/orpc';
import z from 'zod';

import { convertNaturalToSearch, validateSearchSyntax } from './query-converter';
import { chat, generateDeckSuggestions, analyzeCardSynergy } from './chat';
import { auth } from '@/auth';
import { db } from '@/drizzle';
import { apikeys } from '@/auth/schema';
import { eq } from 'drizzle-orm';

// AI feature rate limit configuration
const AI_RATE_LIMIT = {
    timeWindow:  86400000, // 24 hours (milliseconds)
    maxRequests: 200, // Maximum 200 requests per day
};

async function getOrCreateAIApiKey(userId: string) {
    // Query user's API keys from database
    const allKeys = await db.select()
        .from(apikeys)
        .where(eq(apikeys.userId, userId));

    // Find the key dedicated to AI features
    const aiKey = allKeys.find(k => k.name === 'ai-features');

    if (aiKey) {
        return aiKey;
    }

    // Create a new API key using better-auth API
    const result = await auth.api.createApiKey({
        body: {
            userId,
            name:                'ai-features',
            rateLimitEnabled:    true,
            rateLimitTimeWindow: AI_RATE_LIMIT.timeWindow,
            rateLimitMax:        AI_RATE_LIMIT.maxRequests,
        },
    });

    return result;
}

async function checkAndUpdateRateLimit(userId: string) {
    const apiKey = await getOrCreateAIApiKey(userId);

    // Check rate limit
    if (apiKey.rateLimitEnabled) {
        const now = new Date();
        const lastRequest = apiKey.lastRequest?.getTime() ?? 0;
        const timeWindow = apiKey.rateLimitTimeWindow ?? AI_RATE_LIMIT.timeWindow;
        const maxRequests = apiKey.rateLimitMax ?? AI_RATE_LIMIT.maxRequests;

        // Check if time window needs to be reset
        if (now.getTime() - lastRequest > timeWindow) {
            // Time window has passed, reset counter (use database directly)
            await db.update(apikeys)
                .set({
                    requestCount: 1,
                    remaining:    maxRequests - 1,
                    lastRequest:  now,
                    updatedAt:    now,
                })
                .where(eq(apikeys.id, apiKey.id));

            return { allowed: true, remaining: maxRequests - 1 };
        }

        const remaining = apiKey.remaining ?? maxRequests;

        if (remaining <= 0) {
            return { allowed: false, remaining: 0 };
        }

        // Update counter (use database directly)
        await db.update(apikeys)
            .set({
                requestCount: (apiKey.requestCount || 0) + 1,
                remaining:    remaining - 1,
                lastRequest:  now,
                updatedAt:    now,
            })
            .where(eq(apikeys.id, apiKey.id));

        return { allowed: true, remaining: remaining - 1 };
    }

    return { allowed: true, remaining: -1 }; // Rate limiting not enabled
}

const os = create
    .use(async ({ context, next }) => {
        const { user } = context;

        if (user == null) {
            throw new ORPCError('UNAUTHORIZED', { message: 'You must be logged in to use AI features.' });
        }

        // Check and update rate limit
        const { allowed, remaining } = await checkAndUpdateRateLimit(user.id);

        if (!allowed) {
            throw new ORPCError('TOO_MANY_REQUESTS', {
                message: `Daily AI API limit reached. Please try again tomorrow. (Remaining: ${remaining})`,
            });
        }

        return next({ context });
    });

// Query conversion route
const convert = os
    .route({
        method:      'POST',
        description: 'Convert natural language query to search syntax',
        tags:        ['AI', 'Search'],
    })
    .input(z.object({
        game:  z.enum(['magic', 'yugioh', 'hearthstone', 'lorcana', 'ptcg']),
        query: z.string().min(1).max(500),
    }))
    .output(z.object({
        syntax:      z.string(),
        explanation: z.string(),
        confidence:  z.enum(['high', 'medium', 'low']),
        valid:       z.boolean(),
        error:       z.string().optional(),
    }))
    .handler(async ({ input }) => {
        const { game, query } = input;

        const result = await convertNaturalToSearch(game, query);
        const validation = validateSearchSyntax(result.syntax);

        return {
            ...result,
            valid: validation.valid,
            error: validation.error,
        };
    });

// Chat route
const chatMessage = os
    .route({
        method:      'POST',
        description: 'Chat with AI assistant',
        tags:        ['AI', 'Chat'],
    })
    .input(z.object({
        game:    z.enum(['magic', 'yugioh', 'hearthstone', 'lorcana', 'ptcg']),
        message: z.string().min(1).max(2000),
        history: z.array(z.object({
            role:    z.enum(['user', 'assistant', 'system']),
            content: z.string(),
        })).optional(),
    }))
    .output(z.object({
        response: z.string(),
        cards:    z.array(z.object({
            cardId: z.string(),
            mode:   z.enum(['image', 'text', 'compact']),
            game:   z.string(),
        })),
    }))
    .handler(async ({ input }) => {
        const { game, message, history = [] } = input;

        const result = await chat(game, message, history);

        return result;
    });

// Deck building suggestions route
const deckSuggestions = os
    .route({
        method:      'POST',
        description: 'Generate deck building suggestions',
        tags:        ['AI', 'Deck'],
    })
    .input(z.object({
        game:          z.enum(['magic', 'yugioh', 'hearthstone']),
        deckTheme:     z.string().min(1).max(200),
        existingCards: z.array(z.string()).optional(),
    }))
    .output(z.object({
        suggestions:      z.string(),
        recommendedCards: z.array(z.object({
            cardId: z.string(),
            mode:   z.enum(['image', 'text', 'compact']),
            game:   z.string(),
        })),
    }))
    .handler(async ({ input }) => {
        const { game, deckTheme, existingCards } = input;

        const result = await generateDeckSuggestions(game, deckTheme, existingCards);

        return result;
    });

// Card synergy analysis route
const cardSynergy = os
    .route({
        method:      'POST',
        description: 'Analyze synergy between cards',
        tags:        ['AI', 'Analysis'],
    })
    .input(z.object({
        game:    z.enum(['magic', 'yugioh', 'hearthstone']),
        cardIds: z.array(z.string()).min(2).max(10),
    }))
    .output(z.object({
        analysis: z.string(),
    }))
    .handler(async ({ input }) => {
        const { game, cardIds } = input;

        const analysis = await analyzeCardSynergy(game, cardIds);

        return { analysis };
    });

export const aiTrpc = {
    convert,
    chat: chatMessage,
    deckSuggestions,
    cardSynergy,
};
