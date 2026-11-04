import { describe, expect, it } from "vite-plus/test";
import { pullRequestOpening } from "./pullRequestOpening";

const detail = { kind: "detail" };
const summary = { kind: "summary" };

describe("pullRequestOpening", () => {
  it.each([
    ["first open during the push", false, null, summary, summary, "loading"],
    ["first open after the push, detail pending", true, null, summary, summary, "loading"],
    ["first open once detail arrives", true, detail, summary, detail, "overview"],
    ["reopen during the push uses cached detail", false, detail, summary, detail, "status"],
    ["deep link during the push with cached detail", false, detail, undefined, detail, "status"],
    ["deep link with nothing known", true, null, undefined, null, null],
  ] as const)("%s", (_name, entered, cached, listed, identity, body) => {
    expect(pullRequestOpening({ entered, detail: cached, summary: listed })).toEqual({
      identity,
      body,
    });
  });
});
