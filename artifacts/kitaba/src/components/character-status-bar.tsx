import { Heart, Utensils, Moon } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import type { CharacterStatus } from '@workspace/api-client-react';

interface CharacterStatusBarProps {
  status: CharacterStatus;
}

export function CharacterStatusBar({ status }: CharacterStatusBarProps) {
  const getStatusColor = (value: number): string => {
    if (value >= 70) return 'hsl(var(--chart-1))';
    if (value >= 40) return 'hsl(32 50% 50%)';
    return 'hsl(0 60% 50%)';
  };

  return (
    <div className="border-b border-border bg-card/50 px-6 py-3" data-testid="character-status-bar">
      <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-center">
        <div className="flex items-center gap-4 text-sm">
          <span className="font-serif text-foreground" data-testid="text-character-name">
            {status.name}
          </span>
          <span className="text-muted-foreground">•</span>
          <span className="text-muted-foreground" data-testid="text-location">
            {status.locationName}
          </span>
        </div>

        <div className="text-center text-sm text-muted-foreground font-serif hidden md:block" data-testid="text-world-date">
          {status.worldDate}
        </div>

        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="flex items-center gap-2">
            <Heart className="w-4 h-4" style={{ color: getStatusColor(status.health) }} />
            <div className="flex-1">
              <Progress 
                value={status.health} 
                className="h-1.5" 
                style={{ 
                  '--progress-bg': getStatusColor(status.health) 
                } as React.CSSProperties}
                data-testid="progress-health"
              />
            </div>
            <span className="text-muted-foreground w-8 text-right" data-testid="text-health-value">
              {status.health}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Utensils className="w-4 h-4" style={{ color: getStatusColor(status.hunger) }} />
            <div className="flex-1">
              <Progress 
                value={status.hunger} 
                className="h-1.5" 
                style={{ 
                  '--progress-bg': getStatusColor(status.hunger) 
                } as React.CSSProperties}
                data-testid="progress-hunger"
              />
            </div>
            <span className="text-muted-foreground w-8 text-right" data-testid="text-hunger-value">
              {status.hunger}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Moon className="w-4 h-4" style={{ color: getStatusColor(status.fatigue) }} />
            <div className="flex-1">
              <Progress 
                value={status.fatigue} 
                className="h-1.5" 
                style={{ 
                  '--progress-bg': getStatusColor(status.fatigue) 
                } as React.CSSProperties}
                data-testid="progress-fatigue"
              />
            </div>
            <span className="text-muted-foreground w-8 text-right" data-testid="text-fatigue-value">
              {status.fatigue}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
