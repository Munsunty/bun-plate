import { Island } from "../server/island";
import { ChatApp } from "../ChatApp";

/**
 * Chat page body — SERVER-ONLY. The whole UI is one interactive island (`ChatApp`):
 * SSR draws its empty shell for a fast first paint, then the client boot hydrates it
 * and all chat state lives in the browser. No depth-0 data (`loadData` returns null).
 */
export default function Chat(_props: { data: unknown }) {
  return <Island name="chat" props={{}} of={ChatApp} />;
}
