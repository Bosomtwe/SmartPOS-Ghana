// src/lib/utils.ts
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge class names with Tailwind CSS conflict resolution.
 * Used by shadcn/ui and many Tailwind projects.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}