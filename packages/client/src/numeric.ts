export function parseInt(str: string, radix = 10): number | null {
    const num = Number.parseInt(str, radix);

    if (Number.isNaN(num)) {
        return null;
    } else {
        return num;
    }
}
