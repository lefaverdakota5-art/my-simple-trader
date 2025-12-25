import { cn } from '@/lib/utils';

interface LiveStatusDotProps {
  isLive: boolean;
  className?: string;
}

export function LiveStatusDot({ isLive, className }: LiveStatusDotProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div 
        className={cn(
          'w-3 h-3 rounded-full transition-colors',
          isLive 
            ? 'bg-green-500 animate-pulse shadow-lg shadow-green-500/50' 
            : 'bg-red-500'
        )}
      />
      <span className={cn(
        'text-sm font-medium',
        isLive ? 'text-green-600' : 'text-red-600'
      )}>
        {isLive ? 'Live' : 'Offline'}
      </span>
    </div>
  );
}
