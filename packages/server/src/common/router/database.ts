/* eslint-disable @typescript-eslint/no-empty-object-type */
import { Game } from '@model/schema';
import { PgColumn, PgTableWithColumns } from 'drizzle-orm/pg-core';

export type Column<B extends boolean> = PgColumn<{
    name:              any;
    tableName:         any;
    dataType:          any;
    columnType:        any;
    data:              any;
    driverParam:       any;
    notNull:           B;
    hasDefault:        any;
    isPrimaryKey:      any;
    isAutoincrement:   any;
    hasRuntimeDefault: any;
    enumValues:        any;
    generated:         any;
}, {}, {}>;

export type Table<G extends Game, N extends string, C extends Record<string, any>> = PgTableWithColumns<{
    name:    N;
    schema:  G;
    columns: C;
    dialect: 'pg';
}>;
