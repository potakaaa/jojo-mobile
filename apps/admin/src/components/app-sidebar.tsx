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
} from '@/components/ui/sidebar';

export function AppSidebar() {
  const location = useLocation();

  return (
    <Sidebar className="border-r-2 border-foreground bg-background">
      <SidebarHeader className="border-b-2 border-foreground p-4">
        <div className="flex items-center gap-2 px-2 font-display text-h3 font-bold text-foreground tracking-tight">
          <span className="flex size-8 items-center justify-center rounded bg-primary border-2 border-foreground shadow-[2px_2px_0_var(--color-ink)]">
            J
          </span>
          Jojo Potato
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
                        className={`
                          rounded-md text-foreground transition-all
                          hover:bg-cream-tint-1 hover:border-2 hover:border-foreground
                          active:shadow-[1px_1px_0_var(--color-ink)] active:translate-x-px active:translate-y-px
                          ${item.disabled ? 'opacity-40 pointer-events-none cursor-not-allowed' : ''}
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
