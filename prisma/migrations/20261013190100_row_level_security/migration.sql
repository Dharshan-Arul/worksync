-- Supabase RLS policies and guards for application-owned tables.
CREATE OR REPLACE FUNCTION public.workflow_workspace_role(_workspace_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT "role"::text
  FROM public."WorkspaceMember"
  WHERE "workspaceId" = _workspace_id AND "userId" = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.workflow_can_see_profile(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public."WorkspaceMember" mine
    JOIN public."WorkspaceMember" theirs
      ON theirs."workspaceId" = mine."workspaceId"
    WHERE mine."userId" = auth.uid()
      AND theirs."userId" = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.workflow_can_claim_workspace(_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."Workspace" w
    WHERE w."id" = _workspace_id AND w."createdById" = auth.uid()
  )
  AND NOT EXISTS (
    SELECT 1 FROM public."WorkspaceMember" wm
    WHERE wm."workspaceId" = _workspace_id
  )
$$;

CREATE OR REPLACE FUNCTION public.workflow_can_access_project(_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public."Project" p
    WHERE p."id" = _project_id
      AND (
        public.workflow_workspace_role(p."workspaceId") IN ('OWNER', 'MANAGER')
        OR (
          public.workflow_workspace_role(p."workspaceId") IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public."ProjectMember" pm
            WHERE pm."projectId" = p."id" AND pm."userId" = auth.uid()
          )
        )
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.workflow_can_contribute_to_project(_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public."Project" p
    WHERE p."id" = _project_id
      AND (
        public.workflow_workspace_role(p."workspaceId") IN ('OWNER', 'MANAGER')
        OR (
          public.workflow_workspace_role(p."workspaceId") = 'MEMBER'
          AND EXISTS (
            SELECT 1 FROM public."ProjectMember" pm
            WHERE pm."projectId" = p."id" AND pm."userId" = auth.uid()
          )
        )
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.workflow_can_edit_task(_task_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."Task" t
    WHERE t."id" = _task_id
      AND (
        public.workflow_workspace_role(
          (SELECT p."workspaceId" FROM public."Project" p WHERE p."id" = t."projectId")
        ) IN ('OWNER', 'MANAGER')
        OR (
          t."assigneeId" = auth.uid()
          AND public.workflow_can_contribute_to_project(t."projectId")
        )
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.workflow_can_access_channel(_channel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."Channel" c
    WHERE c."id" = _channel_id
      AND (
        (
          c."type" = 'PROJECT'
          AND public.workflow_workspace_role(c."workspaceId") IN ('OWNER', 'MANAGER')
        )
        OR EXISTS (
          SELECT 1 FROM public."ChannelMember" cm
          WHERE cm."channelId" = c."id" AND cm."userId" = auth.uid()
        )
      )
  )
$$;

ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Workspace" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."WorkspaceMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Invitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Project" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ProjectMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Sprint" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Task" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ChecklistItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Comment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Attachment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ActivityLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Channel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ChannelMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Attachment"
  ADD CONSTRAINT "Attachment_one_target_check"
  CHECK (("taskId" IS NOT NULL) <> ("projectId" IS NOT NULL));

CREATE OR REPLACE FUNCTION public.workflow_protect_task_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  workspace_role text;
BEGIN
  IF NEW."projectId" IS DISTINCT FROM OLD."projectId"
    OR NEW."reporterId" IS DISTINCT FROM OLD."reporterId" THEN
    RAISE EXCEPTION 'Project and reporter cannot be changed on an existing task';
  END IF;

  SELECT public.workflow_workspace_role(p."workspaceId")
    INTO workspace_role
    FROM public."Project" p
    WHERE p."id" = OLD."projectId";

  IF workspace_role NOT IN ('OWNER', 'MANAGER')
    AND (
      NEW."assigneeId" IS DISTINCT FROM OLD."assigneeId"
      OR NEW."sprintId" IS DISTINCT FROM OLD."sprintId"
    ) THEN
    RAISE EXCEPTION 'Only workspace managers can change task assignment or sprint';
  END IF;

  IF NEW."sprintId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public."Sprint" s
    WHERE s."id" = NEW."sprintId" AND s."projectId" = NEW."projectId"
  ) THEN
    RAISE EXCEPTION 'A task sprint must belong to the same project';
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER "Task_protect_update"
BEFORE UPDATE ON public."Task"
FOR EACH ROW EXECUTE FUNCTION public.workflow_protect_task_update();

CREATE OR REPLACE FUNCTION public.workflow_protect_project_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW."workspaceId" IS DISTINCT FROM OLD."workspaceId" THEN
      RAISE EXCEPTION 'A project cannot be moved to a different workspace';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public."WorkspaceMember" wm
    WHERE wm."workspaceId" = NEW."workspaceId" AND wm."userId" = NEW."leadId"
  ) THEN
    RAISE EXCEPTION 'A project lead must be a workspace member';
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER "Project_protect_update"
BEFORE INSERT OR UPDATE ON public."Project"
FOR EACH ROW EXECUTE FUNCTION public.workflow_protect_project_update();

CREATE OR REPLACE FUNCTION public.workflow_protect_sprint_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW."projectId" IS DISTINCT FROM OLD."projectId" THEN
    RAISE EXCEPTION 'A sprint cannot be moved to a different project';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "Sprint_protect_update"
BEFORE UPDATE ON public."Sprint"
FOR EACH ROW EXECUTE FUNCTION public.workflow_protect_sprint_update();

CREATE OR REPLACE FUNCTION public.workflow_validate_channel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW."projectId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public."Project" p
    WHERE p."id" = NEW."projectId" AND p."workspaceId" = NEW."workspaceId"
  ) THEN
    RAISE EXCEPTION 'A channel project must belong to the same workspace';
  END IF;
  IF NEW."type" = 'PROJECT' AND NEW."projectId" IS NULL THEN
    RAISE EXCEPTION 'A project channel must belong to a project';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "Channel_validate_project"
BEFORE INSERT OR UPDATE ON public."Channel"
FOR EACH ROW EXECUTE FUNCTION public.workflow_validate_channel();

CREATE OR REPLACE FUNCTION public.workflow_protect_user_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."email" IS DISTINCT FROM OLD."email" THEN
    RAISE EXCEPTION 'A profile user ID and email cannot be changed directly';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "User_protect_identity"
BEFORE UPDATE ON public."User"
FOR EACH ROW EXECUTE FUNCTION public.workflow_protect_user_update();

CREATE OR REPLACE FUNCTION public.workflow_protect_comment_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW."taskId" IS DISTINCT FROM OLD."taskId"
    OR NEW."authorId" IS DISTINCT FROM OLD."authorId" THEN
    RAISE EXCEPTION 'A comment task and author cannot be changed';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "Comment_protect_update"
BEFORE UPDATE ON public."Comment"
FOR EACH ROW EXECUTE FUNCTION public.workflow_protect_comment_update();

CREATE OR REPLACE FUNCTION public.workflow_protect_channel_member_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW."channelId" IS DISTINCT FROM OLD."channelId"
    OR NEW."userId" IS DISTINCT FROM OLD."userId" THEN
    RAISE EXCEPTION 'A channel membership identity cannot be changed';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "ChannelMember_protect_update"
BEFORE UPDATE ON public."ChannelMember"
FOR EACH ROW EXECUTE FUNCTION public.workflow_protect_channel_member_update();

CREATE OR REPLACE FUNCTION public.workflow_protect_message_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW."channelId" IS DISTINCT FROM OLD."channelId"
    OR NEW."senderId" IS DISTINCT FROM OLD."senderId" THEN
    RAISE EXCEPTION 'A message channel and sender cannot be changed';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "Message_protect_update"
BEFORE UPDATE ON public."Message"
FOR EACH ROW EXECUTE FUNCTION public.workflow_protect_message_update();

CREATE OR REPLACE FUNCTION public.workflow_protect_last_workspace_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD."role" <> 'OWNER' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF NEW."role" <> 'OWNER' AND NOT EXISTS (
    SELECT 1 FROM public."WorkspaceMember" wm
    WHERE wm."workspaceId" = OLD."workspaceId"
      AND wm."userId" <> OLD."userId"
      AND wm."role" = 'OWNER'
  ) THEN
    RAISE EXCEPTION 'A workspace must have at least one owner';
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER "WorkspaceMember_protect_last_owner"
BEFORE UPDATE ON public."WorkspaceMember"
FOR EACH ROW EXECUTE FUNCTION public.workflow_protect_last_workspace_owner();

CREATE POLICY "Users can read profiles in shared projects"
ON public."User" FOR SELECT TO authenticated
USING (
  "id" = auth.uid()
  OR public.workflow_can_see_profile("id")
);
CREATE POLICY "Users can update their own profile"
ON public."User" FOR UPDATE TO authenticated
USING ("id" = auth.uid())
WITH CHECK ("id" = auth.uid());

CREATE POLICY "Workspace members can read their workspace"
ON public."Workspace" FOR SELECT TO authenticated
USING (public.workflow_workspace_role("id") IS NOT NULL);
CREATE POLICY "Workspace owners can create a workspace"
ON public."Workspace" FOR INSERT TO authenticated
WITH CHECK ("createdById" = auth.uid());
CREATE POLICY "Workspace owners can update their workspace"
ON public."Workspace" FOR UPDATE TO authenticated
USING (public.workflow_workspace_role("id") = 'OWNER')
WITH CHECK (public.workflow_workspace_role("id") = 'OWNER');
CREATE POLICY "Workspace owners can delete their workspace"
ON public."Workspace" FOR DELETE TO authenticated
USING (public.workflow_workspace_role("id") = 'OWNER');

CREATE POLICY "Members can read workspace membership"
ON public."WorkspaceMember" FOR SELECT TO authenticated
USING (public.workflow_workspace_role("workspaceId") IS NOT NULL);
CREATE POLICY "Owners can add the initial workspace owner"
ON public."WorkspaceMember" FOR INSERT TO authenticated
WITH CHECK (
  "userId" = auth.uid()
  AND "role" = 'OWNER'
  AND public.workflow_can_claim_workspace("workspaceId")
);
CREATE POLICY "Managers can add workspace members"
ON public."WorkspaceMember" FOR INSERT TO authenticated
WITH CHECK (
  "role" <> 'OWNER'
  AND public.workflow_workspace_role("workspaceId") IN ('OWNER', 'MANAGER')
);
CREATE POLICY "Managers can update workspace roles"
ON public."WorkspaceMember" FOR UPDATE TO authenticated
USING (
  public.workflow_workspace_role("workspaceId") = 'OWNER'
  OR (
    public.workflow_workspace_role("workspaceId") = 'MANAGER'
    AND "role" <> 'OWNER'
    AND "userId" <> auth.uid()
  )
)
WITH CHECK (
  public.workflow_workspace_role("workspaceId") = 'OWNER'
  OR (
    "role" <> 'OWNER'
    AND public.workflow_workspace_role("workspaceId") = 'MANAGER'
  )
);
CREATE POLICY "Managers can remove members and members can leave"
ON public."WorkspaceMember" FOR DELETE TO authenticated
USING (
  (
    public.workflow_workspace_role("workspaceId") = 'OWNER'
    AND "userId" <> auth.uid()
  )
  OR (
    public.workflow_workspace_role("workspaceId") = 'MANAGER'
    AND "role" <> 'OWNER'
  )
  OR ("userId" = auth.uid() AND "role" <> 'OWNER')
);

CREATE POLICY "Workspace managers can read invitations"
ON public."Invitation" FOR SELECT TO authenticated
USING (public.workflow_workspace_role("workspaceId") IN ('OWNER', 'MANAGER'));
CREATE POLICY "Workspace managers can create invitations"
ON public."Invitation" FOR INSERT TO authenticated
WITH CHECK (
  "role" <> 'OWNER'
  AND public.workflow_workspace_role("workspaceId") IN ('OWNER', 'MANAGER')
);
CREATE POLICY "Workspace managers can update invitations"
ON public."Invitation" FOR UPDATE TO authenticated
USING (public.workflow_workspace_role("workspaceId") IN ('OWNER', 'MANAGER'))
WITH CHECK (
  "role" <> 'OWNER'
  AND public.workflow_workspace_role("workspaceId") IN ('OWNER', 'MANAGER')
);
CREATE POLICY "Workspace managers can delete invitations"
ON public."Invitation" FOR DELETE TO authenticated
USING (public.workflow_workspace_role("workspaceId") IN ('OWNER', 'MANAGER'));

CREATE POLICY "Project members can read accessible projects"
ON public."Project" FOR SELECT TO authenticated
USING (public.workflow_can_access_project("id"));
CREATE POLICY "Workspace managers can create projects"
ON public."Project" FOR INSERT TO authenticated
WITH CHECK (public.workflow_workspace_role("workspaceId") IN ('OWNER', 'MANAGER'));
CREATE POLICY "Workspace managers can update projects"
ON public."Project" FOR UPDATE TO authenticated
USING (public.workflow_workspace_role("workspaceId") IN ('OWNER', 'MANAGER'))
WITH CHECK (public.workflow_workspace_role("workspaceId") IN ('OWNER', 'MANAGER'));
CREATE POLICY "Workspace managers can delete projects"
ON public."Project" FOR DELETE TO authenticated
USING (public.workflow_workspace_role("workspaceId") IN ('OWNER', 'MANAGER'));

CREATE POLICY "Project members can read project membership"
ON public."ProjectMember" FOR SELECT TO authenticated
USING (public.workflow_can_access_project("projectId"));
CREATE POLICY "Workspace managers can add project members"
ON public."ProjectMember" FOR INSERT TO authenticated
WITH CHECK (
  public.workflow_workspace_role(
    (SELECT p."workspaceId" FROM public."Project" p WHERE p."id" = "projectId")
  ) IN ('OWNER', 'MANAGER')
  AND EXISTS (
    SELECT 1
    FROM public."WorkspaceMember" wm
    JOIN public."Project" p ON p."workspaceId" = wm."workspaceId"
    WHERE p."id" = "projectId" AND wm."userId" = "userId"
  )
);
CREATE POLICY "Workspace managers can remove project members"
ON public."ProjectMember" FOR DELETE TO authenticated
USING (
  public.workflow_workspace_role(
    (SELECT p."workspaceId" FROM public."Project" p WHERE p."id" = "projectId")
  ) IN ('OWNER', 'MANAGER')
);

CREATE POLICY "Project members can read sprints"
ON public."Sprint" FOR SELECT TO authenticated
USING (public.workflow_can_access_project("projectId"));
CREATE POLICY "Workspace managers can create sprints"
ON public."Sprint" FOR INSERT TO authenticated
WITH CHECK (
  public.workflow_workspace_role(
    (SELECT p."workspaceId" FROM public."Project" p WHERE p."id" = "projectId")
  ) IN ('OWNER', 'MANAGER')
);
CREATE POLICY "Workspace managers can update sprints"
ON public."Sprint" FOR UPDATE TO authenticated
USING (
  public.workflow_workspace_role(
    (SELECT p."workspaceId" FROM public."Project" p WHERE p."id" = "projectId")
  ) IN ('OWNER', 'MANAGER')
)
WITH CHECK (
  public.workflow_workspace_role(
    (SELECT p."workspaceId" FROM public."Project" p WHERE p."id" = "projectId")
  ) IN ('OWNER', 'MANAGER')
);
CREATE POLICY "Workspace managers can delete sprints"
ON public."Sprint" FOR DELETE TO authenticated
USING (
  public.workflow_workspace_role(
    (SELECT p."workspaceId" FROM public."Project" p WHERE p."id" = "projectId")
  ) IN ('OWNER', 'MANAGER')
);

CREATE POLICY "Project members can read tasks"
ON public."Task" FOR SELECT TO authenticated
USING (public.workflow_can_access_project("projectId"));
CREATE POLICY "Project contributors can create tasks"
ON public."Task" FOR INSERT TO authenticated
WITH CHECK (
  "reporterId" = auth.uid()
  AND public.workflow_can_contribute_to_project("projectId")
  AND (
    "sprintId" IS NULL
    OR EXISTS (
      SELECT 1 FROM public."Sprint" s
      WHERE s."id" = "sprintId" AND s."projectId" = "projectId"
    )
  )
);
CREATE POLICY "Managers and assignees can update tasks"
ON public."Task" FOR UPDATE TO authenticated
USING (public.workflow_can_edit_task("id"))
WITH CHECK (public.workflow_can_access_project("projectId"));
CREATE POLICY "Workspace managers can delete tasks"
ON public."Task" FOR DELETE TO authenticated
USING (
  public.workflow_workspace_role(
    (SELECT p."workspaceId" FROM public."Project" p WHERE p."id" = "projectId")
  ) IN ('OWNER', 'MANAGER')
);

CREATE POLICY "Project members can read task checklists"
ON public."ChecklistItem" FOR SELECT TO authenticated
USING (
  public.workflow_can_access_project(
    (SELECT t."projectId" FROM public."Task" t WHERE t."id" = "taskId")
  )
);
CREATE POLICY "Task editors can manage checklists"
ON public."ChecklistItem" FOR ALL TO authenticated
USING (public.workflow_can_edit_task("taskId"))
WITH CHECK (public.workflow_can_edit_task("taskId"));

CREATE POLICY "Project members can read comments"
ON public."Comment" FOR SELECT TO authenticated
USING (
  public.workflow_can_access_project(
    (SELECT t."projectId" FROM public."Task" t WHERE t."id" = "taskId")
  )
);
CREATE POLICY "Project contributors can comment"
ON public."Comment" FOR INSERT TO authenticated
WITH CHECK (
  "authorId" = auth.uid()
  AND public.workflow_can_contribute_to_project(
    (SELECT t."projectId" FROM public."Task" t WHERE t."id" = "taskId")
  )
);
CREATE POLICY "Authors can update comments"
ON public."Comment" FOR UPDATE TO authenticated
USING ("authorId" = auth.uid())
WITH CHECK ("authorId" = auth.uid());
CREATE POLICY "Authors and workspace managers can delete comments"
ON public."Comment" FOR DELETE TO authenticated
USING (
  "authorId" = auth.uid()
  OR public.workflow_workspace_role(
    (SELECT p."workspaceId"
     FROM public."Project" p
     JOIN public."Task" t ON t."projectId" = p."id"
     WHERE t."id" = "taskId")
  ) IN ('OWNER', 'MANAGER')
);

CREATE POLICY "Project members can read attachments"
ON public."Attachment" FOR SELECT TO authenticated
USING (
  ("projectId" IS NOT NULL AND public.workflow_can_access_project("projectId"))
  OR (
    "taskId" IS NOT NULL
    AND public.workflow_can_access_project(
      (SELECT t."projectId" FROM public."Task" t WHERE t."id" = "taskId")
    )
  )
);
CREATE POLICY "Project contributors can upload attachments"
ON public."Attachment" FOR INSERT TO authenticated
WITH CHECK (
  "uploadedById" = auth.uid()
  AND (
    "projectId" IS NULL
    OR "taskId" IS NULL
    OR EXISTS (
      SELECT 1 FROM public."Task" t
      WHERE t."id" = "taskId" AND t."projectId" = "projectId"
    )
  )
  AND (
    ("projectId" IS NOT NULL AND public.workflow_can_contribute_to_project("projectId"))
    OR (
      "taskId" IS NOT NULL
      AND public.workflow_can_contribute_to_project(
        (SELECT t."projectId" FROM public."Task" t WHERE t."id" = "taskId")
      )
    )
  )
);
CREATE POLICY "Uploaders and workspace managers can delete attachments"
ON public."Attachment" FOR DELETE TO authenticated
USING (
  "uploadedById" = auth.uid()
  OR public.workflow_workspace_role(
    COALESCE(
      (SELECT p."workspaceId" FROM public."Project" p WHERE p."id" = "projectId"),
      (SELECT p."workspaceId"
       FROM public."Project" p
       JOIN public."Task" t ON t."projectId" = p."id"
       WHERE t."id" = "taskId")
    )
  ) IN ('OWNER', 'MANAGER')
);

CREATE POLICY "Workspace members can read activity"
ON public."ActivityLog" FOR SELECT TO authenticated
USING (
  public.workflow_workspace_role("workspaceId") IS NOT NULL
  AND (
    "projectId" IS NULL
    OR public.workflow_can_access_project("projectId")
  )
);
CREATE POLICY "Channel members can read channels"
ON public."Channel" FOR SELECT TO authenticated
USING (public.workflow_can_access_channel("id"));
CREATE POLICY "Workspace managers can create channels"
ON public."Channel" FOR INSERT TO authenticated
WITH CHECK (
  public.workflow_workspace_role("workspaceId") IN ('OWNER', 'MANAGER')
  AND ("type" <> 'PROJECT' OR "projectId" IS NOT NULL)
  AND (
    "projectId" IS NULL
    OR EXISTS (
      SELECT 1 FROM public."Project" p
      WHERE p."id" = "projectId" AND p."workspaceId" = "workspaceId"
    )
  )
);
CREATE POLICY "Workspace managers can update channels"
ON public."Channel" FOR UPDATE TO authenticated
USING (public.workflow_workspace_role("workspaceId") IN ('OWNER', 'MANAGER'))
WITH CHECK (
  public.workflow_workspace_role("workspaceId") IN ('OWNER', 'MANAGER')
  AND ("type" <> 'PROJECT' OR "projectId" IS NOT NULL)
  AND (
    "projectId" IS NULL
    OR EXISTS (
      SELECT 1 FROM public."Project" p
      WHERE p."id" = "projectId" AND p."workspaceId" = "workspaceId"
    )
  )
);
CREATE POLICY "Workspace managers can delete channels"
ON public."Channel" FOR DELETE TO authenticated
USING (public.workflow_workspace_role("workspaceId") IN ('OWNER', 'MANAGER'));

CREATE POLICY "Channel members can read channel membership"
ON public."ChannelMember" FOR SELECT TO authenticated
USING (
  "userId" = auth.uid()
  OR public.workflow_can_access_channel("channelId")
);
CREATE POLICY "Workspace members can join channels"
ON public."ChannelMember" FOR INSERT TO authenticated
WITH CHECK (
  "userId" = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public."Channel" c
    WHERE c."id" = "channelId"
      AND (
        public.workflow_workspace_role(c."workspaceId") IN ('OWNER', 'MANAGER')
        OR (
          c."projectId" IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public."ProjectMember" pm
            WHERE pm."projectId" = c."projectId" AND pm."userId" = auth.uid()
          )
        )
      )
  )
);
CREATE POLICY "Channel members can update their read position"
ON public."ChannelMember" FOR UPDATE TO authenticated
USING ("userId" = auth.uid())
WITH CHECK ("userId" = auth.uid());
CREATE POLICY "Managers can remove channel members"
ON public."ChannelMember" FOR DELETE TO authenticated
USING (
  public.workflow_workspace_role(
    (SELECT c."workspaceId" FROM public."Channel" c WHERE c."id" = "channelId")
  ) IN ('OWNER', 'MANAGER')
);

CREATE POLICY "Channel members can read messages"
ON public."Message" FOR SELECT TO authenticated
USING (public.workflow_can_access_channel("channelId"));
CREATE POLICY "Channel members can send messages as themselves"
ON public."Message" FOR INSERT TO authenticated
WITH CHECK ("senderId" = auth.uid() AND public.workflow_can_access_channel("channelId"));
CREATE POLICY "Senders can update their messages"
ON public."Message" FOR UPDATE TO authenticated
USING ("senderId" = auth.uid() AND public.workflow_can_access_channel("channelId"))
WITH CHECK ("senderId" = auth.uid() AND public.workflow_can_access_channel("channelId"));
CREATE POLICY "Senders can delete their messages"
ON public."Message" FOR DELETE TO authenticated
USING ("senderId" = auth.uid() AND public.workflow_can_access_channel("channelId"));

CREATE POLICY "Users can read their notifications"
ON public."Notification" FOR SELECT TO authenticated
USING ("userId" = auth.uid());
CREATE POLICY "Users can mark their notifications read"
ON public."Notification" FOR UPDATE TO authenticated
USING ("userId" = auth.uid())
WITH CHECK ("userId" = auth.uid());
CREATE POLICY "Users can receive their own notifications"
ON public."Notification" FOR INSERT TO authenticated
WITH CHECK ("userId" = auth.uid());
