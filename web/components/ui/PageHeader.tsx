'use client';
import React from 'react';
import { Button, Tabs, cn, type TabsProps } from '@heroui/react';
import { Plus, type LucideIcon } from 'lucide-react';

/** A page's "create" action (new cellar, new collection, …). */
export interface PageCreateAction {
  /** Already translated, e.g. « Ajouter une cave ». */
  label: string;
  onPress: () => void;
  /** Set on the labelled button only, so a test id never matches twice. */
  testId?: string;
  isDisabled?: boolean;
}

/**
 * #701: one rule for create buttons — a labelled button from `sm` up and the
 * round floating button (ux-ui.md §5.4) only below `sm`, never both at once.
 */
export function CreateAction({ label, onPress, testId, isDisabled }: PageCreateAction) {
  return (
    <>
      <Button
        data-testid={testId}
        color="primary"
        startContent={<Plus size={16} aria-hidden="true" />}
        onPress={onPress}
        isDisabled={isDisabled}
        className="hidden sm:flex"
      >
        {label}
      </Button>
      <Button
        color="primary"
        radius="full"
        size="lg"
        isIconOnly
        onPress={onPress}
        isDisabled={isDisabled}
        aria-label={label}
        className="sm:hidden fixed bottom-[calc(var(--bottom-nav-h)_+_1rem)] right-4 z-30 shadow-lg"
      >
        <Plus size={22} aria-hidden="true" />
      </Button>
    </>
  );
}

export interface PageHeaderProps {
  icon: LucideIcon;
  /** The page's h1. */
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Buttons and toggles on the right of the title. */
  actions?: React.ReactNode;
  /** The page's create action, after the other actions. */
  create?: PageCreateAction;
  titleTestId?: string;
  /** Merged over the default classes (tailwind-merge): `mb-0` drops the bottom margin. */
  className?: string;
  /** The page's tabs (PageTabs), under the title. */
  children?: React.ReactNode;
}

/**
 * #701: the header every page shares — icon, `h1`, optional subtitle, actions
 * on the right, tabs underneath. Pages used to differ in size, icon, card
 * wrapping and tab placement (tabs above the title on some).
 */
export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
  create,
  titleTestId,
  className,
  children,
}: PageHeaderProps) {
  return (
    <div className={cn('mb-6 flex flex-col gap-3', className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-2 min-w-0 mr-auto">
          <Icon size={22} className="text-primary shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <h1 data-testid={titleTestId} className="text-xl font-bold break-words">{title}</h1>
            {subtitle && <div className="text-sm text-foreground-500">{subtitle}</div>}
          </div>
        </div>
        {(actions || create) && (
          <div className="flex flex-wrap items-center gap-2">
            {actions}
            {create && <CreateAction {...create} />}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

/**
 * #701: one tab style for the pages' sections — compact and left-aligned
 * (ux-ui.md §4.9, `underlined`), scrolling sideways when they do not fit.
 */
export function PageTabs<T extends object>({ classNames, ...props }: TabsProps<T>) {
  return (
    <Tabs
      variant="underlined"
      color="primary"
      size="md"
      classNames={{ base: 'max-w-full', ...classNames }}
      {...props}
    />
  );
}
