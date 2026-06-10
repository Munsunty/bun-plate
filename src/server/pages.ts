import type { ComponentType } from "react";
import * as todosService from "../services/todos.service";
import * as dashboardService from "../services/dashboard.service";
import Home from "../pages/home";
import TodosPage from "../pages/todos-page";
import Dashboard from "../pages/dashboard";
import Admin from "../pages/admin";
import About from "../pages/about";

/**
 * Server-only page registry. Maps a route name to its page component and its
 * depth-0 `loadData` (which calls the Service tier directly — never over HTTP,
 * to avoid a self-request loop). This module imports Services and ALL page
 * components, including static ones (About); that's fine because it is only ever
 * imported by the SSR pipeline, never by a client bundle.
 */

export interface ServerPage {
  Component: ComponentType<{ data: any }>;
  /** Runs server-side before render; the result flows into island props (design §3). */
  loadData: (params: Record<string, string>) => Promise<unknown>;
}

// Depth-0 data == the `GET /api/todos` response (`Todo[]`), so the SSR-drawn
// value and what widgets fetch after mutations line up exactly.
const loadTodos = async () => todosService.list();

export const serverPages: Record<string, ServerPage> = {
  home: { Component: Home, loadData: loadTodos },
  todos: { Component: TodosPage, loadData: loadTodos },
  dashboard: {
    Component: Dashboard,
    loadData: async () => ({
      metrics: dashboardService.metrics(),
      revenue: dashboardService.revenueSeries(),
      activity: dashboardService.activity(),
    }),
  },
  admin: {
    Component: Admin,
    loadData: async () => ({ users: dashboardService.users() }),
  },
  about: { Component: About, loadData: async () => null },
};
