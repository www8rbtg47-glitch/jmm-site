import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import OrdersDashboard from "@/components/OrdersDashboard";

export default async function AdminOrdersPage() {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }

  return <OrdersDashboard adminUsername={session.username} />;
}
