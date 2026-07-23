import { redirect } from "next/navigation";

export default function Home() {
  // Middleware sends unauthenticated visitors to /login; signed-in users land here.
  redirect("/dashboard");
}
