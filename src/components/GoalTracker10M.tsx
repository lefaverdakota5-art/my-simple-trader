import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Target, TrendingUp, Calendar, Zap, Trophy, Rocket } from "lucide-react";

interface GoalTracker10MProps {
  portfolioValue: number;
  dailyProfit: number;
  winRate: number;
}

export function GoalTracker10M({ portfolioValue, dailyProfit, winRate }: GoalTracker10MProps) {
  const GOAL = 10_000_000; // $10M goal
  
  const stats = useMemo(() => {
    const currentValue = portfolioValue || 0;
    const progressPercent = Math.min((currentValue / GOAL) * 100, 100);
    const remaining = Math.max(GOAL - currentValue, 0);
    
    // Calculate daily compound growth rate needed
    const dailyGrowthRate = currentValue > 0 ? (dailyProfit / currentValue) * 100 : 0;
    
    // Average daily growth (assuming consistent trading)
    const avgDailyGrowth = dailyGrowthRate > 0 ? dailyGrowthRate : 0.5; // Default to 0.5% if no data
    
    // Calculate days to goal using compound growth formula
    // FV = PV * (1 + r)^n => n = log(FV/PV) / log(1 + r)
    let daysToGoal = Infinity;
    if (currentValue > 0 && avgDailyGrowth > 0) {
      const r = avgDailyGrowth / 100;
      daysToGoal = Math.ceil(Math.log(GOAL / currentValue) / Math.log(1 + r));
    }
    
    // Calculate projected date
    const projectedDate = new Date();
    if (daysToGoal !== Infinity && daysToGoal > 0) {
      projectedDate.setDate(projectedDate.getDate() + daysToGoal);
    }
    
    // Calculate cumulative gains needed
    const gainsNeeded = remaining;
    
    // Daily target to hit goal in 1 year
    const dailyTargetForYear = remaining / 365;
    
    // Weekly compound projection
    const weeklyProjection = currentValue * Math.pow(1 + avgDailyGrowth / 100, 7) - currentValue;
    const monthlyProjection = currentValue * Math.pow(1 + avgDailyGrowth / 100, 30) - currentValue;
    const yearlyProjection = currentValue * Math.pow(1 + avgDailyGrowth / 100, 365) - currentValue;
    
    // Milestones
    const milestones = [
      { label: '$100K', value: 100_000, reached: currentValue >= 100_000 },
      { label: '$250K', value: 250_000, reached: currentValue >= 250_000 },
      { label: '$500K', value: 500_000, reached: currentValue >= 500_000 },
      { label: '$1M', value: 1_000_000, reached: currentValue >= 1_000_000 },
      { label: '$2.5M', value: 2_500_000, reached: currentValue >= 2_500_000 },
      { label: '$5M', value: 5_000_000, reached: currentValue >= 5_000_000 },
      { label: '$7.5M', value: 7_500_000, reached: currentValue >= 7_500_000 },
      { label: '$10M', value: 10_000_000, reached: currentValue >= 10_000_000 },
    ];
    
    const nextMilestone = milestones.find(m => !m.reached) || milestones[milestones.length - 1];
    const milestonesReached = milestones.filter(m => m.reached).length;
    
    return {
      currentValue,
      progressPercent,
      remaining,
      dailyGrowthRate,
      avgDailyGrowth,
      daysToGoal,
      projectedDate,
      gainsNeeded,
      dailyTargetForYear,
      weeklyProjection,
      monthlyProjection,
      yearlyProjection,
      milestones,
      nextMilestone,
      milestonesReached,
    };
  }, [portfolioValue, dailyProfit]);

  const formatMoney = (value: number) => {
    if (value >= 1_000_000) {
      return `$${(value / 1_000_000).toFixed(2)}M`;
    }
    if (value >= 1_000) {
      return `$${(value / 1_000).toFixed(1)}K`;
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  return (
    <Card className="border-2 border-primary/20 bg-gradient-to-br from-background to-primary/5">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Trophy className="h-5 w-5 text-yellow-500" />
          $10M Goal Tracker
          <span className="ml-auto text-sm font-normal text-muted-foreground">
            {stats.milestonesReached}/{stats.milestones.length} milestones
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="font-medium">{formatMoney(stats.currentValue)}</span>
            <span className="text-muted-foreground">{formatMoney(GOAL)}</span>
          </div>
          <Progress value={stats.progressPercent} className="h-3" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{stats.progressPercent.toFixed(4)}% complete</span>
            <span>{formatMoney(stats.remaining)} to go</span>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <TrendingUp className="h-3 w-3" />
              Daily Growth Rate
            </div>
            <p className={`text-lg font-bold ${stats.dailyGrowthRate >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {stats.dailyGrowthRate >= 0 ? '+' : ''}{stats.dailyGrowthRate.toFixed(3)}%
            </p>
          </div>

          <div className="bg-muted/50 rounded-lg p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Calendar className="h-3 w-3" />
              Est. Days to Goal
            </div>
            <p className="text-lg font-bold">
              {stats.daysToGoal === Infinity ? '∞' : stats.daysToGoal.toLocaleString()}
            </p>
          </div>

          <div className="bg-muted/50 rounded-lg p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Rocket className="h-3 w-3" />
              Projected Date
            </div>
            <p className="text-sm font-bold">
              {stats.daysToGoal === Infinity ? 'Keep trading!' : formatDate(stats.projectedDate)}
            </p>
          </div>

          <div className="bg-muted/50 rounded-lg p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Target className="h-3 w-3" />
              Next Milestone
            </div>
            <p className="text-lg font-bold text-primary">
              {stats.nextMilestone.label}
            </p>
          </div>
        </div>

        {/* Compound Growth Projections */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium flex items-center gap-1.5">
            <Zap className="h-4 w-4 text-yellow-500" />
            Compound Growth Projections
          </h4>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-green-500/10 rounded-lg p-2">
              <p className="text-xs text-muted-foreground">7 Days</p>
              <p className="text-sm font-bold text-green-600">
                +{formatMoney(stats.weeklyProjection)}
              </p>
            </div>
            <div className="bg-green-500/10 rounded-lg p-2">
              <p className="text-xs text-muted-foreground">30 Days</p>
              <p className="text-sm font-bold text-green-600">
                +{formatMoney(stats.monthlyProjection)}
              </p>
            </div>
            <div className="bg-green-500/10 rounded-lg p-2">
              <p className="text-xs text-muted-foreground">365 Days</p>
              <p className="text-sm font-bold text-green-600">
                +{formatMoney(stats.yearlyProjection)}
              </p>
            </div>
          </div>
        </div>

        {/* Milestones */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Milestones</h4>
          <div className="flex flex-wrap gap-1.5">
            {stats.milestones.map((milestone) => (
              <span
                key={milestone.label}
                className={`px-2 py-1 rounded-full text-xs font-medium transition-all ${
                  milestone.reached
                    ? 'bg-green-500 text-white'
                    : stats.nextMilestone.value === milestone.value
                    ? 'bg-primary/20 text-primary border border-primary'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {milestone.label}
                {milestone.reached && ' ✓'}
              </span>
            ))}
          </div>
        </div>

        {/* Daily Target */}
        <div className="bg-primary/10 rounded-lg p-3 text-center">
          <p className="text-xs text-muted-foreground mb-1">Daily target to hit $10M in 1 year</p>
          <p className="text-xl font-bold text-primary">
            {formatMoney(stats.dailyTargetForYear)}/day
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
