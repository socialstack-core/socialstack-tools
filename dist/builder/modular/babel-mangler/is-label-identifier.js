// @ts-nocheck
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = isLabelIdentifier;
function isLabelIdentifier(path) {
    const node = path.node;
    return path.parentPath.isLabeledStatement({
        label: node
    }) || path.parentPath.isBreakStatement({
        label: node
    }) || path.parentPath.isContinueStatement({
        label: node
    });
}
