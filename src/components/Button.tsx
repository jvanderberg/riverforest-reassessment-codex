import { Slot } from '@radix-ui/react-slot';
import { type VariantProps, cva } from 'class-variance-authority';
import type * as React from 'react';
import { cn } from '../lib/utils';

const buttonVariants = cva(
	'inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
	{
		variants: {
			variant: {
				default:
					'bg-primary text-primary-foreground hover:bg-primary/90 border border-primary',
				outline: 'border border-border bg-background hover:bg-muted text-foreground',
				secondary: 'border border-border bg-muted text-foreground hover:bg-muted/80',
				ghost: 'hover:bg-muted text-foreground',
				destructive:
					'border border-destructive bg-destructive text-primary-foreground hover:bg-destructive/90',
			},
			size: {
				default: 'h-8 px-3',
				icon: 'size-8 p-0',
				sm: 'h-7 px-2 text-xs',
			},
		},
		defaultVariants: {
			variant: 'default',
			size: 'default',
		},
	},
);

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
	VariantProps<typeof buttonVariants> & {
		asChild?: boolean;
	};

export function Button({
	className,
	variant,
	size,
	asChild = false,
	...props
}: ButtonProps) {
	const Comp = asChild ? Slot : 'button';
	return (
		<Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />
	);
}
