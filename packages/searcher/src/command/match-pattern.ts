export default function matchPattern(pattern: string, parameter: string): Record<string, string> | undefined {
    const regexText = pattern.replace(/\{\{([a-z]+)\}\}/g, (_, name) => `(?<${name}>.*?)`);
    const regex = new RegExp(regexText);

    return regex.exec(parameter)?.groups;
}
