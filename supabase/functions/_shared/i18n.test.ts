import { describe, expect, it } from "vitest";
import bn from "../../../messages/bn.json";
import en from "../../../messages/en.json";
import { STRINGS, statusMessage } from "./i18n.ts";

describe("server strings match /messages", () => {
  it.each([["bn", bn], ["en", en]] as const)("%s", (loc, msgs) => {
    expect(STRINGS[loc].statusTitle).toBe(msgs.push.statusTitle);
    expect(STRINGS[loc].status).toEqual(msgs.status);
    expect(statusMessage(loc, "cleared").body).toBe(msgs.push.statusBody.replace("{status}", msgs.status.cleared));
  });
});
