import { os } from '@orpc/server';
import z from 'zod';

import { convertNaturalToSearch, validateSearchSyntax } from '../ai/query-converter';
import { chat, generateDeckSuggestions, analyzeCardSynergy } from '../ai/chat';

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
