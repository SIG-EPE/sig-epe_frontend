// -------------------------------------------------------
// InactivityTimer — auto-logout after 2h of inactivity
//
// - warning at 110 min (10 min before expiry)
// - logout at 120 min
// - any user interaction resets both timers
// -------------------------------------------------------

export type InactivityEvent = "warning" | "expire";

export interface InactivityTimerOptions {
  /** Time in ms before warning fires (default: 110 min) */
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
  private resetHandler: () => void;

  constructor(
    onWarning: () => void,
    onExpire: () => void,
    options: InactivityTimerOptions = {},
  ) {
    this.onWarning = onWarning;
    this.onExpire = onExpire;
    this.warningMs = options.warningMs ?? 110 * 60 * 1000; // 110 min
    this.expireMs = options.expireMs ?? 120 * 60 * 1000; // 120 min
    this.events = options.events ?? [
      "mousemove",
      "keydown",
      "click",
      "scroll",
      "touchstart",
    ];
    this.resetHandler = this.reset.bind(this);
  }

  /** Start the inactivity timers */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.scheduleTimers();
    this.events.forEach((event) => {
      window.addEventListener(event, this.resetHandler, { passive: true });
    });
  }

  /** Stop and clean up all timers */
  stop(): void {
    this.isRunning = false;
    this.clearTimers();
    this.events.forEach((event) => {
      window.removeEventListener(event, this.resetHandler);
    });
  }

  /** Manually reset both timers (called on user activity) */
  reset(): void {
    if (!this.isRunning) return;
    this.clearTimers();
    this.scheduleTimers();
  }

  private scheduleTimers(): void {
    this.warningTimer = setTimeout(() => {
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
