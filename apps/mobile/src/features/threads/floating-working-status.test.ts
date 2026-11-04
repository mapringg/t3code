import { expect, it } from "vite-plus/test";
import { floatingStatusReservesRoom } from "./floating-working-status";

it("reserves no floating room on Android for a send in flight, which its control never draws", () => {
  const sending = {
    showWorkingControl: false,
    queuedCount: 0,
    hasPreviews: false,
    connected: true,
    sendInFlight: true,
  };
  expect(floatingStatusReservesRoom({ ...sending, platform: "android" })).toBe(false);
  expect(floatingStatusReservesRoom({ ...sending, platform: "ios" })).toBe(true);
  expect(floatingStatusReservesRoom({ ...sending, platform: "android", queuedCount: 1 })).toBe(
    true,
  );
});
