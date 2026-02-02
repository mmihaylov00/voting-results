/**
 * Common utility functions used across the application
 */

/**
 * Format activity percentage (0-1) to string with 2 decimal places
 */
export function formatActivity(percent: number): string {
  const value = percent * 100;
  return Math.min(100, Math.max(0, value)).toFixed(2);
}

/**
 * Generate Google Maps URL for a location
 */
export function getGoogleMapsUrl(cityName: string, sectionName: string): string {
  const isCity = sectionName.startsWith('Общо за');
  const query = encodeURIComponent(isCity ? cityName : `${cityName} ${sectionName}`);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

/**
 * Copy text to clipboard
 * Returns a promise that resolves to true if successful, false otherwise
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.error('Failed to copy to clipboard', err);
      return false;
    }
  } else {
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.select();
    try {
      const success = document.execCommand('copy');
      document.body.removeChild(textArea);
      return success;
    } catch (err) {
      console.error('Fallback: Failed to copy to clipboard', err);
      document.body.removeChild(textArea);
      return false;
    }
  }
}

/**
 * Extract keywords from party name for matching across elections
 */
export function getPartyKeywords(partyName: string): string[] {
  const upperName = partyName.toUpperCase();
  // Normalize common variations
  if (upperName.includes('ПРОДЪЛЖАВАМЕ') || upperName.includes('ПП-ДБ')) {
    return ['ПРОДЪЛЖАВАМЕ', 'ПП-ДБ'];
  }
  // Extract main keywords (first significant words, excluding common prefixes)
  const words = upperName.split(/\s+/).filter(w => w.length > 2);
  return words.slice(0, 3); // Take first 3 significant words
}

/**
 * Find party ID in election data by matching name keywords
 */
export function findPartyByKeywords(
  keywords: string[], 
  parties: { [id: string]: string }
): string | null {
  for (const [pid, name] of Object.entries(parties)) {
    const upperName = name.toUpperCase();
    // Check if all keywords match
    if (keywords.every(keyword => upperName.includes(keyword))) {
      return pid;
    }
  }
  // Fallback: try matching any keyword
  for (const [pid, name] of Object.entries(parties)) {
    const upperName = name.toUpperCase();
    if (keywords.some(keyword => upperName.includes(keyword))) {
      return pid;
    }
  }
  return null;
}
