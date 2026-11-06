import { expect, it } from "vite-plus/test";
import { formatElapsed } from "./run-elapsed";

it("ticks a new run from when it showed when the device clock is behind the server's", () => {
  const serverStart = "2026-11-06T12:00:06.000Z";
  const deviceNow = Date.parse("2026-11-06T12:00:03.000Z");
  const shownSince = Date.parse("2026-11-06T12:00:00.000Z");
  expect(formatElapsed(serverStart, deviceNow)).toBe("0s");
  expect(formatElapsed(serverStart, deviceNow, shownSince)).toBe("3s");
  // A run opened long after it started keeps the server's elapsed time.
  expect(formatElapsed("2026-11-06T11:58:00.000Z", deviceNow, shownSince)).toBe("2m 03s");
});
