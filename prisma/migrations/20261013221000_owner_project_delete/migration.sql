DROP POLICY IF EXISTS "Workspace managers can delete projects" ON public."Project";
DROP POLICY IF EXISTS "Workspace owners can delete projects" ON public."Project";
CREATE POLICY "Workspace owners can delete projects"
ON public."Project" FOR DELETE TO authenticated
USING (public.workflow_workspace_role("workspaceId") = 'OWNER');
