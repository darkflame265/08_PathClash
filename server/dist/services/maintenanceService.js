"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.maintenanceController = void 0;
const events_1 = require("events");
const DEFAULT_NOTICE_BEFORE_MS = 10 * 60 * 1000;
const DEFAULT_MATCHMAKING_LOCK_BEFORE_MS = 5 * 60 * 1000;
const DEFAULT_GRACE_MS = 3 * 60 * 1000;
function normalizeMaintenanceMessage(message) {
    const trimmed = message?.trim();
    if (!trimmed)
        return null;
    if (trimmed.includes('\uFFFD') || /\?{2,}/.test(trimmed))
        return null;
    return trimmed;
}
class MaintenanceController extends events_1.EventEmitter {
    constructor() {
        super(...arguments);
        this.scheduleData = null;
        this.timers = [];
        this.forceCloseEmittedFor = null;
    }
    getStatus(now = Date.now()) {
        const schedule = this.scheduleData;
        if (!schedule) {
            return {
                enabled: false,
                phase: 'normal',
                startsAt: null,
                noticeAt: null,
                matchmakingLocksAt: null,
                forceEndsAt: null,
                serverNow: now,
                message: null,
            };
        }
        const matchmakingLocksAt = schedule.startsAt - schedule.matchmakingLockBeforeMs;
        const noticeAt = schedule.startsAt - schedule.noticeBeforeMs;
        const forceEndsAt = schedule.startsAt + schedule.graceMs;
        const phase = now >= schedule.startsAt
            ? 'active'
            : now >= matchmakingLocksAt
                ? 'matchmaking_locked'
                : 'scheduled';
        return {
            enabled: true,
            phase,
            startsAt: schedule.startsAt,
            noticeAt,
            matchmakingLocksAt,
            forceEndsAt,
            serverNow: now,
            message: schedule.message,
        };
    }
    schedule(input) {
        const startsAt = Math.trunc(input.startsAt);
        if (!Number.isFinite(startsAt)) {
            throw new Error('startsAt must be a valid timestamp in milliseconds.');
        }
        this.clearTimers();
        this.scheduleData = {
            startsAt,
            noticeBeforeMs: Math.max(0, Math.trunc(input.noticeBeforeMs ?? DEFAULT_NOTICE_BEFORE_MS)),
            matchmakingLockBeforeMs: Math.max(0, Math.trunc(input.matchmakingLockBeforeMs ?? DEFAULT_MATCHMAKING_LOCK_BEFORE_MS)),
            graceMs: Math.max(0, Math.trunc(input.graceMs ?? DEFAULT_GRACE_MS)),
            message: normalizeMaintenanceMessage(input.message),
        };
        this.forceCloseEmittedFor = null;
        this.installTimers();
        this.emitChanged();
        return this.getStatus();
    }
    startNow(input) {
        return this.schedule({
            ...input,
            startsAt: Date.now(),
            noticeBeforeMs: 0,
            matchmakingLockBeforeMs: 0,
        });
    }
    cancel() {
        this.clearTimers();
        this.scheduleData = null;
        this.forceCloseEmittedFor = null;
        const status = this.getStatus();
        this.emit('notice', { kind: 'ended', status });
        this.emit('changed', status);
        return status;
    }
    isMatchmakingLocked(now = Date.now()) {
        const status = this.getStatus(now);
        return status.phase === 'matchmaking_locked' || status.phase === 'active';
    }
    isActive(now = Date.now()) {
        return this.getStatus(now).phase === 'active';
    }
    installTimers() {
        const schedule = this.scheduleData;
        if (!schedule)
            return;
        const now = Date.now();
        const noticeAt = schedule.startsAt - schedule.noticeBeforeMs;
        const matchmakingLocksAt = schedule.startsAt - schedule.matchmakingLockBeforeMs;
        const forceEndsAt = schedule.startsAt + schedule.graceMs;
        this.addTimer(noticeAt, () => {
            this.emit('notice', {
                kind: 'ten_min',
                status: this.getStatus(),
            });
        });
        this.addTimer(matchmakingLocksAt, () => {
            this.emit('notice', {
                kind: 'matchmaking_locked',
                status: this.getStatus(),
            });
            this.emitChanged();
        });
        this.addTimer(schedule.startsAt, () => {
            this.emit('notice', {
                kind: 'started',
                status: this.getStatus(),
            });
            this.emitChanged();
        });
        this.addTimer(forceEndsAt, () => {
            if (this.forceCloseEmittedFor === schedule.startsAt)
                return;
            this.forceCloseEmittedFor = schedule.startsAt;
            this.emit('force-close', this.getStatus());
        });
        if (noticeAt <= now && now < matchmakingLocksAt) {
            this.emit('notice', {
                kind: 'ten_min',
                status: this.getStatus(),
            });
        }
        if (matchmakingLocksAt <= now && now < schedule.startsAt) {
            this.emit('notice', {
                kind: 'matchmaking_locked',
                status: this.getStatus(),
            });
        }
        if (schedule.startsAt <= now) {
            this.emit('notice', {
                kind: 'started',
                status: this.getStatus(),
            });
        }
        if (forceEndsAt <= now) {
            this.emit('force-close', this.getStatus());
        }
    }
    addTimer(runAt, callback) {
        const delay = runAt - Date.now();
        if (delay <= 0)
            return;
        this.timers.push(setTimeout(callback, delay));
    }
    clearTimers() {
        for (const timer of this.timers) {
            clearTimeout(timer);
        }
        this.timers = [];
    }
    emitChanged() {
        this.emit('changed', this.getStatus());
    }
}
exports.maintenanceController = new MaintenanceController();
