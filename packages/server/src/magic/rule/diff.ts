import { RuleDiff, RuleItem as IRuleItem, RuleDiffItem, TextDiff } from '@model/magic/schema/rule';

import { and, eq } from 'drizzle-orm';

import _ from 'lodash';
import { diffArrays } from 'diff';
import { diffString } from '@common/util/diff';

import { db } from '@/drizzle';
import { RuleItem } from '../schema/rule';

function isChanged(change: TextDiff[]) {
    if (change.length === 0) {
        return false;
    } else if (change.length === 1) {
        return change[0].type !== 'common';
    } else {
        return true;
    }
}

const regex = /(\{[^}]+\}|\d+(?:\.\d+[a-z]?))/g;

// map '{XXX}' into a single char with unicode private area
function ruleEncode(text: string, map: Record<string, string>): string {
    return text.replaceAll(regex, match => {
        map[match] ??= String.fromCodePoint(Object.keys(map).length + 0xF0000);

        return map[match];
    });
}

export async function getRuleDiff(fromDate: string, toDate: string, lang: string): Promise<RuleDiff | undefined> {
    if (fromDate === toDate) {
        return {
            from: fromDate,
            to:   toDate,
            diff: [],
        };
    }

    const fromItems = await db.select()
        .from(RuleItem)
        .where(and(
            eq(RuleItem.date, fromDate),
            eq(RuleItem.lang, lang),
        ))
        .orderBy(RuleItem.index);

    const toItems = await db.select()
        .from(RuleItem)
        .where(and(
            eq(RuleItem.date, toDate),
            eq(RuleItem.lang, lang),
        ))
        .orderBy(RuleItem.index);

    if (fromItems.length === 0 || toItems.length === 0) {
        return undefined;
    }

    let diff: Partial<RuleDiffItem>[] = [];

    for (const d of diffArrays(fromItems.map(c => c.itemId), toItems.map(c => c.itemId))) {
        if (d.added) {
            for (const v of d.value) { diff.push({ itemId: v, type: 'add' }); }
        } else if (d.removed) {
            for (const v of d.value) { diff.push({ itemId: v, type: 'remove' }); }
        } else {
            for (const v of d.value) { diff.push({ itemId: v }); }
        }
    }

    const contentMoved = diff.filter(d => d.type === 'remove' && diff.some(e => e.itemId === d.itemId && e.type === 'add')).map(d => d.itemId!);

    for (const d of diff) {
        if (contentMoved.includes(d.itemId!) && d.type === 'add') {
            d.type = 'move';
        }
    }

    diff = diff.filter(d => !contentMoved.includes(d.itemId!) || d.type !== 'remove');

    const fromRuleItemMap: Record<string, IRuleItem> = {};
    const toRuleItemMap: Record<string, IRuleItem> = {};

    for (const c of fromItems) { fromRuleItemMap[c.itemId] = c; }
    for (const c of toItems) { toRuleItemMap[c.itemId] = c; }

    for (const d of diff) {
        const oldItem = fromRuleItemMap[d.itemId!];
        const newItem = toRuleItemMap[d.itemId!];

        d.serial = [oldItem?.serial ?? null, newItem?.serial ?? null];
        d.depth = [oldItem?.depth, newItem?.depth];

        if (d.type == null && d.depth[0] !== d.depth[1]) {
            d.type = 'move';
        }

        const diffs = diffString(oldItem?.text ?? '', newItem?.text ?? '', ruleEncode);

        d.text = [];

        for (const diff of diffs) {
            if (typeof diff === 'string') {
                d.text.push({ type: 'common', value: diff });
            } else {
                let isMinor = false;

                const fromId = fromItems.find(c => c.serial?.replace(/\.$/, '') === diff[0].replace(/[.,;–]$/, ''))?.itemId;
                const toId = toItems.find(c => c.serial?.replace(/\.$/, '') === diff[1].replace(/[.,;–]$/, ''))?.itemId;

                if (fromId != null && toId != null && fromId === toId) {
                    isMinor = true;
                }

                d.text.push({
                    type:  'diff',
                    isMinor,
                    value: diff,
                });
            }
        }
    }

    diff = diff.filter(d => d.type != null || (d.text && isChanged(d.text)));

    for (const d of diff) {
        if (!isChanged(d.text!) && d.type == null) {
            delete d.text;
        }
    }

    return {
        from: fromDate,
        to:   toDate,
        diff: diff as RuleDiffItem[],
    } satisfies RuleDiff;
}
