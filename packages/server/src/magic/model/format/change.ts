interface FormatChange {
    type: string;
    date: Date;
}

class SetChange implements FormatChange {
    type: 'set';
    date: Date;
    format: string;
    add: [string];
    remove: [string];
}

class BanlistChange implements FormatChange {
    type: 'banlist-change';
    date: Date;
    card: string;
    format: string;
    status: string;
}

class BanlistCopy implements FormatChange {
    type: 'banlist-copy';
    date: Date;
    from: string;
    to: string;
    status?: string;
}

class BanlistAdjust implements FormatChange {
    type: 'banlist-adjust';
    date: Date;
    format: string;
    status: string;
}