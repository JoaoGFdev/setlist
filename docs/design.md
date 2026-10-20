# Setlist design system

Setlist is a personal music workbench: two libraries feed one track-by-track transfer workspace. The interface stays quiet so playlists, covers and match results carry the page.

Built on [shadcn/ui](https://ui.shadcn.com) (`base-nova` style, Base UI primitives, lucide icons) with Tailwind CSS v4. Components live in `src/components/ui` and are added with `pnpm dlx shadcn@latest add <component>`. Tokens live in `src/styles.css`.

## Color

| Role | Token | Use |
| --- | --- | --- |
| Ink / paper | `foreground`, `background`, `card` | Text and surfaces. Ink carries a slight violet tint from the app icon. |
| Primary | `primary` | Main actions (ink in light mode, paper in dark mode). |
| Brand coral | `brand`, `brand-muted` | Emphasis only: hero accents, focus ring, the single most important call to action on a page (`Button variant="brand"`). |
| Brand teal | `brand-2`, `brand-2-muted` | Secondary emphasis, the "linked" state. |
| Status | `success`, `warning`, `destructive` (+ `-muted`) | Transfer outcomes and errors. |
| Providers | `spotify`, `youtube` (+ `-muted`) | Only to identify a service (marks, direction dots). Never decoration. |

Every role has a dark-mode value. Use semantic utilities (`bg-muted`, `text-muted-foreground`, `bg-spotify-muted text-spotify`) and never raw palette classes or manual `dark:` color overrides.

## Type and shape

- Geist Variable for everything; headings use `font-heading` with tight tracking and `text-balance`.
- Radius base `0.75rem`. Controls follow the `base-nova` heights (`h-8` default, `h-9` large).
- Numbers that change (track counts, progress) use `tabular-nums`.

## Layout

- `AppShell` (`src/components/app-shell.tsx`) owns the sticky header, primary nav (Workspace, Linked, History, Settings), theme toggle, account menu and footer. Pages render only their content inside `max-w-6xl`.
- Pages open with a page header: `h1` (`text-2xl sm:text-3xl font-semibold`) plus a one-line `text-muted-foreground` description, then content in `Card`s or `Item` lists.
- Lists are left aligned and dense, like a music library. Leave generous room around the active transfer.

## Composition rules

- Callouts use `Alert`, empty states use `Empty`, loading uses `Skeleton` or `Spinner`, status uses `Badge`, confirmations use `AlertDialog`, transient feedback uses `toast` from `sonner`.
- Forms use `FieldGroup` and `Field`. Icons inside buttons take `data-icon="inline-start|inline-end"` and no size classes.
- Spacing uses `flex`/`grid` with `gap-*`, never `space-*`.
- Errors explain the next action. A service that is unavailable never blocks the other one.
