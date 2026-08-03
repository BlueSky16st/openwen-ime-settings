import { Brush, Database, Keyboard, type LucideIcon } from "lucide-react";

export const settingsPages = [
  { id: "input", label: "输入", icon: Keyboard },
  { id: "appearance", label: "外观", icon: Brush },
  { id: "learning", label: "本地学习", icon: Database }
] as const satisfies ReadonlyArray<{ id: string; label: string; icon: LucideIcon }>;

export type PageId = (typeof settingsPages)[number]["id"];

/** 返回三页导航的固定用户可见名称。 */
export function getPageLabel(pageId: PageId): string {
  return settingsPages.find((page) => page.id === pageId)?.label ?? "输入";
}
