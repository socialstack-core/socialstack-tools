"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const sass_1 = __importDefault(require("sass"));
function transform(code, globalContent, path, minify) {
    var log = '';
    var result = sass_1.default.compileString('@use "loc:global" as *;\r\n' + code, {
        style: minify ? 'compressed' : undefined,
        url: path ? 'file://' + path : undefined,
        charset: false,
        logger: {
            warn(message, options) {
                if (options.span) {
                    var span = options.span;
                    log += `${span.url}:${span.start.line}:${span.start.column}: ` +
                        `${message}\n`;
                }
                else {
                    log += `::: ${message}\n`;
                }
            }
        },
        importers: [{
                canonicalize(url) {
                    if (url != 'loc:global')
                        return null;
                    return new URL(url);
                },
                load(canonicalUrl) {
                    return {
                        contents: globalContent,
                        syntax: 'scss'
                    };
                }
            }]
    });
    if (log) {
        console.log("SCSS warning: ", log);
    }
    var css = result.css.toString();
    return css;
}
exports.default = { transform };
