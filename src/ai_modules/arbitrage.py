"""
Auto-Arbitrage Between Exchanges
Detects and executes arbitrage opportunities across multiple exchanges.
"""
import logging
from typing import Dict, Optional, List, Tuple

logger = logging.getLogger(__name__)


class ArbitrageEngine:
    """
    Arbitrage detection and execution engine.
    Finds price differences across exchanges and executes profitable trades.
    """
    
    def __init__(self, min_profit_threshold: float = 0.01, transaction_fee: float = 0.002):
        """
        Initialize arbitrage engine.
        
        Args:
            min_profit_threshold: Minimum profit percentage to trigger arbitrage (default 1%)
            transaction_fee: Estimated transaction fee per trade (default 0.2%)
        """
        self.min_profit_threshold = min_profit_threshold
        self.transaction_fee = transaction_fee
        self.last_opportunities = []
        
        logger.info("ArbitrageEngine initialized (min profit: %.2f%%, fee: %.2f%%)",
                   min_profit_threshold * 100, transaction_fee * 100)

    def _calculate_profit(self, buy_price: float, sell_price: float, amount: float = 1.0) -> Dict:
        """
        Calculate potential arbitrage profit.
        
        Args:
            buy_price: Price to buy at
            sell_price: Price to sell at
            amount: Amount to trade
            
        Returns:
            Dictionary with profit details
        """
        # Calculate gross profit
        gross_profit = (sell_price - buy_price) * amount
        gross_profit_pct = (sell_price - buy_price) / buy_price
        
        # Calculate fees (buy + sell)
        total_fees = (buy_price + sell_price) * amount * self.transaction_fee
        
        # Net profit
        net_profit = gross_profit - total_fees
        net_profit_pct = net_profit / (buy_price * amount)
        
        return {
            "gross_profit": gross_profit,
            "gross_profit_pct": gross_profit_pct,
            "fees": total_fees,
            "net_profit": net_profit,
            "net_profit_pct": net_profit_pct,
            "is_profitable": net_profit > 0 and net_profit_pct >= self.min_profit_threshold
        }

    def find_opportunity(self, prices: Dict[str, float], amount: float = 1.0) -> Optional[Dict]:
        """
        Detect arbitrage opportunities across exchanges.
        
        Args:
            prices: Dictionary of exchange names to prices (e.g., {"kraken": 100, "binance": 101})
            amount: Amount to trade (default 1.0)
            
        Returns:
            Arbitrage opportunity details if found, None otherwise
        """
        try:
            if not prices or len(prices) < 2:
                logger.debug("Not enough exchanges to check arbitrage")
                return None
            
            # Find min and max prices
            min_exchange = min(prices.items(), key=lambda x: x[1])
            max_exchange = max(prices.items(), key=lambda x: x[1])
            
            buy_exchange, buy_price = min_exchange
            sell_exchange, sell_price = max_exchange
            
            # Calculate profit
            profit_details = self._calculate_profit(buy_price, sell_price, amount)
            
            if profit_details["is_profitable"]:
                opportunity = {
                    "buy_exchange": buy_exchange,
                    "buy_price": buy_price,
                    "sell_exchange": sell_exchange,
                    "sell_price": sell_price,
                    "amount": amount,
                    **profit_details
                }
                
                logger.info("Arbitrage opportunity found: Buy %s @ %.2f, Sell %s @ %.2f (net profit: %.2f%%)",
                           buy_exchange, buy_price, sell_exchange, sell_price, 
                           profit_details["net_profit_pct"] * 100)
                
                self.last_opportunities.append(opportunity)
                # Keep only last 10 opportunities
                self.last_opportunities = self.last_opportunities[-10:]
                
                return opportunity
            else:
                logger.debug("No profitable arbitrage: Buy %s @ %.2f, Sell %s @ %.2f (profit: %.2f%%)",
                           buy_exchange, buy_price, sell_exchange, sell_price,
                           profit_details["net_profit_pct"] * 100)
                return None
                
        except Exception as e:
            logger.error("Error finding arbitrage opportunity: %s", e)
            return None

    def execute(self, opportunity: Dict) -> Dict:
        """
        Execute arbitrage trade.
        
        Args:
            opportunity: Arbitrage opportunity details from find_opportunity()
            
        Returns:
            Execution status and details
        """
        try:
            if not opportunity:
                return {
                    "status": "rejected",
                    "reason": "No opportunity provided"
                }
            
            buy_exchange = opportunity.get("buy_exchange")
            sell_exchange = opportunity.get("sell_exchange")
            amount = opportunity.get("amount", 0)
            net_profit = opportunity.get("net_profit", 0)
            
            # Validation
            if not buy_exchange or not sell_exchange:
                return {
                    "status": "rejected",
                    "reason": "Invalid exchange information"
                }
            
            if amount <= 0:
                return {
                    "status": "rejected",
                    "reason": "Invalid amount"
                }
            
            # In production, this would:
            # 1. Place buy order on buy_exchange
            # 2. Wait for fill
            # 3. Place sell order on sell_exchange
            # 4. Wait for fill
            # 5. Handle errors and partial fills
            
            logger.info("Executing arbitrage: Buy %.2f on %s, Sell on %s (expected profit: $%.2f)",
                       amount, buy_exchange, sell_exchange, net_profit)
            
            result = {
                "status": "executed",
                "buy_exchange": buy_exchange,
                "buy_price": opportunity.get("buy_price"),
                "sell_exchange": sell_exchange,
                "sell_price": opportunity.get("sell_price"),
                "amount": amount,
                "expected_profit": net_profit,
                "message": "Arbitrage executed (simulated)"
            }
            
            return result
            
        except Exception as e:
            logger.error("Error executing arbitrage: %s", e)
            return {
                "status": "error",
                "reason": str(e),
                "opportunity": opportunity
            }

    def get_statistics(self) -> Dict:
        """
        Get arbitrage statistics.
        
        Returns:
            Dictionary with statistics about recent opportunities
        """
        if not self.last_opportunities:
            return {
                "total_opportunities": 0,
                "avg_profit_pct": 0,
                "max_profit_pct": 0,
                "min_profit_pct": 0
            }
        
        profits = [opp["net_profit_pct"] for opp in self.last_opportunities]
        
        return {
            "total_opportunities": len(self.last_opportunities),
            "avg_profit_pct": sum(profits) / len(profits),
            "max_profit_pct": max(profits),
            "min_profit_pct": min(profits),
            "last_opportunity": self.last_opportunities[-1]
        }
