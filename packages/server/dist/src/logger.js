"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const winston_1 = require("winston");
const _config_1 = require("@config");
function formatter(info) {
    const level = info.level[0];
    const tag = info.category != null ? level + '/' + info.category : level;
    return `${info.timestamp} ${tag.padEnd(10, ' ').toUpperCase()} ${info.message}`;
}
exports.main = winston_1.createLogger({
    level: 'info',
    format: winston_1.format.combine(winston_1.format.timestamp(), winston_1.format.printf(formatter)),
    transports: [
        new winston_1.transports.File({
            filename: _config_1.log + '/main.log',
        }),
    ],
});
exports.data = winston_1.createLogger({
    level: 'info',
    format: winston_1.format.combine(winston_1.format.timestamp(), winston_1.format.printf(formatter)),
    transports: [
        new winston_1.transports.File({
            filename: _config_1.log + '/data.log',
        }),
    ],
});
exports.user = winston_1.createLogger({
    level: 'info',
    format: winston_1.format.combine(winston_1.format.timestamp(), winston_1.format.printf(formatter)),
    transports: [
        new winston_1.transports.File({
            filename: _config_1.log + '/user.log',
        }),
    ],
});
//# sourceMappingURL=logger.js.map