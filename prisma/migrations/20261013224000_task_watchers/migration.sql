ALTER TYPE public."NotificationType" ADD VALUE IF NOT EXISTS 'WATCHED_TASK_UPDATED';
ALTER TYPE public."NotificationType" ADD VALUE IF NOT EXISTS 'TASK_COMMENT';

CREATE TABLE IF NOT EXISTS public."TaskWatcher" (
  "taskId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskWatcher_pkey" PRIMARY KEY ("taskId", "userId"),
  CONSTRAINT "TaskWatcher_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES public."Task"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TaskWatcher_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES public."User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "TaskWatcher_userId_idx" ON public."TaskWatcher"("userId");
ALTER TABLE public."TaskWatcher" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Project members can read task watchers" ON public."TaskWatcher";
CREATE POLICY "Project members can read task watchers"
ON public."TaskWatcher" FOR SELECT TO authenticated
USING (
  public.workflow_can_access_project(
    (SELECT t."projectId" FROM public."Task" t WHERE t."id" = "taskId")
  )
);

DROP POLICY IF EXISTS "Project members can watch accessible tasks" ON public."TaskWatcher";
CREATE POLICY "Project members can watch accessible tasks"
ON public."TaskWatcher" FOR INSERT TO authenticated
WITH CHECK (
  "userId" = auth.uid()
  AND public.workflow_can_access_project(
    (SELECT t."projectId" FROM public."Task" t WHERE t."id" = "taskId")
  )
);

DROP POLICY IF EXISTS "Users can stop watching their tasks" ON public."TaskWatcher";
CREATE POLICY "Users can stop watching their tasks"
ON public."TaskWatcher" FOR DELETE TO authenticated
USING (
  "userId" = auth.uid()
  AND public.workflow_can_access_project(
    (SELECT t."projectId" FROM public."Task" t WHERE t."id" = "taskId")
  )
);
