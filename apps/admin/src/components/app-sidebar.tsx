import { Link, useLocation } from '@tanstack/react-router';
import { navConfig } from '@/config/nav-config';
import { NavUser } from '@/components/nav-user';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const BRAND_TILE_CLASS =
  'flex size-8 shrink-0 items-center justify-center rounded bg-primary border-2 border-foreground shadow-[2px_2px_0_var(--color-ink)]';

/**
 * The brand "J" tile. It is a real button ONLY on the collapsed desktop rail,
 * where it is the single visible, clickable, keyboard-reachable way back out
 * (the rail is only 3rem — it fits one control, and the tile is it).
 *
 * When expanded, the dedicated hamburger `SidebarTrigger` owns collapsing, so
 * the tile is purely decorative: not focusable, no hover/press affordance, no
 * tooltip, no pointer cursor.
 *
 * Below `md` the sidebar is an offcanvas sheet whose header is only visible
 * while it is already open — a toggle there would just close the sheet from
 * inside it. So on mobile the tile stays a plain decorative span, unchanged.
 */
function BrandTile() {
  const { isMobile, state, toggleSidebar } = useSidebar();

  if (isMobile || state !== 'collapsed') {
    return <span className={BRAND_TILE_CLASS}>J</span>;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label="Expand sidebar"
          className={`${BRAND_TILE_CLASS} cursor-pointer transition-all hover:bg-primary/80 active:translate-x-px active:translate-y-px active:shadow-[1px_1px_0_var(--color-ink)]`}
        >
          <span aria-hidden="true">J</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" align="center">
        Expand sidebar
      </TooltipContent>
    </Tooltip>
  );
}

export function AppSidebar() {
  const location = useLocation();

  return (
    <Sidebar collapsible="icon" className="border-r-2 border-foreground bg-background">
      <SidebarHeader className="border-b-2 border-foreground p-4 group-data-[collapsible=icon]:px-1 group-data-[collapsible=icon]:py-2">
        {/*
         * Header swaps at icon width. Expanded: [J] Jojo Potato ......... [trigger].
         * Collapsed: the wordmark and the hamburger trigger drop out and the J
         * tile takes the rail alone, centered, as the expand control. The rail
         * is ~3rem — it fits exactly one control, and that control has to be the
         * way back out, so the tile doubles as it rather than disappearing.
         *
         * The hamburger trigger is desktop-only: below `md` the sidebar is an
         * offcanvas sheet, so a trigger inside it is unreachable when closed.
         * That breakpoint owns the trigger in the main content area instead —
         * see `(dashboard)/route.tsx`. Exactly one trigger is visible at any width.
         */}
        <div className="flex items-center gap-2 px-2 font-display text-h3 font-bold text-foreground tracking-tight group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <BrandTile />
          <span className="group-data-[collapsible=icon]:hidden">Jojo Potato</span>
          <SidebarTrigger className="ml-auto hidden size-8 shrink-0 rounded border-2 border-foreground bg-background text-foreground shadow-[2px_2px_0_var(--color-ink)] transition-all hover:bg-cream-tint-1 active:translate-x-px active:translate-y-px active:shadow-[1px_1px_0_var(--color-ink)] md:flex group-data-[collapsible=icon]:hidden" />
        </div>
      </SidebarHeader>

      <SidebarContent>
        {navConfig.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="font-display text-caption font-semibold uppercase tracking-wider text-muted-foreground">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const isActive = item.activeOptions?.exact
                    ? location.pathname === item.to
                    : location.pathname.startsWith(item.to) &&
                      (location.pathname === item.to ||
                        location.pathname.charAt(item.to.length) === '/');

                  return (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        disabled={item.disabled}
                        tooltip={item.label}
                        className={`
                          rounded-md text-foreground transition-all
                          hover:bg-cream-tint-1 hover:border-2 hover:border-foreground
                          active:shadow-[1px_1px_0_var(--color-ink)] active:translate-x-px active:translate-y-px
                          ${item.disabled ? 'opacity-40 cursor-not-allowed' : ''}
                          ${isActive ? 'bg-primary border-2 border-foreground shadow-[3px_3px_0_var(--color-ink)]' : 'border-2 border-transparent'}
                        `}
                      >
                        <Link to={item.to} disabled={item.disabled}>
                          <item.icon className="size-4" />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
