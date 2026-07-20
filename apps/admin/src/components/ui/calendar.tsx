import * as React from 'react';
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { DayPicker, getDefaultClassNames, type DayButton } from 'react-day-picker';

import { cn } from '@/lib/utils';
import { Button, buttonVariants } from '@/components/ui/button';

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = 'label',
  buttonVariant = 'ghost',
  formatters,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: React.ComponentProps<typeof Button>['variant'];
}) {
  const defaultClassNames = getDefaultClassNames();

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        'group/calendar bg-background p-3 [--cell-size:--spacing(9)] [[data-slot=card-content]_&]:bg-transparent [[data-slot=popover-content]_&]:bg-transparent',
        String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
        String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
        className,
      )}
      captionLayout={captionLayout}
      formatters={{
        formatMonthDropdown: (date) => date.toLocaleString('default', { month: 'short' }),
        ...formatters,
      }}
      classNames={{
        root: cn('w-fit', defaultClassNames.root),
        months: cn('relative flex flex-col gap-4 md:flex-row', defaultClassNames.months),
        month: cn('flex w-full flex-col gap-4', defaultClassNames.month),
        nav: cn(
          'absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1',
          defaultClassNames.nav,
        ),
        // Brand: month nav reads as a tactile chip — 2px ink border + hard offset
        // shadow that collapses on press, matching the sidebar/button vocabulary.
        button_previous: cn(
          buttonVariants({ variant: buttonVariant }),
          'size-(--cell-size) cursor-pointer border-2 border-foreground bg-background p-0 shadow-[var(--shadow-offset-sm)] transition-all select-none hover:bg-muted active:translate-x-[2px] active:translate-y-[2px] active:shadow-none motion-reduce:transition-none aria-disabled:opacity-50 aria-disabled:shadow-none',
          defaultClassNames.button_previous,
        ),
        button_next: cn(
          buttonVariants({ variant: buttonVariant }),
          'size-(--cell-size) cursor-pointer border-2 border-foreground bg-background p-0 shadow-[var(--shadow-offset-sm)] transition-all select-none hover:bg-muted active:translate-x-[2px] active:translate-y-[2px] active:shadow-none motion-reduce:transition-none aria-disabled:opacity-50 aria-disabled:shadow-none',
          defaultClassNames.button_next,
        ),
        month_caption: cn(
          'flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)',
          defaultClassNames.month_caption,
        ),
        dropdowns: cn(
          'flex h-(--cell-size) w-full items-center justify-center gap-1.5 text-sm font-medium',
          defaultClassNames.dropdowns,
        ),
        dropdown_root: cn(
          'relative rounded-md border border-input shadow-xs has-focus:border-ring has-focus:ring-[3px] has-focus:ring-ring/50',
          defaultClassNames.dropdown_root,
        ),
        dropdown: cn('absolute inset-0 bg-popover opacity-0', defaultClassNames.dropdown),
        // Brand: the month/year caption is display type (Fredoka).
        caption_label: cn(
          'font-display font-semibold select-none',
          captionLayout === 'label'
            ? 'text-h3'
            : 'flex h-8 items-center gap-1 rounded-md pr-1 pl-2 text-sm [&>svg]:size-3.5 [&>svg]:text-muted-foreground',
          defaultClassNames.caption_label,
        ),
        month_grid: cn('w-full border-collapse', defaultClassNames.month_grid),
        weekdays: cn('flex', defaultClassNames.weekdays),
        weekday: cn(
          'flex-1 rounded-md text-[0.7rem] font-bold tracking-wide text-foreground uppercase select-none',
          defaultClassNames.weekday,
        ),
        week: cn('mt-2 flex w-full', defaultClassNames.week),
        week_number_header: cn('w-(--cell-size) select-none', defaultClassNames.week_number_header),
        week_number: cn(
          'text-[0.8rem] text-muted-foreground select-none',
          defaultClassNames.week_number,
        ),
        day: cn(
          'group/day relative aspect-square h-full w-full p-0 text-center select-none [&:last-child[data-selected=true]_button]:rounded-r-md',
          props.showWeekNumber
            ? '[&:nth-child(2)[data-selected=true]_button]:rounded-l-md'
            : '[&:first-child[data-selected=true]_button]:rounded-l-md',
          defaultClassNames.day,
        ),
        range_start: cn('rounded-l-md bg-accent', defaultClassNames.range_start),
        range_middle: cn('rounded-none', defaultClassNames.range_middle),
        range_end: cn('rounded-r-md bg-accent', defaultClassNames.range_end),
        // Brand: "today" is an outline, not a fill — a jorange fill would fight the
        // jyellow selected state and make the two states hard to tell apart.
        today: cn(
          'rounded-md font-bold underline decoration-2 underline-offset-2 data-[selected=true]:rounded-none data-[selected=true]:no-underline',
          defaultClassNames.today,
        ),
        outside: cn(
          'text-muted-foreground aria-selected:text-muted-foreground',
          defaultClassNames.outside,
        ),
        disabled: cn('text-muted-foreground opacity-50', defaultClassNames.disabled),
        hidden: cn('invisible', defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...props }) => {
          return <div data-slot="calendar" ref={rootRef} className={cn(className)} {...props} />;
        },
        Chevron: ({ className, orientation, ...props }) => {
          if (orientation === 'left') {
            return <ChevronLeftIcon className={cn('size-4', className)} {...props} />;
          }

          if (orientation === 'right') {
            return <ChevronRightIcon className={cn('size-4', className)} {...props} />;
          }

          return <ChevronDownIcon className={cn('size-4', className)} {...props} />;
        },
        DayButton: CalendarDayButton,
        WeekNumber: ({ children, ...props }) => {
          return (
            <td {...props}>
              <div className="flex size-(--cell-size) items-center justify-center text-center">
                {children}
              </div>
            </td>
          );
        },
        ...components,
      }}
      {...props}
    />
  );
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const defaultClassNames = getDefaultClassNames();

  const ref = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      data-day={day.date.toLocaleDateString()}
      data-selected-single={
        modifiers.selected &&
        !modifiers.range_start &&
        !modifiers.range_end &&
        !modifiers.range_middle
      }
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      className={cn(
        'flex aspect-square size-auto w-full min-w-(--cell-size) flex-col gap-1 leading-none font-normal group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:border-ring group-data-[focused=true]/day:ring-[3px] group-data-[focused=true]/day:ring-ring/50 data-[range-end=true]:rounded-md data-[range-end=true]:rounded-r-md data-[range-end=true]:bg-primary data-[range-end=true]:text-primary-foreground data-[range-middle=true]:rounded-none data-[range-middle=true]:bg-accent data-[range-middle=true]:text-accent-foreground data-[range-start=true]:rounded-md data-[range-start=true]:rounded-l-md data-[range-start=true]:bg-primary data-[range-start=true]:text-primary-foreground data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground dark:hover:text-accent-foreground [&>span]:text-xs [&>span]:opacity-70',
        // Brand overrides. The shared Button puts a 2px ink border on EVERY variant,
        // which would turn the month grid into 42 heavy boxes — so idle days are
        // transparent-bordered and the border only appears on hover/selection. The
        // selected day then gets the full tactile treatment: jyellow + ink + offset.
        'cursor-pointer border-transparent hover:border-foreground hover:bg-muted',
        'data-[selected-single=true]:border-foreground data-[selected-single=true]:font-bold data-[selected-single=true]:shadow-[var(--shadow-offset-sm)]',
        defaultClassNames.day,
        className,
      )}
      {...props}
    />
  );
}

export { Calendar, CalendarDayButton };
