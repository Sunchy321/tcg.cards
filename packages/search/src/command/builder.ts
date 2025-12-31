/* eslint-disable @typescript-eslint/no-empty-object-type */
import { MetaBase } from '@search/base/meta';

import { Merge, merge } from '@search/util/merge';
import { CommandInputOption, CommandOption, Operator, Qualifier } from './types';

import { castArray, omit, uniq } from 'lodash';

export class CommandBuilder<
    Type extends string,
    Input extends CommandInputOption,
    MetaInput extends MetaBase,
    MetaValue extends MetaBase,
> {
    options: CommandOption<Type, Input, MetaValue>;

    constructor(options: CommandOption<Type, Input, MetaValue>) {
        this.options = options;
    }

    use<U>(predefined: U): CommandBuilder<Type, Input, MetaInput, MetaValue> & U {
        return Object.assign(
            new CommandBuilder<Type, Input, MetaInput, MetaValue>({
                ...this.options,
            }),
            predefined,
        );
    }

    $meta<M extends MetaBase>(): CommandBuilder<Type, Input, Merge<MetaInput, M>, MetaValue>;
    $meta<M extends MetaBase>(meta: M): CommandBuilder<Type, Input, Merge<MetaInput, M>, Merge<MetaValue, M>>;

    $meta<M extends MetaBase>(meta?: M) {
        if (meta == null) {
            return new CommandBuilder<Type, Input, Merge<MetaInput, M>, MetaValue>({
                ...this.options,
            });
        } else {
            return new CommandBuilder<Type, Input, Merge<MetaInput, M>, Merge<MetaValue, M>>({
                ...this.options,
                meta: merge(this.options.meta, meta),
            });
        }
    }

    $type<NewType extends string>(type: NewType) {
        return new CommandBuilder<NewType, Input, MetaInput, MetaValue>({
            ...this.options,
            type,
        });
    }

    meta<M extends MetaInput>(meta: M) {
        return new CommandBuilder<Type, Input, Merge<MetaInput, M>, Merge<MetaValue, M>>({
            ...this.options,
            meta: merge(this.options.meta, meta),
        });
    }

    id(id: string) {
        return new CommandBuilder<Type, Input, MetaInput, MetaValue>({
            ...this.options,
            id,
        });
    }

    alt(alt: string | string[]) {
        return new CommandBuilder<Type, Input, MetaInput, MetaValue>({
            ...this.options,
            alternatives: uniq([...this.options.alternatives ?? [], ...castArray(alt)]),
        });
    }

    op<Op extends Operator>(operators: Op[]) {
        return new CommandBuilder<Type, Merge<Input, { operators: Op[] }>, MetaInput, MetaValue>(omit({
            ...this.options,
            input: merge(this.options.input, { operators }),
        }, 'type'));
    }

    qual<Qual extends Qualifier>(qualifiers: Qual[]) {
        return new CommandBuilder<Type, Merge<Input, { qualifiers: Qual[] }>, MetaInput, MetaValue>(omit({
            ...this.options,
            input: merge(this.options.input, { qualifiers }),
        }, 'type'));
    }

    mod<Mod extends string[] | Record<string, string>>(modifiers: Mod) {
        return new CommandBuilder<Type, Merge<Input, { modifiers: Mod }>, MetaInput, MetaValue>({
            ...this.options,
            input: merge(this.options.input, { modifiers }),
        });
    }

    pattern<P extends string, AM extends boolean = false>(pattern: P, alwaysMatch?: AM) {
        return new CommandBuilder<Type, Merge<Input, { operators: (Input['operators'][0] | '')[], pattern: P, alwaysMatch: AM }>, MetaInput, MetaValue>({
            ...this.options,
            input: merge(this.options.input, {
                operators:   uniq([...this.options.input.operators, '']),
                pattern,
                alwaysMatch: alwaysMatch ?? false as AM,
            }),
        });
    }

    regex<B extends boolean>(regex: B) {
        return new CommandBuilder<Type, Merge<Input, { regex: B }>, MetaInput, MetaValue>({
            ...this.options,
            input: merge(this.options.input, { regex }),
        });
    }

    done(): CommandOption<Type, Input, MetaValue> {
        return this.options;
    }
}

export type CommandInputOptionInitial = {
    operators:    never[];
    qualifiers:   never[];
    modifiers?:   never;
    pattern?:     never;
    alwaysMatch?: never;
    regex:        false;
};

export const c = new CommandBuilder<
    never,
    CommandInputOptionInitial,
    {},
    {}
>({
    meta:  {},
    input: {
        operators:  [],
        qualifiers: [],
        regex:      false,
    },
});
