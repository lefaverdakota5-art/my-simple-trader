import { Switch } from "@/components/ui/switch";
import { Power } from "lucide-react";
import { cn } from "@/lib/utils";

interface BotOnOffSwitchProps {
  isOn: boolean;
  onToggle: () => void;
  disabled?: boolean;
  className?: string;
}

export function BotOnOffSwitch({ isOn, onToggle, disabled, className }: BotOnOffSwitchProps) {
  return (
    <div className={cn(
      "flex items-center justify-between p-4 rounded-lg border-2 transition-colors",
      isOn 
        ? "border-green-500 bg-green-50 dark:bg-green-950" 
        : "border-red-500 bg-red-50 dark:bg-red-950",
      className
    )}>
      <div className="flex items-center gap-3">
        <Power className={cn(
          "h-6 w-6",
          isOn ? "text-green-600" : "text-red-600"
        )} />
        <div>
          <span className="font-semibold text-lg">
            Bots {isOn ? 'ON' : 'OFF'}
          </span>
          <p className="text-sm text-muted-foreground">
            {isOn ? 'Trading is active' : 'Trading is paused'}
          </p>
        </div>
      </div>
      <Switch 
        checked={isOn}
        onCheckedChange={onToggle}
        disabled={disabled}
        className="data-[state=checked]:bg-green-600"
      />
    </div>
  );
}
