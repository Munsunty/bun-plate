import type { ComponentType } from "react";
import * as todosService from "../services/todos.service";
import Home from "../pages/home";
import TodosPage from "../pages/todos-page";
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
  /** Runs server-side before render; its result is drawn AND cached by screen key. */
  loadData: (params: Record<string, string>) => Promise<unknown>;
}

// Depth-0 data == the `GET /api/todos` response (`Todo[]`), so the SSR-drawn
// value, the cached value, and the client's re-fetch all line up exactly.
const loadTodos = async () => todosService.list();

export const serverPages: Record<string, ServerPage> = {
  home: { Component: Home, loadData: loadTodos },
  todos: { Component: TodosPage, loadData: loadTodos },
  about: { Component: About, loadData: async () => null },
};
