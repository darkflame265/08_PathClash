import { EventEmitter } from 'events';

export type MaintenancePhase =
  | 'normal'
  | 'scheduled'
  | 'matchmaking_locked'
  | 'active';

export interface MaintenanceStatus {
  enabled: boolean;
  phase: MaintenancePhase;
  startsAt: number | null;
  noticeAt: number | null;
  matchmakingLocksAt: number | null;
  forceEndsAt: number | null;
  serverNow: number;
  message: string | null;
}

export interface MaintenanceScheduleInput {
  startsAt: number;
  noticeBeforeMs?: number;
  matchmakingLockBeforeMs?: number;
  graceMs?: number;
  message?: string | null;
}

type MaintenanceNoticeKind =
  | 'ten_min'
  | 'matchmaking_locked'
  | 'started'
  | 'ended';

export interface MaintenanceNotice {
  kind: MaintenanceNoticeKind;
  status: MaintenanceStatus;
}

interface ActiveMaintenanceSchedule {
  startsAt: number;
  noticeBeforeMs: number;
  matchmakingLockBeforeMs: number;
  graceMs: number;
  message: string | null;
}

const DEFAULT_NOTICE_BEFORE_MS = 10 * 60 * 1000;
const DEFAULT_MATCHMAKING_LOCK_BEFORE_MS = 5 * 60 * 1000;
const DEFAULT_GRACE_MS = 3 * 60 * 1000;

class MaintenanceController extends EventEmitter {
  private scheduleData: ActiveMaintenanceSchedule | null = null;
  private timers: NodeJS.Timeout[] = [];
  private forceCloseEmittedFor: number | null = null;

  getStatus(now = Date.now()): MaintenanceStatus {
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

    const matchmakingLocksAt =
      schedule.startsAt - schedule.matchmakingLockBeforeMs;
    const noticeAt = schedule.startsAt - schedule.noticeBeforeMs;
    const forceEndsAt = schedule.startsAt + schedule.graceMs;
    const phase: MaintenancePhase =
      now >= schedule.startsAt
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

  schedule(input: MaintenanceScheduleInput): MaintenanceStatus {
    const startsAt = Math.trunc(input.startsAt);
    if (!Number.isFinite(startsAt)) {
      throw new Error('startsAt must be a valid timestamp in milliseconds.');
    }

    this.clearTimers();
    this.scheduleData = {
      startsAt,
      noticeBeforeMs: Math.max(
        0,
        Math.trunc(input.noticeBeforeMs ?? DEFAULT_NOTICE_BEFORE_MS),
      ),
      matchmakingLockBeforeMs: Math.max(
        0,
        Math.trunc(
          input.matchmakingLockBeforeMs ?? DEFAULT_MATCHMAKING_LOCK_BEFORE_MS,
        ),
      ),
      graceMs: Math.max(0, Math.trunc(input.graceMs ?? DEFAULT_GRACE_MS)),
      message: input.message?.trim() || null,
    };
    this.forceCloseEmittedFor = null;
    this.installTimers();
    this.emitChanged();
    return this.getStatus();
  }

  startNow(input?: Omit<MaintenanceScheduleInput, 'startsAt'>): MaintenanceStatus {
    return this.schedule({
      ...input,
      startsAt: Date.now(),
      noticeBeforeMs: 0,
      matchmakingLockBeforeMs: 0,
    });
  }

  cancel(): MaintenanceStatus {
    this.clearTimers();
    this.scheduleData = null;
    this.forceCloseEmittedFor = null;
    const status = this.getStatus();
    this.emit('notice', { kind: 'ended', status } satisfies MaintenanceNotice);
    this.emit('changed', status);
    return status;
  }

  isMatchmakingLocked(now = Date.now()): boolean {
    const status = this.getStatus(now);
    return status.phase === 'matchmaking_locked' || status.phase === 'active';
  }

  isActive(now = Date.now()): boolean {
    return this.getStatus(now).phase === 'active';
  }

  private installTimers(): void {
    const schedule = this.scheduleData;
    if (!schedule) return;

    const now = Date.now();
    const noticeAt = schedule.startsAt - schedule.noticeBeforeMs;
    const matchmakingLocksAt =
      schedule.startsAt - schedule.matchmakingLockBeforeMs;
    const forceEndsAt = schedule.startsAt + schedule.graceMs;

    this.addTimer(noticeAt, () => {
      this.emit('notice', {
        kind: 'ten_min',
        status: this.getStatus(),
      } satisfies MaintenanceNotice);
    });
    this.addTimer(matchmakingLocksAt, () => {
      this.emit('notice', {
        kind: 'matchmaking_locked',
        status: this.getStatus(),
      } satisfies MaintenanceNotice);
      this.emitChanged();
    });
    this.addTimer(schedule.startsAt, () => {
      this.emit('notice', {
        kind: 'started',
        status: this.getStatus(),
      } satisfies MaintenanceNotice);
      this.emitChanged();
    });
    this.addTimer(forceEndsAt, () => {
      if (this.forceCloseEmittedFor === schedule.startsAt) return;
      this.forceCloseEmittedFor = schedule.startsAt;
      this.emit('force-close', this.getStatus());
    });

    if (noticeAt <= now && now < matchmakingLocksAt) {
      this.emit('notice', {
        kind: 'ten_min',
        status: this.getStatus(),
      } satisfies MaintenanceNotice);
    }
    if (matchmakingLocksAt <= now && now < schedule.startsAt) {
      this.emit('notice', {
        kind: 'matchmaking_locked',
        status: this.getStatus(),
      } satisfies MaintenanceNotice);
    }
    if (schedule.startsAt <= now) {
      this.emit('notice', {
        kind: 'started',
        status: this.getStatus(),
      } satisfies MaintenanceNotice);
    }
    if (forceEndsAt <= now) {
      this.emit('force-close', this.getStatus());
    }
  }

  private addTimer(runAt: number, callback: () => void): void {
    const delay = runAt - Date.now();
    if (delay <= 0) return;
    this.timers.push(setTimeout(callback, delay));
  }

  private clearTimers(): void {
    for (const timer of this.timers) {
      clearTimeout(timer);
    }
    this.timers = [];
  }

  private emitChanged(): void {
    this.emit('changed', this.getStatus());
  }
}

export const maintenanceController = new MaintenanceController();
