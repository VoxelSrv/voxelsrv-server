"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logging = void 0;
const permissions_1 = require("./permissions");
const chalk_1 = __importDefault(require("chalk"));
class Logging {
    constructor(out) {
        this.executor = {
            name: '#console',
            id: '#console',
            send: (...args) => this.normal(...args),
            permissions: new permissions_1.PermissionHolder({ '*': true }),
        };
        this.executorchat = { ...this.executor, send: (...args) => this.chat(...args) };
        this.logFile = out;
    }
    normal(...args) {
        let out = '';
        let cleanOut = '';
        for (var i = 0; i < arguments.length; i++) {
            const msg = arguments[i];
            out = out + '[' + hourNow() + '] ';
            cleanOut = out;
            if (Array.isArray(msg)) {
                msg.forEach((el) => {
                    if (!!el.color && el.color.startsWith('#'))
                        out = out + chalk_1.default.hex(el.color)(el.text);
                    else if (el.color != undefined)
                        out = out + chalk_1.default.keyword(el.color).bold(el.text).toString();
                    else
                        out = out + chalk_1.default.reset(el.text).toString();
                    cleanOut = cleanOut + el.text;
                });
            }
            else {
                out = out + msg;
                cleanOut = cleanOut + msg;
            }
            console.log(out);
            if (this.logFile != undefined)
                this.logFile.write(cleanOut + '\n');
        }
    }
    chat(...args) {
        let out = '';
        let cleanOut = '';
        for (var i = 0; i < arguments.length; i++) {
            out = out + '[' + hourNow() + ' - Chat] ';
            cleanOut = out;
            const msg = arguments[i];
            if (Array.isArray(msg)) {
                msg.forEach((el) => {
                    if (!!el.color && el.color.startsWith('#'))
                        out = out + chalk_1.default.hex(el.color).bold(el.text).toString();
                    else if (el.color != undefined)
                        out = out + chalk_1.default.keyword(el.color).bold(el.text).toString();
                    else
                        out = out + chalk_1.default.yellowBright(el.text);
                    cleanOut = cleanOut + el.text;
                });
            }
            else {
                out = out + chalk_1.default.yellowBright(msg).toString();
                cleanOut = cleanOut + msg;
            }
            console.log(out);
            if (this.logFile != undefined)
                this.logFile.write(cleanOut + '\n');
        }
    }
    warn(...args) {
        let out = '';
        let cleanOut = '';
        for (var i = 0; i < arguments.length; i++) {
            out = out + '[' + hourNow() + ' - Warn] ';
            cleanOut = out;
            const msg = arguments[i];
            if (Array.isArray(msg)) {
                msg.forEach((el) => {
                    if (!!el.color && el.color.startsWith('#'))
                        out = out + chalk_1.default.hex(el.color).bold(el.text).toString();
                    else if (el.color != undefined)
                        out = out + chalk_1.default.keyword(el.color).bold(el.text).toString();
                    else
                        out = out + chalk_1.default.yellow(el.text).toString();
                    cleanOut = cleanOut + el.text;
                });
            }
            else {
                out = out + chalk_1.default.yellow(msg).toString();
                cleanOut = cleanOut + msg;
            }
            console.log(out);
            if (this.logFile != undefined)
                this.logFile.write(cleanOut + '\n');
        }
    }
    error(...args) {
        let out = '';
        let cleanOut = '';
        for (var i = 0; i < arguments.length; i++) {
            out = out + '[' + hourNow() + ' - Error] ';
            cleanOut = out;
            const msg = arguments[i];
            if (Array.isArray(msg)) {
                msg.forEach((el) => {
                    if (!!el.color && el.color.startsWith('#'))
                        out = out + chalk_1.default.hex(el.color).bold(el.text);
                    else if (el.color != undefined)
                        out = out + chalk_1.default.keyword(el.color).bold(el.text);
                    else
                        out = out + chalk_1.default.red(el.text);
                    cleanOut = cleanOut + el.text;
                });
            }
            else {
                out = out + chalk_1.default.red(msg).toString();
                cleanOut = cleanOut + msg;
            }
            console.log(out);
            if (this.logFile != undefined)
                this.logFile.write(cleanOut + '\n');
        }
    }
}
exports.Logging = Logging;
function hourNow() {
    var date = new Date();
    var hour = date.getHours().toString();
    var minutes = date.getMinutes().toString();
    var seconds = date.getSeconds().toString();
    return ((hour.length == 2 ? hour : '0' + hour) +
        ':' +
        (minutes.length == 2 ? minutes : '0' + minutes) +
        ':' +
        (seconds.length == 2 ? seconds : '0' + seconds));
}
//# sourceMappingURL=console.js.map