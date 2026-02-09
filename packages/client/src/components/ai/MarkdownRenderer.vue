<script setup lang="ts">
import { computed, h, type VNode } from 'vue';
import { useRoute } from 'vue-router';
import MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import hljs from 'highlight.js';

import 'highlight.js/styles/github.css';

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
const currentGame = computed(() => props.game ?? (route.path.split('/')[1] as string));

// Map game to CardAvatar component
const cardAvatarComponents: Record<string, any> = {
    magic:       MagicCardAvatar,
    yugioh:      YugiohCardAvatar,
    hearthstone: HearthstoneCardAvatar,
    lorcana:     LorcanaCardAvatar,
    ptcg:        PtcgCardAvatar,
};

// Initialize markdown-it with plugins
const md: MarkdownIt = new MarkdownIt({
    html:        true,
    linkify:     true,
    typographer: true,
    breaks:      true,
    highlight(str, lang) {
        if (lang && hljs.getLanguage(lang)) {
            try {
                return hljs.highlight(str, { language: lang }).value;
            } catch (_) {
                // Ignore
            }
        }
        return md.utils.escapeHtml(str);
    },
});

// Token to VNode converter
function tokensToVNodes(tokens: Token[]): (VNode | string)[] {
    const vnodes: (VNode | string)[] = [];
    let i = 0;

    while (i < tokens.length) {
        const token = tokens[i];

        if (token.type === 'inline') {
            vnodes.push(...tokensToVNodes(token.children || []));
            i++;
        } else if (token.type.endsWith('_open')) {
            // Find matching close token
            const tagName = token.tag;
            let depth = 1;
            let closeIdx = i + 1;

            while (closeIdx < tokens.length && depth > 0) {
                if (tokens[closeIdx].tag === tagName) {
                    if (tokens[closeIdx].type.endsWith('_open')) {
                        depth++;
                    } else if (tokens[closeIdx].type.endsWith('_close')) {
                        depth--;
                    }
                }
                if (depth > 0) closeIdx++;
            }

            // Get children tokens
            const childTokens = tokens.slice(i + 1, closeIdx);
            const children = tokensToVNodes(childTokens);

            // Handle special cases
            if (token.type === 'link_open') {
                const href = token.attrGet('href') || '';

                // Check for card: protocol
                if (href.startsWith('card:')) {
                    const cardMatch = href.match(/^card:([^?]+)(?:\?mode=(.+))?$/);
                    if (cardMatch) {
                        const cardId = cardMatch[1];
                        const mode = cardMatch[2] || 'compact';
                        const CardAvatarComponent = cardAvatarComponents[currentGame.value];

                        if (CardAvatarComponent) {
                            vnodes.push(
                                h('span', { class: 'inline-card-avatar' }, [
                                    h(CardAvatarComponent, {
                                        id:       cardId,
                                        hideText: mode === 'image',
                                    }),
                                ]),
                            );
                            i = closeIdx + 1;
                            continue;
                        }
                    }
                }

                // Regular link
                const attrs: Record<string, string> = { href };
                if (href.startsWith('http://') || href.startsWith('https://')) {
                    attrs.target = '_blank';
                    attrs.rel = 'noopener noreferrer';
                }
                vnodes.push(h('a', attrs, children));
            } else if (token.type === 'code_block' || token.type === 'fence') {
                const lang = token.info || '';
                const code = token.content;
                let highlighted = code;

                if (lang && hljs.getLanguage(lang)) {
                    try {
                        highlighted = hljs.highlight(code, { language: lang }).value;
                    } catch (_) {
                        highlighted = md.utils.escapeHtml(code);
                    }
                } else {
                    highlighted = md.utils.escapeHtml(code);
                }

                vnodes.push(
                    h('pre', { class: 'hljs' }, [
                        h('code', { innerHTML: highlighted }),
                    ]),
                );
            } else {
                // Regular element
                const attrs: Record<string, any> = {};
                if (token.attrs) {
                    token.attrs.forEach(([name, value]) => {
                        attrs[name] = value;
                    });
                }

                vnodes.push(h(tagName, attrs, children));
            }

            i = closeIdx + 1;
        } else if (token.type === 'text') {
            vnodes.push(token.content);
            i++;
        } else if (token.type === 'code_inline') {
            vnodes.push(h('code', token.content));
            i++;
        } else if (token.type === 'softbreak') {
            vnodes.push('\n');
            i++;
        } else if (token.type === 'hardbreak') {
            vnodes.push(h('br'));
            i++;
        } else if (token.type === 'html_block' || token.type === 'html_inline') {
            vnodes.push(h('span', { innerHTML: token.content }));
            i++;
        } else {
            i++;
        }
    }

    return vnodes;
}

const render = () => {
    const tokens = md.parse(props.content, {});
    const vnodes = tokensToVNodes(tokens);
    return h('div', { class: 'markdown-renderer' }, vnodes);
};
</script>

<template>
    <render />
</template>

<style lang="scss">
.markdown-renderer {
    line-height: 1.7;
    font-size: 14px;
    color: inherit;
    word-wrap: break-word;
    overflow-wrap: break-word;

    // Paragraphs
    p {
        margin: 0 0 10px 0;
        line-height: 1.7;

        &:last-child {
            margin-bottom: 0;
        }
    }

    // Headings
    h1, h2, h3, h4, h5, h6 {
        margin: 16px 0 10px 0;
        font-weight: 600;
        line-height: 1.3;
        color: inherit;

        &:first-child {
            margin-top: 4px;
        }
    }

    h1 {
        font-size: 1.6em;
        border-bottom: 1px solid rgba(0, 0, 0, 0.1);
        padding-bottom: 6px;
    }

    h2 {
        font-size: 1.4em;
        border-bottom: 1px solid rgba(0, 0, 0, 0.08);
        padding-bottom: 4px;
    }

    h3 { font-size: 1.25em; }
    h4 { font-size: 1.1em; }
    h5 { font-size: 1em; font-weight: 600; }
    h6 { font-size: 0.95em; font-weight: 600; opacity: 0.8; }

    // Links
    a {
        color: #1976d2;
        text-decoration: none;
        transition: all 0.2s;

        &:hover {
            text-decoration: underline;
            opacity: 0.8;
        }
    }

    // Code blocks
    pre {
        background: rgba(0, 0, 0, 0.05);
        border-radius: 6px;
        padding: 12px 16px;
        overflow-x: auto;
        margin: 10px 0;
        border: 1px solid rgba(0, 0, 0, 0.08);
        font-size: 13px;

        code {
            background: none;
            padding: 0;
            border: none;
            font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Consolas', monospace;
            font-size: 13px;
            line-height: 1.5;
            color: inherit;
        }
    }

    // Inline code
    code {
        background: rgba(0, 0, 0, 0.08);
        padding: 2px 6px;
        border-radius: 3px;
        font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Consolas', monospace;
        font-size: 0.92em;
        border: 1px solid rgba(0, 0, 0, 0.08);
        color: inherit;
    }

    // Lists
    ul, ol {
        padding-left: 24px;
        margin: 10px 0;

        li {
            margin: 4px 0;
            line-height: 1.7;

            > ul, > ol {
                margin: 4px 0;
            }
        }
    }

    ul {
        list-style-type: disc;

        ul {
            list-style-type: circle;

            ul {
                list-style-type: square;
            }
        }
    }

    ol {
        list-style-type: decimal;
    }

    // Tables
    table {
        border-collapse: collapse;
        width: 100%;
        margin: 12px 0;
        display: block;
        overflow-x: auto;
        font-size: 0.95em;

        th, td {
            border: 1px solid rgba(0, 0, 0, 0.12);
            padding: 8px 12px;
            text-align: left;
        }

        th {
            background: rgba(0, 0, 0, 0.05);
            font-weight: 600;
        }

        tr {
            &:nth-child(even) {
                background: rgba(0, 0, 0, 0.02);
            }

            &:hover {
                background: rgba(0, 0, 0, 0.04);
            }
        }
    }

    // Blockquotes
    blockquote {
        border-left: 3px solid rgba(0, 0, 0, 0.2);
        padding: 2px 0 2px 14px;
        margin: 10px 0;
        opacity: 0.85;
        font-style: italic;

        > :first-child {
            margin-top: 0;
        }

        > :last-child {
            margin-bottom: 0;
        }
    }

    // Horizontal rule
    hr {
        height: 1px;
        padding: 0;
        margin: 16px 0;
        background-color: rgba(0, 0, 0, 0.1);
        border: 0;
    }

    // Bold and italic
    strong {
        font-weight: 600;
    }

    em {
        font-style: italic;
    }

    // Images
    img {
        max-width: 100%;
        height: auto;
        border-radius: 6px;
        margin: 8px 0;
        box-sizing: border-box;
    }

    // Task lists
    input[type="checkbox"] {
        margin-right: 6px;
        vertical-align: middle;
    }

    // Strikethrough
    del {
        text-decoration: line-through;
        opacity: 0.65;
    }

    // Card link container
    .card-link-container {
        display: inline;
    }

    .inline-card-avatar {
        display: inline-block;
        vertical-align: middle;
        margin: 0 2px;
    }

    // Highlight.js code styling
    .hljs {
        display: block;
        overflow-x: auto;
    }
}
</style>
