# Open Source Swarm Bot Integration Guide

## Overview

This document outlines strategies for integrating open-source swarm trading bot code into the Simple Trader application. The goal is to enhance trading capabilities while maintaining the existing architecture.

## Current Architecture

The application currently implements:

1. **AI Council Voting System**: Multiple AI agents vote on trading decisions
2. **Heuristic Strategies**: Price momentum, volatility checks, risk limits
3. **OpenAI Integration**: GPT-based intelligent decision making
4. **Multi-Exchange Support**: Kraken (crypto) and Alpaca (stocks)
5. **24/7 Autonomous Operation**: Backend bot runs continuously

## Compatible Open Source Projects

### 1. Freqtrade (Python)
**Repository**: https://github.com/freqtrade/freqtrade
**Language**: Python
**Features**:
- Advanced technical analysis strategies
- Backtesting framework
- Risk management tools
- Multiple exchange support

**Integration Approach**:
```python
# Example: Import Freqtrade strategies
from freqtrade.strategy import IStrategy
import pandas as pd

class FreqtradeAdapter:
    def __init__(self, strategy: IStrategy):
        self.strategy = strategy
    
    def analyze(self, ohlcv_data: pd.DataFrame) -> str:
        """Analyze market data using Freqtrade strategy"""
        signals = self.strategy.populate_buy_trend(ohlcv_data, {})
        if signals['buy'].iloc[-1]:
            return "BUY"
        elif signals['sell'].iloc[-1]:
            return "SELL"
        return "HOLD"

# Usage in main.py
def _freqtrade_council_vote(market_data: dict) -> tuple[str, list[str], bool]:
    # Convert market data to OHLCV format
    # Run multiple Freqtrade strategies
    # Aggregate results into voting format
    pass
```

### 2. Jesse (Python)
**Repository**: https://github.com/jesse-ai/jesse
**Language**: Python
**Features**:
- Clean strategy API
- Machine learning integration
- Live trading support
- Portfolio management

**Integration Benefits**:
- Similar Python stack (FastAPI compatible)
- Clean separation of concerns
- Easy to adapt strategies

### 3. Gekko (JavaScript/Node.js)
**Repository**: https://github.com/askmike/gekko
**Language**: JavaScript
**Features**:
- Multiple trading strategies
- Web UI for monitoring
- Plugin architecture

**Note**: Project is less actively maintained, but strategies can be ported to Python.

### 4. Catalyst (Python)
**Repository**: https://github.com/enigmampc/catalyst
**Language**: Python
**Features**:
- Crypto trading focus
- Backtesting framework
- Integration with Zipline

**Integration Approach**:
- Use Catalyst's TradingAlgorithm as base
- Adapt to work with our existing exchange clients

## Implementation Strategy

### Phase 1: Research and Selection
1. **Evaluate Strategies**:
   - Review top-performing open-source strategies
   - Test in backtesting environment
   - Document expected performance characteristics

2. **Licensing Review**:
   - Ensure MIT/Apache/GPL compatibility
   - Document attribution requirements
   - Review commercial use permissions

### Phase 2: Adapter Pattern Implementation

Create adapter classes to bridge open-source code with our architecture:

```python
# File: swarm_strategies.py

from typing import Protocol, Any
from dataclasses import dataclass

class TradingStrategy(Protocol):
    """Protocol for trading strategy adapters"""
    
    def analyze(self, market_data: dict[str, Any]) -> dict[str, Any]:
        """Analyze market conditions"""
        ...
    
    def vote(self, analysis: dict[str, Any]) -> tuple[bool, str]:
        """Return (should_trade, reason)"""
        ...

@dataclass
class StrategyResult:
    vote: bool
    reason: str
    confidence: float
    metadata: dict[str, Any]

class MovingAverageStrategy(TradingStrategy):
    """Simple MA crossover strategy"""
    
    def __init__(self, short_period: int = 10, long_period: int = 50):
        self.short_period = short_period
        self.long_period = long_period
    
    def analyze(self, market_data: dict[str, Any]) -> dict[str, Any]:
        # Get historical prices
        prices = market_data.get('price_history', [])
        if len(prices) < self.long_period:
            return {"signal": None, "reason": "Insufficient data"}
        
        short_ma = sum(prices[-self.short_period:]) / self.short_period
        long_ma = sum(prices[-self.long_period:]) / self.long_period
        
        return {
            "short_ma": short_ma,
            "long_ma": long_ma,
            "signal": "BUY" if short_ma > long_ma else "SELL"
        }
    
    def vote(self, analysis: dict[str, Any]) -> tuple[bool, str]:
        signal = analysis.get("signal")
        if signal == "BUY":
            return True, f"MA crossover: Short MA > Long MA"
        return False, f"No buy signal: {signal}"

class RSIStrategy(TradingStrategy):
    """RSI-based strategy"""
    
    def __init__(self, period: int = 14, oversold: int = 30, overbought: int = 70):
        self.period = period
        self.oversold = oversold
        self.overbought = overbought
    
    def analyze(self, market_data: dict[str, Any]) -> dict[str, Any]:
        # Calculate RSI
        # Implementation details...
        rsi = 45  # Placeholder
        
        return {
            "rsi": rsi,
            "signal": "BUY" if rsi < self.oversold else "SELL" if rsi > self.overbought else "HOLD"
        }
    
    def vote(self, analysis: dict[str, Any]) -> tuple[bool, str]:
        rsi = analysis.get("rsi", 50)
        if rsi < self.oversold:
            return True, f"RSI oversold: {rsi:.1f}"
        return False, f"RSI neutral: {rsi:.1f}"

class SwarmStrategyManager:
    """Manages multiple trading strategies"""
    
    def __init__(self):
        self.strategies: list[TradingStrategy] = []
    
    def add_strategy(self, strategy: TradingStrategy):
        self.strategies.append(strategy)
    
    def get_council_vote(self, market_data: dict[str, Any]) -> tuple[str, list[str], bool]:
        """Run all strategies and aggregate votes"""
        votes_yes = 0
        reasons = []
        
        for strategy in self.strategies:
            analysis = strategy.analyze(market_data)
            should_trade, reason = strategy.vote(analysis)
            
            if should_trade:
                votes_yes += 1
            
            vote_str = "YES" if should_trade else "NO"
            reasons.append(f"{strategy.__class__.__name__}: {vote_str} - {reason}")
        
        total = len(self.strategies)
        threshold = int(total * 0.8)  # 80% threshold
        approved = votes_yes >= threshold
        
        return f"{votes_yes}/{total}", reasons, approved
```

### Phase 3: Integration with Existing System

Update `main.py` to use swarm strategies:

```python
# In main.py, add new function:

def _swarm_strategy_council_vote(
    market_data: dict[str, Any],
    use_openai: bool = False,
    openai_api_key: str | None = None,
) -> tuple[str, list[str], bool]:
    """
    Enhanced council voting using multiple strategies.
    Combines traditional strategies with optional OpenAI.
    """
    from swarm_strategies import SwarmStrategyManager, MovingAverageStrategy, RSIStrategy
    
    manager = SwarmStrategyManager()
    
    # Add traditional strategies
    manager.add_strategy(MovingAverageStrategy(short_period=10, long_period=50))
    manager.add_strategy(RSIStrategy(period=14))
    # Add more strategies as needed
    
    # Get traditional votes
    votes, reasons, approved = manager.get_council_vote(market_data)
    
    # If OpenAI is enabled, add AI votes
    if use_openai and openai_api_key:
        ai_votes, ai_reasons, ai_approved = _openai_council_vote(
            market_data,
            openai_api_key=openai_api_key,
            model=SETTINGS.openai_model,
            ai_count=3,  # Add 3 AI agents to the council
        )
        
        # Combine results
        total_yes = int(votes.split('/')[0]) + int(ai_votes.split('/')[0])
        total_count = int(votes.split('/')[1]) + int(ai_votes.split('/')[1])
        combined_votes = f"{total_yes}/{total_count}"
        combined_reasons = reasons + ai_reasons
        combined_approved = total_yes >= int(total_count * 0.8)
        
        return combined_votes, combined_reasons, combined_approved
    
    return votes, reasons, approved
```

### Phase 4: Testing and Validation

1. **Unit Tests**:
```python
# File: test_strategies.py

import pytest
from swarm_strategies import MovingAverageStrategy

def test_ma_strategy_buy_signal():
    strategy = MovingAverageStrategy(short_period=3, long_period=5)
    
    # Price trending up
    market_data = {
        'price_history': [10, 11, 12, 13, 14, 15, 16]
    }
    
    analysis = strategy.analyze(market_data)
    should_trade, reason = strategy.vote(analysis)
    
    assert should_trade == True
    assert "crossover" in reason.lower()

def test_ma_strategy_sell_signal():
    strategy = MovingAverageStrategy(short_period=3, long_period=5)
    
    # Price trending down
    market_data = {
        'price_history': [16, 15, 14, 13, 12, 11, 10]
    }
    
    analysis = strategy.analyze(market_data)
    should_trade, reason = strategy.vote(analysis)
    
    assert should_trade == False
```

2. **Backtesting**:
   - Use historical data from Kraken/Alpaca
   - Compare strategy performance
   - Document win rates and risk metrics

3. **Paper Trading**:
   - Test in paper mode for 1-2 weeks
   - Monitor for bugs and unexpected behavior
   - Validate risk management works correctly

## Recommended Open-Source Strategies to Integrate

### 1. Momentum Strategies
- **Moving Average Crossover**: Simple but effective
- **MACD (Moving Average Convergence Divergence)**: Industry standard
- **Rate of Change (ROC)**: Captures momentum shifts

### 2. Mean Reversion Strategies
- **Bollinger Bands**: Identifies overbought/oversold conditions
- **RSI (Relative Strength Index)**: Popular oscillator
- **Stochastic Oscillator**: Good for range-bound markets

### 3. Volatility Strategies
- **ATR-based Stops**: Dynamic stop loss
- **Volatility Breakout**: Trades breakouts from consolidation
- **Keltner Channels**: Alternative to Bollinger Bands

### 4. Machine Learning
- **Random Forest**: Can be adapted from existing libraries
- **LSTM**: For sequence prediction (requires TensorFlow/PyTorch)
- **Reinforcement Learning**: Advanced but powerful (e.g., Stable Baselines3)

## Configuration

Add to `.env`:
```bash
# Swarm Strategy Configuration
SWARM_STRATEGY_MODE=hybrid  # Options: traditional, openai, hybrid
SWARM_USE_MA=true
SWARM_USE_RSI=true
SWARM_USE_MACD=true
SWARM_USE_ML=false  # Requires additional setup

# Strategy Parameters
MA_SHORT_PERIOD=10
MA_LONG_PERIOD=50
RSI_PERIOD=14
RSI_OVERSOLD=30
RSI_OVERBOUGHT=70
```

## Security Considerations

1. **Code Review**: Thoroughly review any open-source code before integration
2. **Sandboxing**: Test strategies in isolated environment first
3. **Rate Limiting**: Respect exchange API rate limits
4. **Error Handling**: Ensure strategies don't crash the bot
5. **Logging**: Log all strategy decisions for audit trail

## Performance Monitoring

Track these metrics for each strategy:
- Win Rate
- Average Return per Trade
- Maximum Drawdown
- Sharpe Ratio
- Total Trades Executed
- Strategy Uptime

## Future Enhancements

1. **Strategy Marketplace**: Allow users to enable/disable strategies
2. **Custom Strategy Upload**: Let users add their own Python strategies
3. **Strategy Backtesting UI**: Web interface for testing strategies
4. **Performance Dashboard**: Compare strategy performance over time
5. **Auto-tuning**: Machine learning to optimize strategy parameters

## Resources

- **Freqtrade Documentation**: https://www.freqtrade.io/en/stable/
- **QuantConnect**: https://www.quantconnect.com/docs (for strategy ideas)
- **Backtrader**: https://www.backtrader.com/ (Python backtesting framework)
- **TA-Lib**: https://github.com/mrjbq7/ta-lib (Technical analysis library)

## Conclusion

Integrating open-source swarm bot code can significantly enhance the Simple Trader application. The adapter pattern provides a clean way to incorporate existing strategies while maintaining our architecture. Start with simple, well-tested strategies and gradually add more sophisticated ones based on performance data.

**Remember**: Always test thoroughly in paper mode before enabling live trading!
