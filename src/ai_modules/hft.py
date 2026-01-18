"""
High-Frequency Trading (HFT) Logic
Implements rapid execution strategies with risk controls.
"""
import logging
import time
from typing import Dict, Any, Optional
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


class HighFrequencyTrader:
    """
    High-frequency trading module with rate limiting and risk controls.
    """
    
    def __init__(self, max_orders_per_second: int = 10, max_position_size: float = 1000.0):
        """
        Initialize HFT module.
        
        Args:
            max_orders_per_second: Maximum number of orders allowed per second
            max_position_size: Maximum position size in USD
        """
        self.max_orders_per_second = max_orders_per_second
        self.max_position_size = max_position_size
        self.order_timestamps = []
        self.total_positions = {}
        
        logger.info("HighFrequencyTrader initialized (max %d orders/sec, max position $%.2f)",
                   max_orders_per_second, max_position_size)

    def _check_rate_limit(self) -> bool:
        """
        Check if we're within rate limits.
        
        Returns:
            True if order can be placed, False otherwise
        """
        now = time.time()
        # Remove timestamps older than 1 second
        self.order_timestamps = [ts for ts in self.order_timestamps if now - ts < 1.0]
        
        # Check if we're at the limit
        if len(self.order_timestamps) >= self.max_orders_per_second:
            logger.warning("Rate limit reached: %d orders in last second", 
                         len(self.order_timestamps))
            return False
        
        return True

    def _check_position_limit(self, symbol: str, amount: float) -> bool:
        """
        Check if adding this position would exceed limits.
        
        Args:
            symbol: Trading symbol
            amount: Position amount in USD
            
        Returns:
            True if position is within limits, False otherwise
        """
        current_position = self.total_positions.get(symbol, 0.0)
        new_position = current_position + abs(amount)
        
        if new_position > self.max_position_size:
            logger.warning("Position limit would be exceeded for %s: %.2f + %.2f > %.2f",
                         symbol, current_position, abs(amount), self.max_position_size)
            return False
        
        return True

    def _validate_order(self, symbol: str, amount: float, side: str) -> Optional[str]:
        """
        Validate order parameters.
        
        Args:
            symbol: Trading symbol
            amount: Order amount
            side: Order side ("buy" or "sell")
            
        Returns:
            Error message if validation fails, None if valid
        """
        if not symbol or not isinstance(symbol, str):
            return "Invalid symbol"
        
        if amount <= 0:
            return "Amount must be positive"
        
        if side not in ("buy", "sell"):
            return "Side must be 'buy' or 'sell'"
        
        return None

    def execute(self, symbol: str, amount: float, side: str) -> Dict[str, Any]:
        """
        Execute a high-frequency trade with safety checks.
        
        Args:
            symbol: Trading symbol (e.g., "BTCUSD")
            amount: Order amount in USD
            side: Order side ("buy" or "sell")
            
        Returns:
            Dictionary with execution status and details
        """
        try:
            logger.info("HFT execute request: %s %s %.2f", side.upper(), symbol, amount)
            
            # Validate order parameters
            error = self._validate_order(symbol, amount, side)
            if error:
                logger.error("Order validation failed: %s", error)
                return {
                    "status": "rejected",
                    "reason": error,
                    "symbol": symbol,
                    "amount": amount,
                    "side": side
                }
            
            # Check rate limits
            if not self._check_rate_limit():
                return {
                    "status": "rejected",
                    "reason": "Rate limit exceeded",
                    "symbol": symbol,
                    "amount": amount,
                    "side": side,
                    "rate_limit": self.max_orders_per_second
                }
            
            # Check position limits
            position_delta = amount if side == "buy" else -amount
            if not self._check_position_limit(symbol, position_delta):
                return {
                    "status": "rejected",
                    "reason": "Position limit exceeded",
                    "symbol": symbol,
                    "amount": amount,
                    "side": side,
                    "current_position": self.total_positions.get(symbol, 0.0),
                    "max_position": self.max_position_size
                }
            
            # Record order timestamp
            self.order_timestamps.append(time.time())
            
            # Update position tracking
            current_pos = self.total_positions.get(symbol, 0.0)
            new_pos = current_pos + position_delta
            self.total_positions[symbol] = new_pos
            
            # Simulate execution (in production, this would call exchange API)
            execution_time = datetime.utcnow().isoformat()
            
            result = {
                "status": "executed",
                "symbol": symbol,
                "amount": amount,
                "side": side,
                "execution_time": execution_time,
                "position_after": new_pos,
                "orders_in_last_second": len(self.order_timestamps)
            }
            
            logger.info("HFT order executed successfully: %s %s %.2f @ %s", 
                       side.upper(), symbol, amount, execution_time)
            
            return result
            
        except Exception as e:
            logger.error("HFT execution error for %s: %s", symbol, e)
            return {
                "status": "error",
                "reason": str(e),
                "symbol": symbol,
                "amount": amount,
                "side": side
            }

    def get_position(self, symbol: str) -> float:
        """
        Get current position for a symbol.
        
        Args:
            symbol: Trading symbol
            
        Returns:
            Current position size in USD
        """
        return self.total_positions.get(symbol, 0.0)

    def reset_positions(self):
        """Reset all position tracking (for testing/admin purposes)."""
        logger.info("Resetting all HFT positions")
        self.total_positions = {}
        self.order_timestamps = []
