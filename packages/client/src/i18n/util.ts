export function escapeBrace(text: string): string {
    return text.replace(/[{}]/g, m => `{'${m}'}`);
}
