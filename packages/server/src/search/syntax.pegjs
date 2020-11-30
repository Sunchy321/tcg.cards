query =
    head:singleQuery tail:(ws singleQuery)* {
        return [head, ...tail.map(t => t[1])]
    }

singleQuery
    = type:type op:(':' / '!:' / '=' / '>' / '<' / '>=' / '<=' / '!=') param:param {
        return { type, op, param }
    }
    / param:param { return { param } }
    / [^ ]+ { return { param: { type: 'string', value: text() } } }

type
    = id:id { return id }

param = string / regex / rawString

id =
    [A-Za-z] [A-Za-z0-9]* { return text() }

rawString =
    [^ ]+ { return { type: 'string', value: text() } }

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
