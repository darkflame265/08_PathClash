"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServerTimer = void 0;
class ServerTimer {
    constructor() {
        this.handle = null;
    }
    start(durationMs, onExpire) {
        this.clear();
        this.handle = setTimeout(onExpire, durationMs);
    }
    clear() {
        if (this.handle) {
            clearTimeout(this.handle);
            this.handle = null;
        }
    }
}
exports.ServerTimer = ServerTimer;
