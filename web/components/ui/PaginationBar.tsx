'use client';
import { Button } from '@heroui/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationBarProps {
  page: number;
  totalPages: number;
  totalItems: number;
  onPrev: () => void;
  onNext: () => void;
  labelPage: string;
  labelOf: string;
  labelItems: string;
}

export function PaginationBar({
  page,
  totalPages,
  totalItems,
  onPrev,
  onNext,
  labelPage,
  labelOf,
  labelItems,
}: PaginationBarProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between mt-4 px-1">
      <span className="text-xs text-default-400">
        {totalItems} {labelItems}
      </span>
      <div className="flex items-center gap-2">
        <Button
          isIconOnly
          size="sm"
          variant="flat"
          isDisabled={page <= 1}
          onPress={onPrev}
          aria-label="Page précédente"
        >
          <ChevronLeft size={16} />
        </Button>
        <span className="text-sm text-default-500 tabular-nums">
          {labelPage} {page} {labelOf} {totalPages}
        </span>
        <Button
          isIconOnly
          size="sm"
          variant="flat"
          isDisabled={page >= totalPages}
          onPress={onNext}
          aria-label="Page suivante"
        >
          <ChevronRight size={16} />
        </Button>
      </div>
    </div>
  );
}
