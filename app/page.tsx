import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/server/auth/user";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  redirect("/dashboard");
}
