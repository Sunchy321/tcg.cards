"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const logger = __importStar(require("logger"));
const _config_1 = require("@config");
mongoose_1.set('useCreateIndex', true);
function connect(dbName) {
    var _a, _b, _c, _d;
    const ip = _config_1.database.ip;
    const dbInfo = (_b = (_a = _config_1.database) === null || _a === void 0 ? void 0 : _a.dbInfo) === null || _b === void 0 ? void 0 : _b[dbName];
    let conn;
    if (((_c = dbInfo) === null || _c === void 0 ? void 0 : _c.user) && ((_d = dbInfo) === null || _d === void 0 ? void 0 : _d.password)) {
        conn = mongoose_1.createConnection(`mongodb://${ip}/${dbName}`, {
            user: dbInfo.user,
            pass: dbInfo.password,
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
    }
    else {
        conn = mongoose_1.createConnection(`mongodb://${ip}/${dbName}`, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
    }
    conn.once('open', () => {
        logger.main.info(`database ${dbName} is connected`, {
            category: 'database',
        });
    });
    return conn;
}
exports.connect = connect;
//# sourceMappingURL=db.js.map