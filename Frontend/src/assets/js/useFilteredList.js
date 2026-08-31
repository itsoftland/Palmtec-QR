import { useState, useMemo } from 'react';

/**
 * Custom hook for filtering a list based on search term
 * @param {Array} items - The list of items to filter
 * @param {Array<string>} searchFields - Field names to search across (e.g., ['name', 'code'])
 * @returns {Object} { filteredItems, searchTerm, setSearchTerm, resetSearch }
 */
export const useFilteredList = (items = [], searchFields = []) => {
  const [searchTerm, setSearchTerm] = useState('');

  // Filter items based on search term
  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) {
      return items;
    }

    const lowerSearchTerm = searchTerm.toLowerCase();

    return items.filter((item) => {
      // Check if any of the specified fields match the search term
      return searchFields.some((field) => {
        const value = item[field];
        if (value === null || value === undefined) {
          return false;
        }
        return String(value).toLowerCase().includes(lowerSearchTerm);
      });
    });
  }, [items, searchTerm, searchFields]);

  const resetSearch = () => {
    setSearchTerm('');
  };

  return {
    filteredItems,
    searchTerm,
    setSearchTerm,
    resetSearch,
  };
};
