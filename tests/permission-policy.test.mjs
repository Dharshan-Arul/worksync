import assert from "node:assert/strict";
import test from "node:test";
import { loadTypeScript } from "./load-typescript.mjs";

const { hasWorkspacePermission } = await loadTypeScript("../server/permission-policy.ts");

test("owners can perform workspace and project deletion operations", () => {
  assert.equal(hasWorkspacePermission("OWNER", "workspace:delete"), true);
  assert.equal(hasWorkspacePermission("OWNER", "project:delete"), true);
});

test("managers can manage projects but cannot delete a project or workspace", () => {
  assert.equal(hasWorkspacePermission("MANAGER", "project:manage"), true);
  assert.equal(hasWorkspacePermission("MANAGER", "project:delete"), false);
  assert.equal(hasWorkspacePermission("MANAGER", "workspace:delete"), false);
});

test("members can edit assigned work but cannot manage projects or members", () => {
  assert.equal(hasWorkspacePermission("MEMBER", "task:edit:assigned"), true);
  assert.equal(hasWorkspacePermission("MEMBER", "project:manage"), false);
  assert.equal(hasWorkspacePermission("MEMBER", "member:manage"), false);
});

test("viewers are limited to viewing and search", () => {
  assert.equal(hasWorkspacePermission("VIEWER", "project:view"), true);
  assert.equal(hasWorkspacePermission("VIEWER", "search:view"), true);
  assert.equal(hasWorkspacePermission("VIEWER", "task:comment"), false);
  assert.equal(hasWorkspacePermission("VIEWER", "task:create"), false);
});
