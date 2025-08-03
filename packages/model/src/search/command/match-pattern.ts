import _ from 'lodash';

export function matchPattern(pattern: string, parameter: string): Record<string, string> | undefined {
    const regexText = pattern.split(/(\{\{[A-Za-z_]+?\}\})/).map(t => {
        if (t.startsWith('{{') && t.endsWith('}}')) {
            return `(?<${t.slice(2, -2)}>.*?)`;
        } else {
            return _.escapeRegExp(t);
        }
    }).join('');

    const regex = new RegExp(`^${regexText}$`);

    return regex.exec(parameter)?.groups;
}
