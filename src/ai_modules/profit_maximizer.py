"""
Profit Maximizer: Dynamic Capital Allocation
Allocates capital to best-performing strategies and assets.
"""
import logging
from typing import Dict, List, Any
from datetime import datetime

logger = logging.getLogger(__name__)


class ProfitMaximizer:
    """
    Dynamic capital allocation based on performance metrics.
    Reallocates capital to maximize overall returns.
    """
    
    def __init__(self, min_allocation_pct: float = 0.05, max_allocation_pct: float = 0.40):
        """
        Initialize profit maximizer.
        
        Args:
            min_allocation_pct: Minimum allocation percentage per asset (default 5%)
            max_allocation_pct: Maximum allocation percentage per asset (default 40%)
        """
        self.min_allocation_pct = min_allocation_pct
        self.max_allocation_pct = max_allocation_pct
        self.allocation_history = []
        
        logger.info("ProfitMaximizer initialized (min: %.1f%%, max: %.1f%%)",
                   min_allocation_pct * 100, max_allocation_pct * 100)

    def _normalize_allocations(self, allocations: Dict[str, float]) -> Dict[str, float]:
        """
        Normalize allocations to sum to 1.0 while respecting min/max constraints.
        
        Args:
            allocations: Dictionary of asset to allocation percentage
            
        Returns:
            Normalized allocations
        """
        if not allocations:
            return {}
        
        # Apply min/max constraints
        constrained = {}
        for asset, alloc in allocations.items():
            constrained[asset] = max(self.min_allocation_pct, 
                                    min(self.max_allocation_pct, alloc))
        
        # Normalize to sum to 1.0
        total = sum(constrained.values())
        if total > 0:
            normalized = {asset: alloc / total for asset, alloc in constrained.items()}
        else:
            # Equal distribution if all values are 0
            count = len(constrained)
            normalized = {asset: 1.0 / count for asset in constrained}
        
        return normalized

    def _calculate_sharpe_ratio(self, returns: List[float], risk_free_rate: float = 0.02) -> float:
        """
        Calculate Sharpe ratio for a series of returns.
        
        Args:
            returns: List of return percentages
            risk_free_rate: Annual risk-free rate (default 2%)
            
        Returns:
            Sharpe ratio
        """
        if not returns or len(returns) < 2:
            return 0.0
        
        # Calculate mean return and standard deviation
        mean_return = sum(returns) / len(returns)
        variance = sum((r - mean_return) ** 2 for r in returns) / len(returns)
        std_dev = variance ** 0.5
        
        # Avoid division by zero
        if std_dev == 0:
            return 0.0
        
        # Sharpe ratio = (mean return - risk free rate) / std dev
        sharpe = (mean_return - risk_free_rate) / std_dev
        return sharpe

    def allocate(self, bot_performance: Dict[str, Any]) -> Dict[str, Any]:
        """
        Reallocate capital to best-performing bots/assets.
        
        Args:
            bot_performance: Dictionary with performance metrics for each asset/bot
                Format: {
                    "asset_name": {
                        "returns": [list of returns],
                        "win_rate": float,
                        "total_return": float,
                        "max_drawdown": float
                    }
                }
            
        Returns:
            Dictionary with allocation recommendations
        """
        try:
            if not bot_performance:
                logger.warning("No performance data provided")
                return {
                    "allocation": {},
                    "message": "No performance data available"
                }
            
            logger.info("Calculating optimal allocation for %d assets", len(bot_performance))
            
            # Calculate scores for each asset
            scores = {}
            for asset, metrics in bot_performance.items():
                # Extract metrics with defaults
                returns = metrics.get("returns", [])
                win_rate = metrics.get("win_rate", 0.5)
                total_return = metrics.get("total_return", 0.0)
                max_drawdown = metrics.get("max_drawdown", 0.0)
                
                # Calculate Sharpe ratio
                sharpe = self._calculate_sharpe_ratio(returns)
                
                # Composite score (weighted combination)
                # Higher is better for all components
                score = (
                    0.30 * sharpe +           # Risk-adjusted returns
                    0.25 * total_return +     # Absolute returns
                    0.25 * win_rate +         # Win consistency
                    0.20 * (1 - abs(max_drawdown))  # Drawdown control
                )
                
                scores[asset] = max(0, score)  # No negative scores
                
                logger.debug("Asset %s: score=%.3f (sharpe=%.3f, return=%.3f, win_rate=%.3f, dd=%.3f)",
                           asset, score, sharpe, total_return, win_rate, max_drawdown)
            
            # Convert scores to allocations
            total_score = sum(scores.values())
            if total_score > 0:
                raw_allocations = {asset: score / total_score 
                                 for asset, score in scores.items()}
            else:
                # Equal allocation if all scores are 0
                count = len(scores)
                raw_allocations = {asset: 1.0 / count for asset in scores}
            
            # Normalize with constraints
            final_allocations = self._normalize_allocations(raw_allocations)
            
            # Create result
            result = {
                "allocation": final_allocations,
                "scores": scores,
                "timestamp": datetime.utcnow().isoformat(),
                "total_assets": len(bot_performance),
                "recommendations": []
            }
            
            # Add recommendations
            sorted_assets = sorted(final_allocations.items(), 
                                 key=lambda x: x[1], reverse=True)
            
            for asset, allocation in sorted_assets:
                if allocation >= self.max_allocation_pct:
                    result["recommendations"].append(
                        f"{asset}: Maximum allocation reached ({allocation*100:.1f}%)"
                    )
                elif allocation <= self.min_allocation_pct:
                    result["recommendations"].append(
                        f"{asset}: Minimum allocation ({allocation*100:.1f}%) - consider reducing"
                    )
                else:
                    result["recommendations"].append(
                        f"{asset}: Optimal allocation ({allocation*100:.1f}%)"
                    )
            
            # Save to history
            self.allocation_history.append(result)
            # Keep only last 20 allocations
            self.allocation_history = self.allocation_history[-20:]
            
            logger.info("Allocation complete: %s", 
                       {k: f"{v*100:.1f}%" for k, v in final_allocations.items()})
            
            return result
            
        except Exception as e:
            logger.error("Error calculating allocation: %s", e)
            return {
                "allocation": {},
                "error": str(e),
                "message": "Failed to calculate allocation"
            }

    def get_allocation_history(self, count: int = 5) -> List[Dict]:
        """
        Get recent allocation history.
        
        Args:
            count: Number of recent allocations to return
            
        Returns:
            List of recent allocation results
        """
        return self.allocation_history[-count:]

    def rebalance_needed(self, current_allocation: Dict[str, float], 
                        target_allocation: Dict[str, float], 
                        threshold: float = 0.05) -> bool:
        """
        Check if rebalancing is needed.
        
        Args:
            current_allocation: Current allocation percentages
            target_allocation: Target allocation percentages
            threshold: Rebalance if any asset differs by more than this (default 5%)
            
        Returns:
            True if rebalancing needed, False otherwise
        """
        for asset in target_allocation:
            current = current_allocation.get(asset, 0)
            target = target_allocation.get(asset, 0)
            
            if abs(current - target) > threshold:
                logger.info("Rebalancing needed for %s: current=%.1f%%, target=%.1f%%",
                           asset, current * 100, target * 100)
                return True
        
        logger.info("No rebalancing needed (threshold: %.1f%%)", threshold * 100)
        return False
