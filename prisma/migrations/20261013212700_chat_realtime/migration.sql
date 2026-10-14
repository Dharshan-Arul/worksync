ALTER TYPE public."NotificationType" ADD VALUE 'CHAT_MESSAGE';

ALTER TABLE public."Channel"
ADD COLUMN "taskId" UUID,
ADD COLUMN "directKey" TEXT,
ADD CONSTRAINT "Channel_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES public."Task"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "Channel_task_type_check"
  CHECK (("type" = 'TASK') = ("taskId" IS NOT NULL)),
ADD CONSTRAINT "Channel_task_project_check"
  CHECK ("type" <> 'TASK' OR "projectId" IS NOT NULL);

CREATE UNIQUE INDEX "Channel_directKey_key" ON public."Channel"("directKey");
CREATE UNIQUE INDEX "Channel_taskId_key" ON public."Channel"("taskId");

ALTER TABLE public."Message" REPLICA IDENTITY FULL;
ALTER TABLE public."Notification" REPLICA IDENTITY FULL;

DROP POLICY "Channel members can send messages as themselves" ON public."Message";
CREATE POLICY "Non-viewers can send messages as themselves"
ON public."Message" FOR INSERT TO authenticated
WITH CHECK (
  "senderId" = auth.uid()
  AND public.workflow_can_access_channel("channelId")
  AND public.workflow_workspace_role(
    (SELECT c."workspaceId" FROM public."Channel" c WHERE c."id" = "channelId")
  ) <> 'VIEWER'
);
DROP POLICY "Senders can update their messages" ON public."Message";
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
DROP POLICY "Senders can delete their messages" ON public."Message";
CREATE POLICY "Non-viewers can delete their messages"
ON public."Message" FOR DELETE TO authenticated
USING (
  "senderId" = auth.uid()
  AND public.workflow_can_access_channel("channelId")
  AND public.workflow_workspace_role(
    (SELECT c."workspaceId" FROM public."Channel" c WHERE c."id" = "channelId")
  ) <> 'VIEWER'
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE EXCEPTION 'Supabase Realtime publication is not configured';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'Message'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public."Message";
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'Notification'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public."Notification";
  END IF;
END
$$;
