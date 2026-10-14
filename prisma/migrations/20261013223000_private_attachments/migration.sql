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

DROP POLICY IF EXISTS "Workflow project members can read attachments" ON storage.objects;
CREATE POLICY "Workflow project members can read attachments"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'workflow-attachments'
  AND EXISTS (
    SELECT 1
    FROM public."Project" p
    WHERE p."id"::text = split_part(name, '/', 2)
      AND p."workspaceId"::text = split_part(name, '/', 1)
      AND public.workflow_can_access_project(p."id")
  )
);

DROP POLICY IF EXISTS "Workflow project contributors can upload attachments" ON storage.objects;
CREATE POLICY "Workflow project contributors can upload attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'workflow-attachments'
  AND split_part(name, '/', 4) = auth.uid()::text
  AND EXISTS (
    SELECT 1
    FROM public."Project" p
    WHERE p."id"::text = split_part(name, '/', 2)
      AND p."workspaceId"::text = split_part(name, '/', 1)
      AND public.workflow_can_contribute_to_project(p."id")
      AND (
        split_part(name, '/', 3) = '_project'
        OR EXISTS (
          SELECT 1
          FROM public."Task" t
          WHERE t."id"::text = split_part(name, '/', 3)
            AND t."projectId" = p."id"
        )
      )
  )
);

DROP POLICY IF EXISTS "Workflow uploaders and managers can delete attachments" ON storage.objects;
CREATE POLICY "Workflow uploaders and managers can delete attachments"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'workflow-attachments'
  AND EXISTS (
    SELECT 1
    FROM public."Project" p
    WHERE p."id"::text = split_part(name, '/', 2)
      AND p."workspaceId"::text = split_part(name, '/', 1)
      AND public.workflow_can_access_project(p."id")
      AND (
        split_part(name, '/', 4) = auth.uid()::text
        OR public.workflow_workspace_role(p."workspaceId") IN ('OWNER', 'MANAGER')
      )
  )
);

DROP POLICY IF EXISTS "Uploaders and workspace managers can delete attachments" ON public."Attachment";
DROP POLICY IF EXISTS "Project members can delete their attachments or managers can delete any" ON public."Attachment";
CREATE POLICY "Project members can delete their attachments or managers can delete any"
ON public."Attachment" FOR DELETE TO authenticated
USING (
  (
    "projectId" IS NOT NULL
    AND public.workflow_can_access_project("projectId")
    AND (
      "uploadedById" = auth.uid()
      OR public.workflow_workspace_role(
        (SELECT p."workspaceId" FROM public."Project" p WHERE p."id" = "projectId")
      ) IN ('OWNER', 'MANAGER')
    )
  )
  OR (
    "taskId" IS NOT NULL
    AND public.workflow_can_access_project(
      (SELECT t."projectId" FROM public."Task" t WHERE t."id" = "taskId")
    )
    AND (
      "uploadedById" = auth.uid()
      OR public.workflow_workspace_role(
        (SELECT p."workspaceId"
         FROM public."Project" p
         JOIN public."Task" t ON t."projectId" = p."id"
         WHERE t."id" = "taskId")
      ) IN ('OWNER', 'MANAGER')
    )
  )
);
