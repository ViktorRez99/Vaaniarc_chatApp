import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center font-ui font-medium transition-all duration-base focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 disabled:opacity-40 disabled:pointer-events-none cursor-pointer select-none active:scale-95',
  {
    variants: {
      variant: {
        default: 'bg-accent text-void hover:brightness-110 shadow-glow',
        secondary: 'bg-elevated text-tx-primary hover:bg-hover border border-bd',
        ghost: 'bg-transparent text-tx-secondary hover:bg-hover/50 hover:text-tx-primary',
        danger: 'bg-danger text-white hover:brightness-110',
        outline: 'border border-bd bg-transparent text-tx-primary hover:bg-hover/50',
        accent: 'bg-accent-dim text-accent border border-bd-accent hover:bg-accent/20',
        glass: 'glass text-tx-primary hover:bg-white/5',
        glow: 'bg-accent text-void shadow-glow hover:shadow-glow-lg hover:brightness-110',
      },
      size: {
        sm: 'h-7 px-3 text-xs rounded-md gap-1.5',
        md: 'h-9 px-4 text-sm rounded-lg gap-2',
        lg: 'h-11 px-6 text-sm rounded-xl gap-2',
        icon: 'h-9 w-9 rounded-lg',
        'icon-sm': 'h-7 w-7 rounded-md',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
);

const Button = ({ className, variant, size, ...props }) => {
  return (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
};

export { Button, buttonVariants };
export default Button;
