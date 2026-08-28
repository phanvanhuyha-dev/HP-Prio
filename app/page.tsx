import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import Dashboard from "@/components/Dashboard";

export default async function Home() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  return <Dashboard userName={session.user.name || session.user.email || ""} />;
}
