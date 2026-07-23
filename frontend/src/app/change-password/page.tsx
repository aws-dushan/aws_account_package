import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import ChangePasswordForm from "./ChangePasswordForm";

export default async function ChangePasswordPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return <ChangePasswordForm />;
}
