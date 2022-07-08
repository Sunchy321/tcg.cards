query = head:unary tail:(sep unary)* {
    return {
        type: 'multi',
        seps: tail.map(v => v[0]),
        value: [head, ...tail.map(t => t[1])]
    }
}

sep
    = ws? type:[&|] ws? { return type === '&' ? 'and' : 'or' }
    / ws { return '' }

unary
    = [!-] primary:primary { return { type: 'not', value: primary } }
    / primary:primary { return primary }

primary
    = '(' ws? query:query ws? ')' { return query }
    / '#' param:rawString { return { cmd: '#', op: '', qual: [], param } }
    / cmd:cmd op:op param:param { return { cmd, ...op, param } }
    / param:param { return { cmd: '', op: '', qual: [], param } }

cmd
    = id:id { return id }

param = string / regex / rawString

op =
    (':' / '!:' / '=' / '>=' / '<=' / '>' / '<' / '!=') {
        if (text().startsWith('!')) {
            return { op: text().slice(1), qual: ['!'] };
        } else {
            return { op: text(), qual: [] }
        }
    }

id =
    [A-Za-z_] [-.A-Za-z0-9_]* { return text() }

rawString =
    [^ &|()]+ { return { type: 'string', value: text() } }

string
    = '\'' content:([^\\'] / '\\' .)* '\'' {
        return {
            type: 'string',
            value: text().slice(1, -1).replace(/\\(.)/g, v => v[1])
        }
    }
    / '\"' content:([^\\"] / '\\' .)* '\"' {
        return {
            type: 'string',
            value: text().slice(1, -1).replace(/\\(.)/g, v => v[1])
        }
    }

regex =
    '/' content:([^\\/] / '\\' .)* '/' {
        return {
            type: 'regex',
            value: text().slice(1, -1)
        };
    }

ws = ' '+