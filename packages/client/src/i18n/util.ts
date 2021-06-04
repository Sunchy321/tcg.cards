export function escapeBrace(text: string) {
    return text.replace(/[{}]/g, m => `{'${m}'}`);
}
