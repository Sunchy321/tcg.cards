query =
    head:singleQuery tail:(ws singleQuery)* {
        return [head, ...tail.map(t => t[1])]
    }

singleQuery
    = cmd:cmd op:op param:param {
        return { cmd, ...op, param }
    }
    / qual:'!'? '#' param:rawString { return { cmd: '#', op: '', qual: qual != null ? ['!'] : [], param } }
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
    [-.A-Za-z_] [-.A-Za-z0-9_]* { return text() }

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