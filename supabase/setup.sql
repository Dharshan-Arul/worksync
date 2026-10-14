-- Run after applying prisma/migrations to the Supabase project.

ALTER TABLE public."Channel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Message" REPLICA IDENTITY FULL;
ALTER TABLE public."Notification" REPLICA IDENTITY FULL;

CREATE OR REPLACE FUNCTION public.workflow_can_access_channel(_channel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public."Channel" c
    WHERE c."id" = _channel_id
      AND (
        (
          c."type" = 'PROJECT'
          AND public.workflow_workspace_role(c."workspaceId") IN ('OWNER', 'MANAGER')
        )
        OR EXISTS (
          SELECT 1
          FROM public."ChannelMember" cm
          WHERE cm."channelId" = c."id"
            AND cm."userId" = auth.uid()
        )
      )
  )
$$;

DROP POLICY IF EXISTS "Channel members can read channels" ON public."Channel";
CREATE POLICY "Channel members can read channels"
ON public."Channel" FOR SELECT TO authenticated
USING (public.workflow_can_access_channel("id"));

DROP POLICY IF EXISTS "Workspace managers can create channels" ON public."Channel";
CREATE POLICY "Workspace managers can create channels"
ON public."Channel" FOR INSERT TO authenticated
WITH CHECK (
  public.workflow_workspace_role("workspaceId") IN ('OWNER', 'MANAGER')
  AND ("type" <> 'PROJECT' OR "projectId" IS NOT NULL)
  AND (
    "projectId" IS NULL
    OR EXISTS (
      SELECT 1
      FROM public."Project" p
      WHERE p."id" = "projectId"
        AND p."workspaceId" = "workspaceId"
    )
  )
);

DROP POLICY IF EXISTS "Workspace managers can update channels" ON public."Channel";
CREATE POLICY "Workspace managers can update channels"
ON public."Channel" FOR UPDATE TO authenticated
USING (public.workflow_workspace_role("workspaceId") IN ('OWNER', 'MANAGER'))
WITH CHECK (
  public.workflow_workspace_role("workspaceId") IN ('OWNER', 'MANAGER')
  AND ("type" <> 'PROJECT' OR "projectId" IS NOT NULL)
  AND (
    "projectId" IS NULL
    OR EXISTS (
      SELECT 1
      FROM public."Project" p
      WHERE p."id" = "projectId"
        AND p."workspaceId" = "workspaceId"
    )
  )
);

DROP POLICY IF EXISTS "Workspace managers can delete channels" ON public."Channel";
CREATE POLICY "Workspace managers can delete channels"
ON public."Channel" FOR DELETE TO authenticated
USING (public.workflow_workspace_role("workspaceId") IN ('OWNER', 'MANAGER'));

DROP POLICY IF EXISTS "Channel members can read messages" ON public."Message";
DROP POLICY IF EXISTS "Channel members can send messages as themselves" ON public."Message";
DROP POLICY IF EXISTS "Non-viewers can send messages as themselves" ON public."Message";
DROP POLICY IF EXISTS "Senders can update their messages" ON public."Message";
DROP POLICY IF EXISTS "Non-viewers can update their messages" ON public."Message";
DROP POLICY IF EXISTS "Senders can delete their messages" ON public."Message";
DROP POLICY IF EXISTS "Non-viewers can delete their messages" ON public."Message";

CREATE POLICY "Channel members can read messages"
ON public."Message" FOR SELECT TO authenticated
USING (public.workflow_can_access_channel("channelId"));

CREATE POLICY "Non-viewers can send messages as themselves"
ON public."Message" FOR INSERT TO authenticated
WITH CHECK (
  "senderId" = auth.uid()
  AND public.workflow_can_access_channel("channelId")
  AND public.workflow_workspace_role(
    (SELECT c."workspaceId" FROM public."Channel" c WHERE c."id" = "channelId")
  ) <> 'VIEWER'
);

CREATE POLICY "Non-viewers can update their messages"
ON public."Message" FOR UPDATE TO authenticated
USING (
  "senderId" = auth.uid()
  AND public.workflow_can_access_channel("channelId")
  AND public.workflow_workspace_role(
    (SELECT c."workspaceId" FROM public."Channel" c WHERE c."id" = "channelId")
  ) <> 'VIEWER'
)
WITH CHECK (
  "senderId" = auth.uid()
  AND public.workflow_can_access_channel("channelId")
  AND public.workflow_workspace_role(
    (SELECT c."workspaceId" FROM public."Channel" c WHERE c."id" = "channelId")
  ) <> 'VIEWER'
);

CREATE POLICY "Non-viewers can delete their messages"
ON public."Message" FOR DELETE TO authenticated
USING (
  "senderId" = auth.uid()
  AND public.workflow_can_access_channel("channelId")
  AND public.workflow_workspace_role(
    (SELECT c."workspaceId" FROM public."Channel" c WHERE c."id" = "channelId")
  ) <> 'VIEWER'
);

DROP POLICY IF EXISTS "Users can read their notifications" ON public."Notification";
DROP POLICY IF EXISTS "Users can mark their notifications read" ON public."Notification";
DROP POLICY IF EXISTS "Users can receive their own notifications" ON public."Notification";

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

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'workflow-attachments',
  'workflow-attachments',
  false,
  10485760,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'text/plain',
    'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'Message'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public."Message";
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'Notification'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public."Notification";
  END IF;
END
$$;
