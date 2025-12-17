"""
Swarm Trading Strategies

This module provides various trading strategies that can be used
in the AI Council voting system. Each strategy analyzes market data
and votes on whether to execute trades.
"""

from typing import Any, Protocol
from dataclasses import dataclass


class TradingStrategy(Protocol):
    """Protocol for trading strategy implementations"""
    
    def name(self) -> str:
        """Return strategy name"""
        ...
    
    def analyze(self, market_data: dict[str, Any]) -> dict[str, Any]:
        """Analyze market conditions and return analysis results"""
        ...
    
    def vote(self, analysis: dict[str, Any]) -> tuple[bool, str]:
        """Return (should_trade, reason) based on analysis"""
        ...


@dataclass
class StrategyResult:
    """Result from a strategy analysis"""
    vote: bool
    reason: str
    confidence: float
    metadata: dict[str, Any]


class MomentumStrategy:
    """Simple momentum-based strategy"""
    
    def __init__(self, threshold: float = 0.5):
        self.threshold = threshold
    
    def name(self) -> str:
        return "Momentum Strategy"
    
    def analyze(self, market_data: dict[str, Any]) -> dict[str, Any]:
        pct_change = market_data.get("pct_change", 0.0)
        
        return {
            "pct_change": pct_change,
            "signal": "BUY" if pct_change > self.threshold else "SELL" if pct_change < -self.threshold else "HOLD"
        }
    
    def vote(self, analysis: dict[str, Any]) -> tuple[bool, str]:
        signal = analysis.get("signal", "HOLD")
        pct_change = analysis.get("pct_change", 0.0)
        
        if signal == "BUY":
            return True, f"Positive momentum: {pct_change:.2f}%"
        return False, f"Momentum too weak: {pct_change:.2f}%"


class VolatilityStrategy:
    """Strategy that checks for excessive volatility"""
    
    def __init__(self, max_volatility: float = 2.0):
        self.max_volatility = max_volatility
    
    def name(self) -> str:
        return "Volatility Guard"
    
    def analyze(self, market_data: dict[str, Any]) -> dict[str, Any]:
        pct_change = abs(market_data.get("pct_change", 0.0))
        
        return {
            "volatility": pct_change,
            "safe": pct_change <= self.max_volatility
        }
    
    def vote(self, analysis: dict[str, Any]) -> tuple[bool, str]:
        volatility = analysis.get("volatility", 0.0)
        safe = analysis.get("safe", True)
        
        if safe:
            return True, f"Volatility acceptable: {volatility:.2f}%"
        return False, f"Volatility too high: {volatility:.2f}%"


class RiskManagementStrategy:
    """Strategy that enforces risk management rules"""
    
    def name(self) -> str:
        return "Risk Manager"
    
    def analyze(self, market_data: dict[str, Any]) -> dict[str, Any]:
        orders_left = market_data.get("orders_left", False)
        balance = market_data.get("balance")
        max_order_size = market_data.get("max_order_size", 0.0)
        
        # Check if we have budget for the trade
        # If balance is unknown (None), we conservatively assume insufficient budget
        has_budget = False
        if balance is not None and balance >= max_order_size:
            has_budget = True
        
        return {
            "orders_left": orders_left,
            "has_budget": has_budget,
            "safe_to_trade": orders_left and has_budget,
            "balance": balance,
        }
    
    def vote(self, analysis: dict[str, Any]) -> tuple[bool, str]:
        safe_to_trade = analysis.get("safe_to_trade", False)
        orders_left = analysis.get("orders_left", False)
        has_budget = analysis.get("has_budget", False)
        balance = analysis.get("balance")
        
        if safe_to_trade:
            return True, "Risk limits satisfied"
        
        if not orders_left:
            return False, "Daily order limit reached"
        if not has_budget:
            if balance is None:
                return False, "Balance unknown - cannot verify budget"
            return False, "Insufficient balance"
        
        return False, "Risk check failed"


class TrendFollowingStrategy:
    """Strategy that follows price trends"""
    
    def __init__(self, min_trend: float = 0.1):
        self.min_trend = min_trend
    
    def name(self) -> str:
        return "Trend Follower"
    
    def analyze(self, market_data: dict[str, Any]) -> dict[str, Any]:
        pct_change = market_data.get("pct_change", 0.0)
        last_price = market_data.get("last_price")
        open_price = market_data.get("open_price")
        
        # Check if we have a clear trend
        has_trend = pct_change > self.min_trend
        trend_direction = "UP" if pct_change > 0 else "DOWN"
        
        return {
            "has_trend": has_trend,
            "trend_direction": trend_direction,
            "pct_change": pct_change,
            "last_price": last_price,
            "open_price": open_price
        }
    
    def vote(self, analysis: dict[str, Any]) -> tuple[bool, str]:
        has_trend = analysis.get("has_trend", False)
        trend_direction = analysis.get("trend_direction", "FLAT")
        pct_change = analysis.get("pct_change", 0.0)
        
        if has_trend and trend_direction == "UP":
            return True, f"Uptrend detected: {pct_change:.2f}%"
        return False, f"No strong uptrend: {pct_change:.2f}%"


class ConservativeStrategy:
    """Conservative strategy that only trades on strong signals"""
    
    def __init__(self, min_gain: float = 1.0):
        self.min_gain = min_gain
    
    def name(self) -> str:
        return "Conservative Trader"
    
    def analyze(self, market_data: dict[str, Any]) -> dict[str, Any]:
        pct_change = market_data.get("pct_change", 0.0)
        
        return {
            "pct_change": pct_change,
            "strong_signal": pct_change >= self.min_gain
        }
    
    def vote(self, analysis: dict[str, Any]) -> tuple[bool, str]:
        pct_change = analysis.get("pct_change", 0.0)
        strong_signal = analysis.get("strong_signal", False)
        
        if strong_signal:
            return True, f"Strong buy signal: {pct_change:.2f}%"
        return False, f"Signal not strong enough: {pct_change:.2f}%"


class SwarmStrategyManager:
    """Manages multiple trading strategies and aggregates their votes"""
    
    def __init__(self):
        self.strategies: list[TradingStrategy] = []
    
    def add_strategy(self, strategy: TradingStrategy):
        """Add a strategy to the swarm"""
        self.strategies.append(strategy)
    
    def get_council_vote(
        self,
        market_data: dict[str, Any],
        threshold: float = 0.8
    ) -> tuple[str, list[str], bool]:
        """
        Run all strategies and aggregate votes.
        
        Args:
            market_data: Dictionary containing market information
            threshold: Fraction of strategies that must vote YES (default: 0.8)
        
        Returns:
            Tuple of (votes_string, reasons_list, approved_boolean)
        """
        if not self.strategies:
            return "0/0", ["No strategies configured"], False
        
        votes_yes = 0
        reasons = []
        
        for strategy in self.strategies:
            try:
                analysis = strategy.analyze(market_data)
                should_trade, reason = strategy.vote(analysis)
                
                if should_trade:
                    votes_yes += 1
                
                vote_str = "YES" if should_trade else "NO"
                strategy_name = strategy.name() if hasattr(strategy, 'name') else strategy.__class__.__name__
                reasons.append(f"{strategy_name}: {vote_str} - {reason}")
                
            except Exception as e:
                # If a strategy fails, log it but continue with others
                strategy_name = strategy.name() if hasattr(strategy, 'name') else strategy.__class__.__name__
                reasons.append(f"{strategy_name}: ERROR - {str(e)[:50]}")
        
        total = len(self.strategies)
        min_yes_votes = int(total * threshold)
        approved = votes_yes >= min_yes_votes
        
        return f"{votes_yes}/{total}", reasons, approved


def create_default_swarm() -> SwarmStrategyManager:
    """Create a swarm manager with default strategies"""
    manager = SwarmStrategyManager()
    
    # Add various strategies with different parameters
    manager.add_strategy(MomentumStrategy(threshold=0.5))
    manager.add_strategy(MomentumStrategy(threshold=0.1))
    manager.add_strategy(VolatilityStrategy(max_volatility=2.0))
    manager.add_strategy(RiskManagementStrategy())
    manager.add_strategy(TrendFollowingStrategy(min_trend=0.1))
    manager.add_strategy(ConservativeStrategy(min_gain=1.0))
    
    return manager


def hybrid_council_vote(
    market_data: dict[str, Any],
    use_openai: bool = False,
    openai_func: Any = None,
) -> tuple[str, list[str], bool]:
    """
    Hybrid voting that combines traditional strategies with optional OpenAI.
    
    Args:
        market_data: Market data dictionary
        use_openai: Whether to include OpenAI votes
        openai_func: Optional function that returns OpenAI council votes
    
    Returns:
        Tuple of (votes_string, reasons_list, approved_boolean)
    """
    # Get traditional strategy votes
    manager = create_default_swarm()
    trad_votes, trad_reasons, _ = manager.get_council_vote(market_data)
    
    # If OpenAI is not enabled, return traditional votes only
    if not use_openai or openai_func is None:
        trad_yes = int(trad_votes.split('/')[0])
        trad_total = int(trad_votes.split('/')[1])
        approved = trad_yes >= int(trad_total * 0.8)
        return trad_votes, trad_reasons, approved
    
    # Get OpenAI votes
    try:
        ai_votes, ai_reasons, _ = openai_func(market_data)
        
        # Combine results
        trad_yes = int(trad_votes.split('/')[0])
        trad_total = int(trad_votes.split('/')[1])
        ai_yes = int(ai_votes.split('/')[0])
        ai_total = int(ai_votes.split('/')[1])
        
        combined_yes = trad_yes + ai_yes
        combined_total = trad_total + ai_total
        combined_votes = f"{combined_yes}/{combined_total}"
        combined_reasons = trad_reasons + ai_reasons
        
        # Require 80% approval from combined council
        approved = combined_yes >= int(combined_total * 0.8)
        
        return combined_votes, combined_reasons, approved
        
    except Exception as e:
        # If OpenAI fails, fall back to traditional strategies
        trad_yes = int(trad_votes.split('/')[0])
        trad_total = int(trad_votes.split('/')[1])
        approved = trad_yes >= int(trad_total * 0.8)
        return trad_votes, trad_reasons + [f"OpenAI Error: {str(e)[:50]}"], approved
