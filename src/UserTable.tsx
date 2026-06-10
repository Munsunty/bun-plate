import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AdminUser } from "./services/dashboard.service";

/**
 * Interactive island: admin user table with client-side search, role filter,
 * and a suspend/activate toggle. All state is local demo state — wire the
 * toggle to a real API (via the Eden client) when an admin backend exists.
 */
export function UserTable({ initial }: { initial: AdminUser[] }) {
  const [users, setUsers] = useState(initial);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<string>("all");

  const shown = users.filter(
    (u) =>
      (role === "all" || u.role === role) &&
      (u.name.toLowerCase().includes(query.toLowerCase()) ||
        u.email.toLowerCase().includes(query.toLowerCase())),
  );

  const toggle = (id: number) =>
    setUsers((prev) =>
      prev.map((u) =>
        u.id === id ? { ...u, status: u.status === "active" ? "suspended" : "active" } : u,
      ),
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name or email..."
          className="max-w-xs"
        />
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent align="start">
            <SelectItem value="all">All roles</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="editor">Editor</SelectItem>
            <SelectItem value="viewer">Viewer</SelectItem>
          </SelectContent>
        </Select>
        <span className="ml-auto text-sm text-muted-foreground">
          {shown.length} / {users.length}
        </span>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th className="p-3 font-medium">Name</th>
              <th className="p-3 font-medium">Email</th>
              <th className="p-3 font-medium">Role</th>
              <th className="p-3 font-medium">Status</th>
              <th className="p-3 font-medium">Joined</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {shown.map((u) => (
              <tr key={u.id} className="border-b last:border-0">
                <td className="p-3">{u.name}</td>
                <td className="p-3 text-muted-foreground">{u.email}</td>
                <td className="p-3 capitalize">{u.role}</td>
                <td className="p-3">
                  <span
                    className={
                      u.status === "active"
                        ? "rounded-full bg-green-500/15 px-2 py-0.5 text-xs text-green-700"
                        : "rounded-full bg-red-500/15 px-2 py-0.5 text-xs text-red-700"
                    }
                  >
                    {u.status}
                  </span>
                </td>
                <td className="p-3 text-muted-foreground">{u.joined}</td>
                <td className="p-3 text-right">
                  <Button variant="ghost" size="sm" onClick={() => toggle(u.id)}>
                    {u.status === "active" ? "Suspend" : "Activate"}
                  </Button>
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">
                  No users match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
