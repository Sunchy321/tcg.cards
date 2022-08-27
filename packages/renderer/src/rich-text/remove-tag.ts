export function removeTag(word: string): string {
    let hasTag = false;

    for (const c of word) {
        if (c === '<' || c === '[') {
            hasTag = true;
            break;
        }
    }

    if (!hasTag) {
        return word;
    }

    let inTag = false;
    let result = '';

    for (let i = 0; i < word.length; i += 1) {
        if (word[i] === '<') {
            if (i < word.length - 1) {
                inTag = true;
            }
        } else if (word[i] === '>') {
            inTag = false;
        } else if (word[i] === '[' && i + 2 < word.length && 'dbx'.includes(word[i + 1]) && word[i + 2] === ']') {
            inTag = true;
        } else {
            if (word[i] === ']') {
                if (i - 2 >= 0 && 'dbx'.includes(word[i - 1]) && word[i - 2] === '[') {
                    inTag = false;
                    continue;
                }
                inTag = false;
            }

            if (!inTag) {
                result += word[i];
            }
        }
    }

    return result;
}
