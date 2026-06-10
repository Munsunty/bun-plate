import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Island } from "../server/island";
import { UserTable } from "../UserTable";
import type { AdminUser } from "../services/dashboard.service";

/**
 * Admin dashboard — boilerplate template screen. Reached via a "heavy"
 * transition (admin is a separate context, design §5). The user table is the
 * single island; the rest is static SSR HTML.
 */

export interface AdminData {
  users: AdminUser[];
}

export default function Admin({ data }: { data: AdminData }) {
  const total = data.users.length;
  const active = data.users.filter((u) => u.status === "active").length;
  const admins = data.users.filter((u) => u.role === "admin").length;

  return (
    <div className="container mx-auto p-8 flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Admin</h1>
        <p className="text-sm text-muted-foreground">User &amp; access management</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Total users", value: total },
          { label: "Active", value: active },
          { label: "Admins", value: admins },
        ].map((m) => (
          <Card key={m.label}>
            <CardHeader className="gap-1">
              <CardDescription>{m.label}</CardDescription>
              <CardTitle className="text-2xl">{m.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
          <CardDescription>Search, filter, and manage access</CardDescription>
        </CardHeader>
        <CardContent>
          <Island name="user-table" props={{ initial: data.users }} of={UserTable} />
        </CardContent>
      </Card>
    </div>
  );
}
