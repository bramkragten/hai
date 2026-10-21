/**
 * Waiting for Home Assistant to finish installing in a new VM.
 *
 * Until Core runs, Home Assistant OS serves a landing page, which passes on
 * what Supervisor reports: the Core download's progress, and problems that
 * hold it up. Only `manifest.json`, served by Core itself, ends the wait.
 */
import { checkHaUpdated, getHaSetupStatus } from "../api/commands.js";
import type { HaSetupProblem } from "../api/types.js";
import { localize } from "../localization/localize.js";
import type { InstallerError } from "./installer-error.js";
import { pollUntil, throwIfCancelled } from "./polling.js";

/**
 * How long a problem may hold up the install, without the Core download
 * moving, before the wait ends. Supervisor tries again every 30 seconds, so
 * a passing problem clears well within this.
 */
export const HA_SETUP_STALL_MS = 10 * 60 * 1000;

/** What to show while Supervisor installs Home Assistant Core */
export interface HaSetupProgress {
  /** The Core download's progress (0-100), or null while there is none */
  progress: number | null;
  /** The problem holding up the install, or null */
  problem: HaSetupProblem | null;
}

/** What a problem Supervisor reports means for the install */
export function haSetupProblemMessage(problem: HaSetupProblem): string {
  switch (problem) {
    case "no_internet":
      return localize("utils.ha_setup.no_internet");
    case "dns_server_failed":
      return localize("utils.ha_setup.dns_server_failed");
    case "ntp_sync_failed":
      return localize("utils.ha_setup.ntp_sync_failed");
    case "free_space":
      return localize("utils.ha_setup.free_space");
    case "docker_ratelimit":
      return localize("utils.ha_setup.docker_ratelimit");
    case "update_failed":
      return localize("utils.ha_setup.update_failed");
    case "fatal_error":
      return localize("utils.ha_setup.fatal_error");
  }
}

/** A problem held up the install too long. Shaped like a backend error. */
export class HaSetupStalledError extends Error implements InstallerError {
  readonly code: string;
  readonly retryable = true;
  readonly details: Record<string, unknown> = {};

  constructor(
    readonly problem: HaSetupProblem,
    address: string
  ) {
    super(
      `${haSetupProblemMessage(problem)} ${localize("utils.ha_setup.stalled", { address })}`
    );
    this.name = "HaSetupStalledError";
    // A fixed category for diagnostics, one per problem
    this.code = `home_assistant_${problem}`;
  }
}

export interface HaSetupWaitOptions {
  /** Delay between polls, in milliseconds. */
  interval: number;
  /** Give up after this many milliseconds. */
  timeout: number;
  /** Aborting this signal ends the wait with a `CancelledError`. */
  signal: AbortSignal;
  /** Message for the `PollTimeoutError` thrown when the deadline passes. */
  timeoutMessage: string;
  /** Called with what to show, each time Supervisor reports. */
  onProgress: (progress: HaSetupProgress) => void;
}

/**
 * Wait for Home Assistant at `ipAddress` to finish installing, which is when
 * it serves `manifest.json`.
 *
 * A problem Supervisor reports shows at once, while the wait goes on. One
 * that lasts `HA_SETUP_STALL_MS` without the download moving ends the wait
 * with a `HaSetupStalledError`, rather than an hour-long timeout.
 */
export async function waitForHaSetup(
  ipAddress: string,
  { interval, timeout, signal, timeoutMessage, onProgress }: HaSetupWaitOptions
): Promise<void> {
  let problemSince: number | null = null;
  // Any change counts as moving: a download that is tried again starts over
  let lastProgress: number | null | undefined;
  let movedAt = Date.now();

  await pollUntil(
    async () => {
      if (await checkHaUpdated(ipAddress)) return true;

      // No answer is no news: what shows, and its clocks, stay as they are
      const status = await getHaSetupStatus(ipAddress).catch(() => null);
      // A view detached meanwhile must not hear of it
      throwIfCancelled(signal);
      if (!status) return null;

      const now = Date.now();
      const progress = status.core_install_progress;
      if (progress !== lastProgress) {
        lastProgress = progress;
        movedAt = now;
      }
      const problem = status.problems[0] ?? null;
      // Like the landing page, a download at 0% shows as waiting
      onProgress({
        progress: progress !== null && progress > 0 ? progress : null,
        problem,
      });

      if (!problem) {
        problemSince = null;
        return null;
      }
      problemSince ??= now;
      if (now - Math.max(problemSince, movedAt) >= HA_SETUP_STALL_MS) {
        throw new HaSetupStalledError(problem, `http://${ipAddress}`);
      }
      return null;
    },
    {
      interval,
      timeout,
      signal,
      timeoutMessage,
      stopOn: (error) => error instanceof HaSetupStalledError,
    }
  );
}
