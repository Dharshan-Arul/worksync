ALTER TABLE public."Project"
ADD COLUMN "taskCounter" INTEGER NOT NULL DEFAULT 0;

UPDATE public."Project" p
SET "taskCounter" = COALESCE(
  (SELECT MAX(t."number") FROM public."Task" t WHERE t."projectId" = p."id"),
  0
);

CREATE OR REPLACE FUNCTION public.workflow_assign_task_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public."Project"
    SET "taskCounter" = "taskCounter" + 1
    WHERE "id" = NEW."projectId"
    RETURNING "taskCounter" INTO NEW."number";

    IF NEW."number" IS NULL THEN
      RAISE EXCEPTION 'The task project does not exist';
    END IF;
  ELSIF NEW."projectId" IS DISTINCT FROM OLD."projectId"
    OR NEW."number" IS DISTINCT FROM OLD."number" THEN
    RAISE EXCEPTION 'Task project and number cannot be changed';
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER "Task_assign_number"
BEFORE INSERT OR UPDATE ON public."Task"
FOR EACH ROW EXECUTE FUNCTION public.workflow_assign_task_number();

CREATE OR REPLACE FUNCTION public.workflow_protect_task_counter()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW."taskCounter" IS DISTINCT FROM OLD."taskCounter"
    AND pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION 'Task numbers are managed automatically';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "Project_protect_task_counter"
BEFORE UPDATE ON public."Project"
FOR EACH ROW EXECUTE FUNCTION public.workflow_protect_task_counter();

CREATE OR REPLACE FUNCTION public.workflow_validate_task_assignee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW."assigneeId" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public."ProjectMember" pm
    WHERE pm."projectId" = NEW."projectId"
      AND pm."userId" = NEW."assigneeId"
  ) THEN
    RAISE EXCEPTION 'A task can only be assigned to a project member';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "Task_validate_assignee"
BEFORE INSERT OR UPDATE ON public."Task"
FOR EACH ROW EXECUTE FUNCTION public.workflow_validate_task_assignee();
