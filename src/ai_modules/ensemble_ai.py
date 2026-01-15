"""
Ensemble AI module: LSTM, Transformer, XGBoost, Sentiment Analysis
Combines multiple ML models for robust trading decisions.
"""
import logging
from typing import Dict, Any, Optional
import numpy as np

logger = logging.getLogger(__name__)


class EnsembleAI:
    """
    Ensemble AI for trading decisions using multiple models.
    Currently uses weighted voting from various indicators.
    """
    
    def __init__(self):
        """Initialize ensemble AI with model weights."""
        # Model weights for ensemble voting
        self.weights = {
            "price_momentum": 0.25,
            "volume_trend": 0.20,
            "volatility": 0.20,
            "sentiment": 0.20,
            "technical": 0.15
        }
        logger.info("EnsembleAI initialized with weights: %s", self.weights)

    def _analyze_price_momentum(self, market_data: Dict[str, Any]) -> float:
        """
        Analyze price momentum.
        Returns score between -1 (strong sell) and 1 (strong buy).
        """
        try:
            current_price = market_data.get("current_price", 0)
            open_price = market_data.get("open_price", 0)
            
            if open_price == 0:
                return 0.0
                
            pct_change = (current_price - open_price) / open_price
            # Normalize to -1 to 1 range (cap at ±10%)
            score = max(-1.0, min(1.0, pct_change * 10))
            return score
        except Exception as e:
            logger.error("Error analyzing price momentum: %s", e)
            return 0.0

    def _analyze_volume_trend(self, market_data: Dict[str, Any]) -> float:
        """
        Analyze volume trends.
        Returns score between -1 and 1.
        """
        try:
            volume = market_data.get("volume", 0)
            avg_volume = market_data.get("avg_volume", 0)
            
            if avg_volume == 0:
                return 0.0
                
            volume_ratio = volume / avg_volume
            # Higher volume during price increases is bullish
            score = min(1.0, (volume_ratio - 1.0) / 2.0)
            return score
        except Exception as e:
            logger.error("Error analyzing volume trend: %s", e)
            return 0.0

    def _analyze_volatility(self, market_data: Dict[str, Any]) -> float:
        """
        Analyze volatility - prefer lower volatility.
        Returns score between -1 (high volatility) and 1 (low volatility).
        """
        try:
            high = market_data.get("high", 0)
            low = market_data.get("low", 0)
            current = market_data.get("current_price", 0)
            
            if current == 0:
                return 0.0
                
            volatility_pct = (high - low) / current
            # Lower volatility is better (inverse relationship)
            score = max(-1.0, 1.0 - volatility_pct * 5)
            return score
        except Exception as e:
            logger.error("Error analyzing volatility: %s", e)
            return 0.0

    def _analyze_technical_indicators(self, market_data: Dict[str, Any]) -> float:
        """
        Basic technical analysis.
        Returns score between -1 and 1.
        """
        try:
            # Simple moving average comparison
            current = market_data.get("current_price", 0)
            sma_20 = market_data.get("sma_20", current)
            sma_50 = market_data.get("sma_50", current)
            
            if current == 0:
                return 0.0
            
            # Bullish: price > SMA20 > SMA50
            # Bearish: price < SMA20 < SMA50
            if current > sma_20 > sma_50:
                return 0.8
            elif current < sma_20 < sma_50:
                return -0.8
            elif current > sma_20:
                return 0.4
            elif current < sma_20:
                return -0.4
            else:
                return 0.0
        except Exception as e:
            logger.error("Error analyzing technical indicators: %s", e)
            return 0.0

    def predict(self, market_data: Dict[str, Any], news_sentiment: Optional[float] = None) -> Dict[str, Any]:
        """
        Combine predictions from all models for a final decision.
        
        Args:
            market_data: Dictionary with market data (price, volume, etc.)
            news_sentiment: Sentiment score from -1 to 1 (optional)
            
        Returns:
            Dictionary with individual scores and final decision
        """
        try:
            # Calculate individual model scores
            momentum_score = self._analyze_price_momentum(market_data)
            volume_score = self._analyze_volume_trend(market_data)
            volatility_score = self._analyze_volatility(market_data)
            technical_score = self._analyze_technical_indicators(market_data)
            sentiment_score = news_sentiment if news_sentiment is not None else 0.0
            
            # Weighted ensemble score
            final_score = (
                self.weights["price_momentum"] * momentum_score +
                self.weights["volume_trend"] * volume_score +
                self.weights["volatility"] * volatility_score +
                self.weights["technical"] * technical_score +
                self.weights["sentiment"] * sentiment_score
            )
            
            # Convert score to decision
            if final_score > 0.3:
                decision = "buy"
                confidence = min(1.0, final_score)
            elif final_score < -0.3:
                decision = "sell"
                confidence = min(1.0, abs(final_score))
            else:
                decision = "hold"
                confidence = 0.5
            
            result = {
                "price_momentum": momentum_score,
                "volume_trend": volume_score,
                "volatility": volatility_score,
                "technical": technical_score,
                "sentiment": sentiment_score,
                "final_score": final_score,
                "final_decision": decision,
                "confidence": confidence
            }
            
            logger.info("Ensemble prediction: %s (score: %.3f, confidence: %.3f)", 
                       decision, final_score, confidence)
            return result
            
        except Exception as e:
            logger.error("Error in ensemble prediction: %s", e)
            return {
                "price_momentum": 0,
                "volume_trend": 0,
                "volatility": 0,
                "technical": 0,
                "sentiment": 0,
                "final_score": 0,
                "final_decision": "hold",
                "confidence": 0,
                "error": str(e)
            }
