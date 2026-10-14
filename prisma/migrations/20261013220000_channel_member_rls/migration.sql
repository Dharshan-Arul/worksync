ALTER TABLE public."Channel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Notification" ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.workflow_can_access_channel(_channel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public."ChannelMember" cm
    WHERE cm."channelId" = _channel_id
      AND cm."userId" = auth.uid()
  )
$$;

DROP POLICY IF EXISTS "Workspace members can join channels" ON public."ChannelMember";
DROP POLICY IF EXISTS "Project members can join project channels" ON public."ChannelMember";
CREATE POLICY "Project members can join project channels"
ON public."ChannelMember" FOR INSERT TO authenticated
WITH CHECK (
  "userId" = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public."Channel" c
    JOIN public."ProjectMember" pm ON pm."projectId" = c."projectId"
    WHERE c."id" = "channelId"
      AND c."projectId" IS NOT NULL
      AND pm."userId" = auth.uid()
  )
);

DROP POLICY IF EXISTS "Channel members can update their read position" ON public."ChannelMember";
CREATE POLICY "Channel members can update their read position"
ON public."ChannelMember" FOR UPDATE TO authenticated
USING ("userId" = auth.uid())
WITH CHECK (
  "userId" = auth.uid()
  AND public.workflow_can_access_channel("channelId")
);

DROP POLICY IF EXISTS "Channel members can send messages as themselves" ON public."Message";
CREATE POLICY "Channel members can send messages as themselves"
ON public."Message" FOR INSERT TO authenticated
WITH CHECK (
  "senderId" = auth.uid()
  AND public.workflow_can_access_channel("channelId")
  AND public.workflow_workspace_role(
    (SELECT c."workspaceId" FROM public."Channel" c WHERE c."id" = "channelId")
  ) <> 'VIEWER'
);

DROP POLICY IF EXISTS "Senders can update their messages" ON public."Message";
CREATE POLICY "Senders can update their messages"
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

DROP POLICY IF EXISTS "Senders can delete their messages" ON public."Message";
CREATE POLICY "Senders can delete their messages"
ON public."Message" FOR DELETE TO authenticated
USING (
  "senderId" = auth.uid()
  AND public.workflow_can_access_channel("channelId")
  AND public.workflow_workspace_role(
    (SELECT c."workspaceId" FROM public."Channel" c WHERE c."id" = "channelId")
  ) <> 'VIEWER'
);
