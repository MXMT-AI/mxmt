/** Guard even transports that resolve after abort; cancellation alone is insufficient. */
export class LatestScenarioRequest {
  private controller: AbortController | null = null;
  start() {
    this.controller?.abort();
    const current = new AbortController();
    this.controller = current;
    return {
      signal: current.signal,
      isCurrent: () => this.controller === current && !current.signal.aborted,
      cancel: () => current.abort(),
    };
  }
  schedule<T>(
    load: (signal: AbortSignal) => Promise<T>,
    commit: (data: T) => void,
    fail: (error: unknown) => void,
  ) {
    const current = this.start();
    const timer = setTimeout(() => {
      if (!current.isCurrent()) return;
      load(current.signal)
        .then((data) => {
          if (current.isCurrent()) commit(data);
        })
        .catch((error) => {
          if (current.isCurrent()) fail(error);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      current.cancel();
    };
  }
  cancel() {
    this.controller?.abort();
  }
}
