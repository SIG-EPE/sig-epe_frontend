// -------------------------------------------------------
// InactivityTimer — auto-logout after 2h of inactivity
//
// - warning at 60 min (60 min before expiry)
// - logout at 120 min
// - activity before warning resets both timers
// - once warning is visible, only explicit session continuation resets timers
// -------------------------------------------------------

export type InactivityEvent = "warning" | "expire";

export interface InactivityTimerOptions {
  /** Time in ms before warning fires (default: 60 min) */
  warningMs?: number;
  /** Time in ms before expiry fires (default: 120 min) */
  expireMs?: number;
  /** Events that reset the timer */
  events?: string[];
}

export class InactivityTimer {
  private warningTimer: ReturnType<typeof setTimeout> | null = null;
  private expireTimer: ReturnType<typeof setTimeout> | null = null;
  private onWarning: () => void;
  private onExpire: () => void;
  private warningMs: number;
  private expireMs: number;
  private events: string[];
  private isRunning = false;
  private isWarningActive = false;
  private activityHandler: (event: Event) => void;

  constructor(
    onWarning: () => void,
    onExpire: () => void,
    options: InactivityTimerOptions = {},
  ) {
    this.onWarning = onWarning;
    this.onExpire = onExpire;
    this.warningMs = options.warningMs ?? 60 * 60 * 1000; // 60 min
    this.expireMs = options.expireMs ?? 120 * 60 * 1000; // 120 min
    this.events = options.events ?? [
      "pointerdown",
      "keydown",
      "click",
      "scroll",
      "touchstart",
      "visibilitychange",
    ];
    this.activityHandler = this.handleActivity.bind(this);
  }

  /** Start the inactivity timers */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.scheduleTimers();
    this.events.forEach((event) => {
      window.addEventListener(event, this.activityHandler, { passive: true });
    });
  }

  /** Stop and clean up all timers */
  stop(): void {
    this.isRunning = false;
    this.clearTimers();
    this.isWarningActive = false;
    this.events.forEach((event) => {
      window.removeEventListener(event, this.activityHandler);
    });
  }

  /** Manually reset both timers (called on user activity) */
  reset(): void {
    if (!this.isRunning) return;
    this.isWarningActive = false;
    this.clearTimers();
    this.scheduleTimers();
  }

  private handleActivity(event: Event): void {
    if (!this.isRunning || this.isWarningActive) return;

    if (
      event.type === "visibilitychange" &&
      typeof document !== "undefined" &&
      document.visibilityState !== "visible"
    ) {
      return;
    }

    this.reset();
  }

  private scheduleTimers(): void {
    this.warningTimer = setTimeout(() => {
      this.isWarningActive = true;
      this.onWarning();
    }, this.warningMs);

    this.expireTimer = setTimeout(() => {
      this.onExpire();
    }, this.expireMs);
  }

  private clearTimers(): void {
    if (this.warningTimer !== null) {
      clearTimeout(this.warningTimer);
      this.warningTimer = null;
    }
    if (this.expireTimer !== null) {
      clearTimeout(this.expireTimer);
      this.expireTimer = null;
    }
  }
}
