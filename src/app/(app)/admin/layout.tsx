import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";

// Administration is for platform admins (ERP team). Non-admins are bounced.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!user.isAdmin) redirect("/dashboard");
  return <>{children}</>;
}
