/**
 * Demo data for the dashboard template screens. Server-only, deterministic —
 * boilerplate placeholder until real domain services exist. Values are fixed
 * (no Math.random) so SSR output and island props stay reproducible.
 */

export interface Metric {
  label: string;
  value: string;
  /** Percent change vs previous period; sign drives the badge color. */
  delta: number;
}

export interface RevenuePoint {
  month: string;
  value: number;
}

export interface ActivityItem {
  id: number;
  who: string;
  what: string;
  when: string;
}

export interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: "admin" | "editor" | "viewer";
  status: "active" | "suspended";
  joined: string;
}

export function metrics(): Metric[] {
  return [
    { label: "Revenue", value: "$48,210", delta: 12.4 },
    { label: "Active users", value: "2,381", delta: 4.1 },
    { label: "Orders", value: "1,204", delta: -2.3 },
    { label: "Conversion", value: "3.9%", delta: 0.8 },
  ];
}

export function revenueSeries(): RevenuePoint[] {
  return [
    { month: "Jan", value: 28 },
    { month: "Feb", value: 32 },
    { month: "Mar", value: 30 },
    { month: "Apr", value: 38 },
    { month: "May", value: 35 },
    { month: "Jun", value: 42 },
    { month: "Jul", value: 47 },
    { month: "Aug", value: 44 },
    { month: "Sep", value: 51 },
    { month: "Oct", value: 49 },
    { month: "Nov", value: 56 },
    { month: "Dec", value: 61 },
  ];
}

export function activity(): ActivityItem[] {
  return [
    { id: 1, who: "Mina", what: "created order #1204", when: "2 min ago" },
    { id: 2, who: "Jude", what: "updated product 'Bun Mug'", when: "14 min ago" },
    { id: 3, who: "Sora", what: "refunded order #1198", when: "1 h ago" },
    { id: 4, who: "Kai", what: "invited teammate leo@acme.io", when: "3 h ago" },
    { id: 5, who: "Mina", what: "changed plan to Pro", when: "yesterday" },
  ];
}

export function users(): AdminUser[] {
  return [
    { id: 1, name: "Mina Park", email: "mina@acme.io", role: "admin", status: "active", joined: "2025-11-02" },
    { id: 2, name: "Jude Lee", email: "jude@acme.io", role: "editor", status: "active", joined: "2025-12-18" },
    { id: 3, name: "Sora Kim", email: "sora@acme.io", role: "editor", status: "suspended", joined: "2026-01-09" },
    { id: 4, name: "Kai Chen", email: "kai@acme.io", role: "viewer", status: "active", joined: "2026-02-21" },
    { id: 5, name: "Leo Han", email: "leo@acme.io", role: "viewer", status: "active", joined: "2026-03-05" },
    { id: 6, name: "Noa Jung", email: "noa@acme.io", role: "admin", status: "active", joined: "2026-04-12" },
  ];
}
