export function checkPrev(prev: string): boolean {
    const prevCode = prev.charCodeAt(0);

    if (prevCode < 12304) {
        if (prevCode < 123) {
            if (prevCode < 40) {
                if (prev !== '$' && prev !== '#') {
                    return true;
                }
            } else if (prevCode > 92 && prev !== '{') {
                return true;
            }
        } else if (prevCode <= 8220) {
            if (prev !== '‘' && prev !== '“') {
                return true;
            }
        } else if (prev !== '‵') {
            switch (prev) {
            case '〈':
            case '《':
            case '「':
            case '『':
            case '【':
                break;
            case '〉':
            case '》':
            case '」':
            case '』':
            default:
                return true;
            }
        }
    } else if (prevCode <= 65284) {
        if (prevCode <= 12317) {
            if (prev !== '〔' && prev !== '〝') {
                return true;
            }
        } else {
            switch (prev) {
            case '﹙':
            case '﹛':
            case '﹝':
            case '＄':
                break;
            case '﹚':
            case '﹜':
            default:
                return true;
            }
        }
    } else if (prevCode <= 65339) {
        if (prev !== '（' && prev !== '［') {
            return true;
        }
    } else if (prev !== '｛' && prev !== '￡') {
        return true;
    }

    return false;
}

export function checkCurr(curr: string): boolean {
    const currCode = curr.charCodeAt(0);

    if (currCode <= 8451) {
        if (currCode <= 125) {
            if (currCode <= 44) {
                if (currCode <= 37) {
                    if (curr !== '!' && curr !== '%') {
                        return true;
                    }
                } else if (curr !== ')' && curr !== ',') {
                    return true;
                }
            } else if (currCode <= 59) {
                if (curr !== '.' && currCode - 58 > 1) {
                    return true;
                }
            } else if (curr !== '?' && curr !== ']' && curr !== '}') {
                return true;
            }
        } else if (currCode <= 8217) {
            if (currCode <= 183) {
                if (curr !== '°' && curr !== '·') {
                    return true;
                }
            } else if (currCode - 8211 > 1 && curr !== '’') {
                return true;
            }
        } else if (currCode <= 8226) {
            if (curr !== '”' && curr !== '•') {
                return true;
            }
        } else if (currCode - 8230 > 1 && currCode - 8242 > 1 && curr !== '℃') {
            return true;
        }
    } else if (currCode <= 65285) {
        if (currCode <= 12318) {
            if (currCode <= 12305) {
                if (currCode - 12289 > 1) {
                    switch (curr) {
                    case '〉':
                    case '》':
                    case '」':
                    case '』':
                    case '】':
                        break;
                    case '《':
                    case '「':
                    case '『':
                    case '【':
                        return true;
                    default:
                        return true;
                    }
                }
            } else if (curr !== '〕' && curr !== '〞') {
                return true;
            }
        } else if (currCode <= 65072) {
            if (curr !== 'ー' && curr !== '︰') {
                return true;
            }
        } else {
            switch (curr) {
            case '﹐':
            case '﹑':
            case '﹒':
            case '﹔':
            case '﹕':
            case '﹖':
            case '﹗':
            case '﹚':
            case '﹜':
            case '﹞':
                break;
            case '﹓':
            case '﹘':
            case '﹙':
            case '﹛':
            case '﹝':
                return true;
            default:
                if (curr !== '！' && curr !== '％') {
                    return true;
                }
                break;
            }
        }
    } else if (currCode <= 65311) {
        if (currCode <= 65292) {
            if (curr !== '）' && curr !== '，') {
                return true;
            }
        } else if (curr !== '．' && currCode - 65306 > 1 && curr !== '？') {
            return true;
        }
    } else if (currCode <= 65373) {
        if (curr !== '］' && curr !== '｝') {
            return true;
        }
    } else if (curr !== 'ｰ' && currCode - 65438 > 1 && curr !== '￠') {
        return true;
    }

    return false;
}

export function canWrapBetween(lang: string, prev: string, curr: string, next: string): boolean {
    const isPrevWs = prev.trim() === '';
    const isCurrWs = curr.trim() === '';

    if ((lang === 'fr' || lang === 'de') && isCurrWs) {
        if (next !== '?' && next !== '«' && next !== '»') {
            if (prev === '«') {
                return false;
            }
        } else {
            return false;
        }
    }

    if (prev === '-') {
        return !'0123456789'.includes(curr);
    }

    if (prev === ';') {
        return true;
    }

    if (curr === '|') {
        return true;
    }

    if (isPrevWs) {
        return false;
    }

    if (isCurrWs) {
        return true;
    }

    if (!checkPrev(prev)) {
        return false;
    }

    if (!checkCurr(curr)) {
        return false;
    }

    if (curr === '。' || curr === '，') {
        return true;
    }

    const currCode = curr.charCodeAt(0);

    if (lang !== 'ko') {
        if (currCode >= 4352 && currCode <= 4607) {
            return true;
        }

        if (currCode >= 12288 && currCode <= 55215) {
            return true;
        }

        if (currCode >= 63744 && currCode <= 64255) {
            return true;
        }

        if (currCode >= 65280 && currCode <= 65439) {
            return true;
        }

        if (currCode >= 65440 && currCode <= 65500) {
            return true;
        }
    }

    return false;
}
