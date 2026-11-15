import type { CartItem } from "@/components/planner/planner-types";

export class PlannerCartSaver {
  private pending: CartItem[] | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private ready = false;
  private keepalive = false;
  private inFlight: Promise<void> | null = null;

  constructor(
    private save: (items: CartItem[], keepalive: boolean) => Promise<void>,
    private onError: (error: boolean) => void,
  ) {}

  schedule(items: CartItem[]) {
    this.pending = items;
    this.ready = false;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.ready = true;
      void this.drain();
    }, 600);
  }

  flush(keepalive = false): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.keepalive ||= keepalive;
    this.ready = this.pending !== null;
    return this.drain();
  }

  private drain(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    if (!this.pending || !this.ready) return Promise.resolve();
    this.inFlight = this.run().finally(() => {
      this.inFlight = null;
      if (this.pending && this.ready) void this.drain();
    });
    return this.inFlight;
  }

  private async run() {
    while (this.pending && this.ready) {
      const items = this.pending;
      this.pending = null;
      this.ready = false;
      try {
        await this.save(items, this.keepalive);
        this.onError(false);
      } catch {
        // Retain failed data for retry without replacing more recent edits.
        if (!this.pending) {
          this.pending = items;
          this.ready = false;
        }
        this.onError(true);
      }
    }
  }
}
