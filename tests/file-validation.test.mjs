import assert from "node:assert/strict";
import test from "node:test";
import { loadTypeScript } from "./load-typescript.mjs";

const { isAllowedAttachmentFile } = await loadTypeScript("../lib/attachments.ts");
const { isSafeInternalPath } = await loadTypeScript("../lib/safe-path.ts");

test("attachment validation requires a supported MIME type and matching extension", () => {
  assert.equal(isAllowedAttachmentFile("roadmap.PDF", "application/pdf"), true);
  assert.equal(isAllowedAttachmentFile("notes.md", "text/plain"), true);
  assert.equal(isAllowedAttachmentFile("roadmap.exe", "application/pdf"), false);
  assert.equal(isAllowedAttachmentFile("roadmap.pdf", "application/octet-stream"), false);
});

test("internal redirect validation accepts local paths and rejects external paths", () => {
  assert.equal(isSafeInternalPath("/projects/example?tab=board"), true);
  assert.equal(isSafeInternalPath("//example.com/path"), false);
  assert.equal(isSafeInternalPath("/\\example.com/path"), false);
  assert.equal(isSafeInternalPath("https://example.com/path"), false);
});
