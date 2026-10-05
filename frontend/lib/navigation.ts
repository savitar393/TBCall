export type NavigationItem = { label: string; href: string; requiredPermissions?: readonly string[] };
// /me context has no separate backend permission; both F1 views require a session.
export const foundationNavigation: readonly NavigationItem[] = [
  { label: "Beranda", href: "/" },
  { label: "Akun/context", href: "/#akun" },
];
export function filterNavigation(items: readonly NavigationItem[], permissions: readonly string[]): NavigationItem[] {
  const granted = new Set(permissions);
  return items.filter((item) => (item.requiredPermissions ?? []).every((permission) => granted.has(permission)));
}
