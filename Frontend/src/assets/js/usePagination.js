import { useState } from 'react';

/**
 * usePagination
 *
 * Handles all pagination math in one place.
 * Used by: BusTypeListing, StageListing, VehicleListing, CrewAssignmentListing
 *
 * @param {Array}  items        - The full filtered list to paginate
 * @param {number} itemsPerPage - How many rows per page (default: 10)
 *
 * Returns:
 *   currentItems  - The slice of items to show on the current page
 *   currentPage   - Active page number
 *   totalPages    - Total number of pages
 *   setCurrentPage
 *   indexOfFirstItem - Used in the "Showing X to Y" label
 *   indexOfLastItem  - Used in the "Showing X to Y" label
 *   getPageNumbers   - Returns array of up to 3 page numbers to render as buttons
 */
export function usePagination(items, itemsPerPage = 10) {
  const [currentPage, setCurrentPage] = useState(1);

  const indexOfLastItem  = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems     = items.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages       = Math.ceil(items.length / itemsPerPage);

  // Shows current page ± 1, clamped to valid range, max 3 buttons
  const getPageNumbers = () => {
    let startPage = Math.max(1, currentPage - 1);
    let endPage   = Math.min(totalPages, startPage + 2);
    if (endPage - startPage < 2) {
      startPage = Math.max(1, endPage - 2);
    }
    const pages = [];
    for (let i = startPage; i <= endPage; i++) pages.push(i);
    return pages;
  };

  return {
    currentItems,
    currentPage,
    totalPages,
    setCurrentPage,
    indexOfFirstItem,
    indexOfLastItem,
    getPageNumbers,
  };
}
