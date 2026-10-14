CREATE TABLE public."SprintCapacity" (
    "sprintId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "capacityPoints" INTEGER NOT NULL,
    CONSTRAINT "SprintCapacity_pkey" PRIMARY KEY ("sprintId", "userId"),
    CONSTRAINT "SprintCapacity_sprintId_fkey"
      FOREIGN KEY ("sprintId") REFERENCES public."Sprint"("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SprintCapacity_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES public."User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SprintCapacity_capacityPoints_check" CHECK ("capacityPoints" >= 0)
);

CREATE INDEX "SprintCapacity_userId_idx" ON public."SprintCapacity"("userId");

ALTER TABLE public."SprintCapacity" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members can read sprint capacities"
ON public."SprintCapacity" FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public."Sprint" s
    WHERE s."id" = "sprintId"
      AND public.workflow_can_access_project(s."projectId")
  )
);

CREATE POLICY "Workspace managers can manage sprint capacities"
ON public."SprintCapacity" FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public."Sprint" s
    JOIN public."Project" p ON p."id" = s."projectId"
    WHERE s."id" = "sprintId"
      AND public.workflow_workspace_role(p."workspaceId") IN ('OWNER', 'MANAGER')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public."Sprint" s
    JOIN public."Project" p ON p."id" = s."projectId"
    JOIN public."ProjectMember" pm ON pm."projectId" = p."id" AND pm."userId" = "userId"
    WHERE s."id" = "sprintId"
      AND public.workflow_workspace_role(p."workspaceId") IN ('OWNER', 'MANAGER')
  )
);
