// Cache manager for trip and ticket reports
// Stores data and date filters with TTL-based expiration

class CacheManager {
  constructor() {
    this.CACHE_PREFIX = 'ticketingApp_cache_';
    this.DATE_RANGE_PREFIX = 'ticketingApp_dateRange_';
    this.TTL_MS = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Generate cache key from report type, user ID, and date range
   */
  getCacheKey(reportType, userId, fromDate, toDate) {
    return `${this.CACHE_PREFIX}${reportType}_${userId}_${fromDate}_${toDate}`;
  }

  /**
   * Generate date range key for persistence
   */
  getDateRangeKey(reportType, userId) {
    return `${this.DATE_RANGE_PREFIX}${reportType}_${userId}`;
  }

  /**
   * Store data in cache with TTL
   */
  set(cacheKey, data, ttl = this.TTL_MS) {
    try {
      const cacheEntry = {
        data,
        timestamp: Date.now(),
        expiryTime: Date.now() + ttl
      };
      localStorage.setItem(cacheKey, JSON.stringify(cacheEntry));
    } catch (error) {
      // Handle localStorage quota exceeded
      console.warn('Cache storage limit exceeded, clearing old entries', error);
      this.clearOldestEntries();
      try {
        localStorage.setItem(cacheKey, JSON.stringify({
          data,
          timestamp: Date.now(),
          expiryTime: Date.now() + ttl
        }));
      } catch (retryError) {
        console.error('Failed to cache data after cleanup:', retryError);
      }
    }
  }

  /**
   * Retrieve data from cache if not expired
   */
  get(cacheKey) {
    try {
      const cacheEntry = localStorage.getItem(cacheKey);
      if (!cacheEntry) {
        return null;
      }

      const parsed = JSON.parse(cacheEntry);
      
      // Check if cache has expired
      if (Date.now() > parsed.expiryTime) {
        localStorage.removeItem(cacheKey);
        return null;
      }

      return parsed.data;
    } catch (error) {
      console.error('Error retrieving from cache:', error);
      return null;
    }
  }

  /**
   * Store selected date range for a report
   */
  setDateRange(reportType, userId, fromDate, toDate) {
    try {
      const key = this.getDateRangeKey(reportType, userId);
      const dateRange = { fromDate, toDate, timestamp: Date.now() };
      localStorage.setItem(key, JSON.stringify(dateRange));
    } catch (error) {
      console.error('Error storing date range:', error);
    }
  }

  /**
   * Retrieve stored date range
   */
  getDateRange(reportType, userId) {
    try {
      const key = this.getDateRangeKey(reportType, userId);
      const stored = localStorage.getItem(key);
      if (!stored) {
        return null;
      }
      return JSON.parse(stored);
    } catch (error) {
      console.error('Error retrieving date range:', error);
      return null;
    }
  }

  /**
   * Invalidate a specific cache entry
   */
  invalidate(cacheKey) {
    try {
      localStorage.removeItem(cacheKey);
    } catch (error) {
      console.error('Error invalidating cache:', error);
    }
  }

  /**
   * Clear ALL cache entries (called on logout for security)
   */
  invalidateAll() {
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith(this.CACHE_PREFIX) || key.startsWith(this.DATE_RANGE_PREFIX))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
    } catch (error) {
      console.error('Error clearing all cache:', error);
    }
  }

  /**
   * Clear oldest cache entries when quota is exceeded
   */
  clearOldestEntries() {
    try {
      const entries = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.CACHE_PREFIX)) {
          const item = localStorage.getItem(key);
          try {
            const parsed = JSON.parse(item);
            entries.push({ key, timestamp: parsed.timestamp });
          } catch (e) {
            localStorage.removeItem(key); // Remove corrupted entries
          }
        }
      }
      
      // Sort by timestamp and remove oldest 25%
      entries.sort((a, b) => a.timestamp - b.timestamp);
      const removeCount = Math.ceil(entries.length * 0.25);
      for (let i = 0; i < removeCount; i++) {
        localStorage.removeItem(entries[i].key);
      }
    } catch (error) {
      console.error('Error clearing oldest entries:', error);
    }
  }
}

export default new CacheManager();
