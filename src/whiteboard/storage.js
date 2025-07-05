/**
 * Storage management for drawing annotations
 */

/** Default shape data structure */
export const defaultShapesData = {
    rectangle: [],
    ellipse: [],
    line: [],
    arrow: [],
    pencil: [],
    highlighter: [],
    text: []
  };
  
  /** Persist shapesData */
  export function saveShapesData(shapesData) {
    localStorage.setItem('annotations', JSON.stringify(shapesData));
  }
  
  /** Load shapesData from localStorage */
  export function loadShapesData() {
    try {
      const saved = localStorage.getItem('annotations');
      if (saved) {
        const shapesData = JSON.parse(saved);
        // Ensure all shape types exist in case new types were added
        return Object.assign({...defaultShapesData}, shapesData);
      }
    } catch (error) {
      console.warn('Failed to load annotations from localStorage:', error);
    }
    // Return default if no saved data or corrupted
    return {...defaultShapesData};
  }
  
  /** Clear all annotations */
  export function clearAllShapesData() {
    return {...defaultShapesData};
  }