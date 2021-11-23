log = action+

action
    = gameStateOnEntityChoice
    / gameStateDebugPrintPowerList

gameStateOnEntityChoice = date:prefix 'GameState.OnEntityChoices() - ' [^\n]* {
    return {
        type: 'gameStateOnEntityChoice',
        date: date
    }
}

gameStateDebugPrintPowerList = date:prefix 'GameState.DebugPrintPowerList() - Count=' count:[0-9]+ {
    return {
        type: 'gameStateDebugPrintPowerList',
        date: date,
        count: Number.parseInt(count)
    }
}

prefix = 'D ' date:([0-9]+ ':' [0-9]+ ':' [0-9]+ '.' [0-9]+) ' ' {
    return date
}