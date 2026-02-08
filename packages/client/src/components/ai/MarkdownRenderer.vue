<template>
    <Milkdown />
</template>

<script setup lang="ts">
import { Milkdown, useEditor } from '@milkdown/vue';
import { Editor, rootCtx, defaultValueCtx, editorViewOptionsCtx } from '@milkdown/core';
import { commonmark, linkSchema } from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm';
import { nord } from '@milkdown/theme-nord';
import { prism } from '@milkdown/plugin-prism';
import { $view } from '@milkdown/utils';
import { createApp } from 'vue';
import { useRoute } from 'vue-router';

import '@milkdown/theme-nord/style.css';

// Import CardAvatar components for different games
import MagicCardAvatar from '../magic/CardAvatar.vue';
import YugiohCardAvatar from '../yugioh/CardAvatar.vue';
import HearthstoneCardAvatar from '../hearthstone/CardAvatar.vue';
import LorcanaCardAvatar from '../lorcana/CardAvatar.vue';
import PtcgCardAvatar from '../ptcg/CardAvatar.vue';

const props = defineProps<{
    content: string;
    game?:   string;
}>();

const route = useRoute();

// Determine game from props or route
const currentGame = props.game || (route.path.split('/')[1] as string);

// Map game to CardAvatar component
const cardAvatarComponents: Record<string, any> = {
    magic:       MagicCardAvatar,
    yugioh:      YugiohCardAvatar,
    hearthstone: HearthstoneCardAvatar,
    lorcana:     LorcanaCardAvatar,
    ptcg:        PtcgCardAvatar,
};

// Custom view for card links
const cardLinkView = $view(linkSchema.mark, () => {
    return mark => {
        const url = mark.attrs.href || '';

        // Check if it's a card: protocol link
        if (url.startsWith('card:')) {
            const cardMatch = url.match(/^card:([^?]+)(?:\?mode=(.+))?$/);
            if (cardMatch) {
                const cardId = cardMatch[1];
                const mode = cardMatch[2] || 'compact';

                // Create container for Vue component
                const container = document.createElement('span');
                container.className = 'inline-card-avatar';
                container.style.display = 'inline-block';
                container.style.verticalAlign = 'middle';

                // Get the appropriate CardAvatar component
                const CardAvatarComponent = cardAvatarComponents[currentGame];

                if (CardAvatarComponent) {
                    // Create and mount Vue component
                    const app = createApp(CardAvatarComponent, {
                        id:       cardId,
                        hideText: mode === 'image',
                    });

                    app.mount(container);

                    return {
                        dom:     container,
                        destroy: () => app.unmount(),
                    };
                }
            }
        }

        // Regular link fallback
        const dom = document.createElement('a');
        dom.href = url;
        if (url.startsWith('http://') || url.startsWith('https://')) {
            dom.target = '_blank';
            dom.rel = 'noopener noreferrer';
        }

        return { dom };
    };
});

useEditor(root => Editor
    .make()
    .config(ctx => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, props.content);
        ctx.update(editorViewOptionsCtx, prev => ({
            ...prev,
            editable: () => false,
        }));
        nord(ctx);
    })
    .use(commonmark)
    .use(gfm)
    .use(prism)
    .use(cardLinkView));
</script>

<style lang="scss">
.markdown-renderer {
    // Override Crepe styles for read-only display
    :deep(.milkdown) {
        padding: 0;
        border: none;
        background: transparent;

        .editor {
            padding: 0;
        }

        .ProseMirror {
            cursor: default;
            padding: 0;

            &:focus {
                outline: none;
            }

            user-select: text;
        }
    }

    // Code blocks
    :deep(pre) {
        background: rgba(0, 0, 0, 0.05);
        border-radius: 6px;
        padding: 12px;
        overflow-x: auto;
        margin: 8px 0;

        code {
            background: none;
            padding: 0;
        }
    }

    // Inline code
    :deep(code) {
        background: rgba(0, 0, 0, 0.1);
        padding: 2px 6px;
        border-radius: 4px;
        font-family: 'Courier New', 'Consolas', monospace;
        font-size: 0.9em;
    }

    // Paragraphs
    :deep(p) {
        margin: 0 0 8px 0;
        line-height: 1.6;

        &:last-child {
            margin-bottom: 0;
        }
    }

    // Headings
    :deep(h1), :deep(h2), :deep(h3), :deep(h4), :deep(h5), :deep(h6) {
        margin: 16px 0 8px 0;
        font-weight: 600;
        line-height: 1.25;

        &:first-child {
            margin-top: 0;
        }
    }

    :deep(h1) { font-size: 1.8em; }
    :deep(h2) { font-size: 1.5em; }
    :deep(h3) { font-size: 1.3em; }
    :deep(h4) { font-size: 1.1em; }

    // Links
    :deep(a) {
        color: #1976d2;
        text-decoration: none;

        &:hover {
            text-decoration: underline;
        }
    }

    // Lists
    :deep(ul), :deep(ol) {
        padding-left: 24px;
        margin: 8px 0;

        li {
            margin: 4px 0;
        }
    }

    // Tables
    :deep(table) {
        border-collapse: collapse;
        width: 100%;
        margin: 12px 0;

        th, td {
            border: 1px solid rgba(0, 0, 0, 0.12);
            padding: 8px 12px;
            text-align: left;
        }

        th {
            background: rgba(0, 0, 0, 0.05);
            font-weight: 600;
        }

        tr:hover {
            background: rgba(0, 0, 0, 0.02);
        }
    }

    // Blockquotes
    :deep(blockquote) {
        border-left: 4px solid #1976d2;
        padding-left: 16px;
        margin: 12px 0;
        color: rgba(0, 0, 0, 0.7);
        font-style: italic;
    }

    // Horizontal rule
    :deep(hr) {
        border: none;
        border-top: 2px solid rgba(0, 0, 0, 0.1);
        margin: 16px 0;
    }

    // Bold and italic
    :deep(strong) {
        font-weight: 600;
    }

    :deep(em) {
        font-style: italic;
    }

    // Images
    :deep(img) {
        max-width: 100%;
        height: auto;
        border-radius: 4px;
        margin: 8px 0;
    }

    // Task lists
    :deep(.task-list-item) {
        list-style: none;

        input[type="checkbox"] {
            margin-right: 8px;
            pointer-events: none;
        }
    }

    // Strikethrough
    :deep(del) {
        text-decoration: line-through;
        opacity: 0.7;
    }
}
</style>
