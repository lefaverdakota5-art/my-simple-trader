"""
News and Sentiment Feed Integration
Analyzes news sentiment to inform trading decisions.
"""
import logging
from typing import Optional
import re

logger = logging.getLogger(__name__)


class NewsSentiment:
    """
    News sentiment analyzer for trading decisions.
    Uses keyword-based sentiment analysis with future API integration capability.
    """
    
    def __init__(self):
        """Initialize sentiment analyzer with keyword lists."""
        # Positive sentiment keywords
        self.positive_keywords = {
            "bullish", "buy", "upgrade", "growth", "profit", "surge", "rally",
            "strong", "beat", "exceed", "positive", "gain", "rise", "soar",
            "breakthrough", "innovation", "partnership", "acquisition", "success"
        }
        
        # Negative sentiment keywords
        self.negative_keywords = {
            "bearish", "sell", "downgrade", "loss", "decline", "fall", "drop",
            "weak", "miss", "negative", "crash", "plunge", "concern", "risk",
            "warning", "lawsuit", "scandal", "fraud", "bankruptcy", "failure"
        }
        
        logger.info("NewsSentiment initialized with %d positive and %d negative keywords",
                   len(self.positive_keywords), len(self.negative_keywords))

    def _analyze_text(self, text: str) -> float:
        """
        Analyze sentiment from text using keyword matching.
        
        Args:
            text: Text to analyze
            
        Returns:
            Sentiment score from -1 (very negative) to 1 (very positive)
        """
        if not text:
            return 0.0
            
        # Convert to lowercase and split into words
        words = set(re.findall(r'\b\w+\b', text.lower()))
        
        # Count positive and negative keywords
        positive_count = len(words & self.positive_keywords)
        negative_count = len(words & self.negative_keywords)
        
        # Calculate sentiment score
        total_keywords = positive_count + negative_count
        if total_keywords == 0:
            return 0.0
            
        sentiment = (positive_count - negative_count) / total_keywords
        return max(-1.0, min(1.0, sentiment))

    def fetch(self, symbol: str, headlines: Optional[list] = None) -> float:
        """
        Fetch and analyze news/sentiment for a symbol.
        
        Args:
            symbol: Stock/crypto symbol (e.g., "AAPL", "BTC")
            headlines: Optional list of news headlines to analyze
            
        Returns:
            Sentiment score from -1 (very negative) to 1 (very positive)
        """
        try:
            logger.info("Fetching sentiment for symbol: %s", symbol)
            
            # If no headlines provided, return neutral sentiment
            if not headlines:
                logger.info("No headlines provided for %s, returning neutral sentiment", symbol)
                return 0.0
            
            # Analyze each headline and average the sentiment
            sentiments = []
            for headline in headlines:
                if isinstance(headline, str):
                    score = self._analyze_text(headline)
                    sentiments.append(score)
                    logger.debug("Headline sentiment: %.3f - %s", score, headline[:50])
            
            if not sentiments:
                return 0.0
                
            # Calculate average sentiment
            avg_sentiment = sum(sentiments) / len(sentiments)
            logger.info("Average sentiment for %s: %.3f (from %d headlines)", 
                       symbol, avg_sentiment, len(sentiments))
            
            return avg_sentiment
            
        except Exception as e:
            logger.error("Error fetching sentiment for %s: %s", symbol, e)
            return 0.0  # Return neutral on error

    def analyze_sentiment(self, text: str) -> dict:
        """
        Analyze sentiment from arbitrary text and return detailed results.
        
        Args:
            text: Text to analyze
            
        Returns:
            Dictionary with sentiment score and details
        """
        try:
            score = self._analyze_text(text)
            
            # Determine sentiment category
            if score > 0.3:
                category = "positive"
            elif score < -0.3:
                category = "negative"
            else:
                category = "neutral"
            
            return {
                "score": score,
                "category": category,
                "confidence": abs(score)
            }
            
        except Exception as e:
            logger.error("Error analyzing sentiment: %s", e)
            return {
                "score": 0.0,
                "category": "neutral",
                "confidence": 0.0,
                "error": str(e)
            }
