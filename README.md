# Workflow

Workflow is a project planning application built with Next.js App Router, Supabase
Auth/Postgres, Prisma, Tailwind CSS, and shadcn/ui.

## Requirements

- Node.js 20.9 or newer
- npm
- A Supabase project with a Postgres database

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and fill in the values:

   | Variable | Required | Value |
   | --- | --- | --- |
   | `NEXT_PUBLIC_SITE_URL` | Yes | App origin, e.g. `http://localhost:3000`; no trailing slash |
   | `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase **Project Settings → API → Project URL** |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase publishable key (or legacy anon key) from **Project Settings → API** |
   | `DATABASE_URL` | Yes | Supabase transaction pooler URL (port `6543`) with `pgbouncer=true&sslmode=require` |
   | `DIRECT_URL` | Yes | Supabase direct database URL (port `5432`) with `sslmode=require`; used by Prisma migrations |
   | `RESEND_API_KEY` | For invitations | Resend API key |
   | `RESEND_FROM_EMAIL` | For invitations | Sender on a domain verified in Resend, e.g. `Workflow <invites@example.com>` |
   | `NODE_ENV` | No | Set by Next.js/Vercel; do not configure manually |

   Use URL-encoded database passwords if they contain URL-reserved characters.
   Do not add a Supabase service-role key: it is not used by this app. Google OAuth
   credentials are configured in Supabase, not as app environment variables.

3. Apply the database migrations using the project's direct database URL:

   ```bash
   npx prisma generate
   npm run migrate
   ```

   `migrate` runs `prisma migrate deploy` using `DIRECT_URL`. To create and apply a
   development migration after changing `prisma/schema.prisma`, use
   `npm run db:migrate`. Prisma loads `.env.local` through `prisma.config.ts`.

4. In Supabase **SQL Editor**, run [`supabase/setup.sql`](./supabase/setup.sql)
   after migrations. It enables member-scoped channel/message/notification RLS,
   Realtime for messages and notifications, and the private
   `workflow-attachments` bucket. Supabase Storage must be enabled.

5. In Supabase **Authentication → URL Configuration**, set the Site URL to
   `http://localhost:3000` and allow `http://localhost:3000/auth/callback`.
   Enable email/password. Configure Google under **Authentication → Providers**
   if needed, using the Supabase callback URL shown there in Google Cloud.

6. Start the app:

   ```bash
   npm run dev
   ```

   Open `http://localhost:3000`, create an account, then create a workspace and
   its first project. Supabase email confirmation settings determine whether signup
   signs in immediately or asks you to verify your email first.

## Vercel deployment

1. Create a Supabase project and import the repository into Vercel. Set
   `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `DATABASE_URL`, and `DIRECT_URL` in Vercel
   Environment Variables. Add `RESEND_API_KEY` and `RESEND_FROM_EMAIL` to enable
   invitations. Use Supabase's transaction pooler (port `6543`,
   `pgbouncer=true`) for `DATABASE_URL` and direct connection (port `5432`) for
   `DIRECT_URL`.
2. Apply production migrations before routing traffic. With production
   `DIRECT_URL` configured, run:

   ```bash
   npm run migrate
   ```

   Then run [`supabase/setup.sql`](./supabase/setup.sql) in Supabase SQL Editor.
   Do not run `prisma migrate dev` against production.
3. In Supabase Authentication URL Configuration, set the production Site URL and
   allow the production `/auth/callback` URL. Enable the required auth providers
   and add their callback URLs.
4. Deploy in Vercel. The build command is `prisma generate && next build`; set
   variables for each environment you use and redeploy after changing them. No
   service-role key is required.

## Available checks

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

## Manual integration and security checklist

Run this against a dedicated Supabase test project with the migrations applied.
Use two accounts in separate workspaces (User A and User B), plus a second member
in User A's workspace. Do not use production data for these checks.

- [ ] Sign in with email/password and Google; verify callback URLs, session refresh,
  sign-out, and protected-route redirects.
- [ ] Create a project in User A's workspace and add the second member. Confirm that
  User B cannot discover the project, task, task comments, attachments, watchers,
  project channel, or notifications by changing IDs in page URLs or action requests.
- [ ] As a project member, upload a supported file below 10 MB; verify progress,
  listing, signed download, and deletion by the uploader. Verify a non-uploader
  member cannot delete it, while an authorized manager can.
- [ ] Try an unsupported extension/MIME type and a file over 10 MB. Confirm the
  upload is rejected and no attachment metadata or usable file is left behind.
- [ ] Copy a signed download URL, wait more than 60 seconds, then try it again.
  Confirm it has expired. Confirm a user outside the project cannot request a
  signed download even when given the attachment ID.
- [ ] Have one member watch a task. Add a comment, update the task, and upload a
  task attachment as another member; verify one appropriate notification per event.
  Unwatch and verify no subsequent watcher notifications arrive.
- [ ] Remove a regular member from the project and separately from the workspace.
  Verify their watcher rows and project/channel-linked notifications are removed,
  they cannot reopen project files or chat, and they receive no later task
  notifications. Confirm other workspace members' notifications are unaffected.
- [ ] Attempt project deletion as a manager and confirm it is denied; repeat as the
  owner and confirm it succeeds only for the intended project.
- [ ] Test inbox filters while switching quickly, mark one notification read, mark
  all read, and verify unread counts update across the inbox and navigation.
- [ ] In Supabase SQL Editor, inspect effective RLS policies and test with the
  authenticated roles. Verify that authenticated users cannot read or mutate other
  users' notifications, non-members cannot access project Storage objects, and
  project watchers are limited to accessible tasks.

Live Storage, OAuth, realtime, database-role/RLS, and migration compatibility
results depend on the configured Supabase project; local builds do not verify them.
Review the target database and take a backup before applying migrations. Never run
the migration command against production without explicit approval.

## Phase 1 foundation

The current foundation includes email/password and Google OAuth entry points,
password-reset email requests, protected application routes, owner/manager/member/
viewer permission helpers, workspace and first-project onboarding, a database-backed
dashboard and project overview, and responsive navigation with theme and workspace
switching. The Team page lists workspace members and open task counts, supports
manager role changes and member removal, and provides project membership controls.
Managers can send seven-day email invitations through Resend and create reusable
seven-day share links. Invite tokens are stored as SHA-256 hashes; email invitations
are restricted to the invited email, and accepted members are added to active
workspace projects. The nullable invitation email field is added by the
`20261013205200_team_invitations` migration. Managers can create, update, and archive
projects; only workspace owners can permanently delete them. Project boards and
sortable/filterable task lists support server-validated
task creation, drag-and-drop status changes, task details, assignees, checklists,
comments, and activity history. Project task numbers are assigned by a PostgreSQL
trigger using an atomic per-project counter, so simultaneous task creation cannot
duplicate issue numbers.

The dashboard summarizes live workspace task/project queries and active sprint
health. My Tasks lists and filters the signed-in user's assignments with authorized
status updates. Project Backlog supports drag-and-drop planning, validated sprint
creation, single-active-sprint lifecycle, moving unfinished work to backlog on
completion, sprint point health, and manager-managed per-member capacity. The
`20261013212000_sprint_capacity` migration adds RLS-protected sprint capacity data.

Team chat uses server-authorized project, direct, and task-thread channels, with
Supabase Realtime message delivery, paginated history, channel read positions,
@email mentions, task-key links, and unread indicators. Inbox notifications are
server-scoped to the signed-in user and refresh in realtime; chat messages and
mentions create notifications for conversation members. The
`20261013212700_chat_realtime` migration adds task-thread channels, direct-message
uniqueness, the chat notification type, and Supabase Realtime publication entries
for messages and notifications.

Task and project Files use the private `workflow-attachments` Storage bucket. Files
are uploaded with progress, validated against the allowed file types/extensions and
10 MB limit, and registered in the existing attachment metadata table. The task
drawer and project Files tab offer signed downloads and permission-checked deletion.
Task watchers can follow/unfollow a task, see its watchers, and receive notifications
for comments, assignment changes, edits/status changes, and task-file uploads.
The `20261013223000_private_attachments` migration provisions the private bucket and
Storage/metadata policies; `20261013224000_task_watchers` adds the watcher table,
watcher RLS, and notification types.

Authenticated-user data mutations use server actions and Prisma, with the role and
project-membership checks in `server/permissions.ts`. Supabase RLS is enabled for
all application tables in the initial migration; client-side access is constrained
by the SQL policies. The `20261013220000_channel_member_rls` migration restricts
channel and message access to channel members, prevents non-members from joining
direct conversations, and applies the viewer message-write restriction. The
`20261013221000_owner_project_delete` migration restricts permanent project deletion
to workspace owners. The `20261013190200_task_number_counter` migration adds the
per-project issue counter and validates task assignees at the database boundary.
The board and list initially load the first 500 positioned tasks; the view
shows when a project contains additional tasks. Never expose database connection
strings in client bundles.
