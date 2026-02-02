# Code Optimization Tasks - Reducing Duplications

This document outlines tasks for creating reusable components and utilities to reduce code duplication across the project.

## 1. Base Modal Component

**Priority: High**

**Duplication Found:**
- All modals (candidate-detail-modal, section-detail-modal, protocol-error-modal, export-csv-modal) share:
  - Fixed overlay with backdrop blur
  - Close button with X icon (SVG)
  - Escape key handling via host binding
  - Similar styling classes (`fixed inset-0`, `bg-background/80 backdrop-blur-sm`, etc.)
  - Modal container structure

**Task:**
Create a reusable `BaseModalComponent` that:
- Provides the modal overlay structure
- Handles escape key events
- Provides close button with consistent styling
- Accepts content projection for modal body
- Supports configurable max-width, title, and footer
- Emits close events

**Files to Create:**
- `src/app/components/ui/base-modal/base-modal.ts`
- `src/app/components/ui/base-modal/base-modal.html`
- `src/app/components/ui/base-modal/base-modal.scss` (if needed)

**Files to Refactor:**
- `src/app/components/election-detail/modals/candidate-detail-modal/candidate-detail-modal.ts`
- `src/app/components/election-detail/modals/candidate-detail-modal/candidate-detail-modal.html`
- `src/app/components/election-detail/modals/section-detail-modal/section-detail-modal.ts`
- `src/app/components/election-detail/modals/section-detail-modal/section-detail-modal.html`
- `src/app/components/election-detail/modals/protocol-error-modal/protocol-error-modal.ts`
- `src/app/components/election-detail/modals/protocol-error-modal/protocol-error-modal.html`
- `src/app/components/election-detail/modals/export-csv-modal/export-csv-modal.ts`
- `src/app/components/election-detail/modals/export-csv-modal/export-csv-modal.html`

---

## 2. Sortable Table Header Component

**Priority: High**

**Duplication Found:**
- Sortable table headers appear in:
  - `election-detail.html` (multiple columns)
  - `section-detail-modal.html` (parties and candidates tables)
  - `protocol-error-modal.html` (multiple columns)
- Each header has:
  - Click handler for sorting
  - Sort indicator (↑/↓) when active
  - Inactive sort icon (SVG)
  - Similar styling classes
  - Similar structure with flex layout

**Task:**
Create a reusable `SortableTableHeaderComponent` that:
- Accepts column key, label, current sort column, and sort direction
- Handles click events and emits sort change
- Displays appropriate sort indicator
- Supports text alignment (left/right)
- Provides consistent styling

**Files to Create:**
- `src/app/components/ui/sortable-table-header/sortable-table-header.ts`
- `src/app/components/ui/sortable-table-header/sortable-table-header.html`

**Files to Refactor:**
- `src/app/components/election-detail/election-detail.html`
- `src/app/components/election-detail/modals/section-detail-modal/section-detail-modal.html`
- `src/app/components/election-detail/modals/protocol-error-modal/protocol-error-modal.html`

---

## 3. Risk Badge Component

**Priority: High**

**Duplication Found:**
- Risk indicators are displayed in multiple places with identical styling:
  - `candidate-detail-modal.html` (header and table cells)
  - `election-detail.html` (candidate table)
  - `section-detail-modal.html` (risk analysis section)
- Each instance has:
  - Conditional classes for severity (high/medium/low)
  - Color coding: red (high), yellow (medium), blue (low)
  - Dark mode variants
  - Tooltip with risk message
  - Similar badge structure

**Task:**
Create a reusable `RiskBadgeComponent` that:
- Accepts risk indicator object (code, severity, message)
- Applies appropriate styling based on severity
- Supports different sizes (small for table cells, medium for headers)
- Handles tooltip display
- Supports both compact (code only) and full (code + message) display modes

**Files to Create:**
- `src/app/components/ui/risk-badge/risk-badge.ts`
- `src/app/components/ui/risk-badge/risk-badge.html`
- `src/app/components/ui/risk-badge/risk-badge.scss` (if needed)

**Files to Refactor:**
- `src/app/components/election-detail/modals/candidate-detail-modal/candidate-detail-modal.html`
- `src/app/components/election-detail/election-detail.html`
- `src/app/components/election-detail/modals/section-detail-modal/section-detail-modal.html`

---

## 4. Table Sorting Service/Utility

**Priority: Medium**

**Duplication Found:**
- Sorting logic is duplicated across multiple components:
  - `election-detail.ts`: `sortSections()`, `sortCandidates()`
  - `section-detail-modal.ts`: `sortParties()`, `sortCandidates()`
  - `protocol-error-modal.ts`: `toggleSort()`, `sortedSections` computed
- Each has similar patterns:
  - Sort column tracking
  - Sort direction (asc/desc) tracking
  - Toggle logic
  - String vs number comparison
  - Locale-aware string sorting

**Task:**
Create a reusable `TableSortService` or utility function that:
- Handles generic sorting for any array of objects
- Supports string and number types
- Provides locale-aware string comparison
- Manages sort state (column, direction)
- Returns sorted array

**Files to Create:**
- `src/app/utils/table-sort.util.ts` (or `src/app/services/table-sort.service.ts`)

**Files to Refactor:**
- `src/app/components/election-detail/election-detail.ts`
- `src/app/components/election-detail/modals/section-detail-modal/section-detail-modal.ts`
- `src/app/components/election-detail/modals/protocol-error-modal/protocol-error-modal.ts`

---

## 5. Utility Functions Module

**Priority: Medium**

**Duplication Found:**
- `formatActivity()` - duplicated in 5+ components
- `getGoogleMapsUrl()` - duplicated in 3 components
- `copyToClipboard()` and `markAsCopied()` - duplicated in 2 components
- `getPartyKeywords()` and `findPartyByKeywords()` - duplicated in 2 components

**Task:**
Create a centralized utilities module with:
- `formatActivity(percent: number): string` - format activity percentage
- `getGoogleMapsUrl(cityName: string, sectionName: string): string` - generate Google Maps URL
- `copyToClipboard(text: string): Promise<boolean>` - copy text to clipboard
- `getPartyKeywords(partyName: string): string[]` - extract party keywords
- `findPartyByKeywords(keywords: string[], parties: { [id: string]: string }): string | null` - find party by keywords

**Files to Create/Update:**
- `src/app/utils/common.utils.ts` (or extend existing utils)

**Files to Refactor:**
- `src/app/components/election-detail/election-detail.ts`
- `src/app/components/election-detail/modals/section-detail-modal/section-detail-modal.ts`
- `src/app/components/election-detail/modals/protocol-error-modal/protocol-error-modal.ts`
- `src/app/components/election-detail/modals/export-csv-modal/export-csv-modal.ts`
- `src/app/components/election-list/election-list.ts`
- `src/app/components/region-list/region-list.ts`

---

## 6. Chart Configuration Service

**Priority: Medium**

**Duplication Found:**
- Highcharts chart configuration is duplicated across:
  - `election-detail.ts`: `updateChartOptions()`, `updateCandidateCharts()`
  - `section-detail-modal.ts`: `updateChartOptions()`, `updateHistoricalCharts()`, `updateHistoricalCandidateCharts()`
  - `election-list.ts`: `updateHistoricalCharts()`
  - `region-list.ts`: `updateCharts()`
- Common patterns:
  - Theme-aware text color (dark/light mode)
  - Similar chart types (pie, column, line)
  - Consistent color palettes
  - Similar tooltip configurations
  - Similar legend configurations

**Task:**
Create a `ChartConfigService` that:
- Provides base chart options with theme support
- Offers factory methods for common chart types (pie, column, line)
- Manages color palettes consistently
- Provides helper methods for theme-aware styling
- Reduces boilerplate in chart configuration

**Files to Create:**
- `src/app/services/chart-config.service.ts`

**Files to Refactor:**
- `src/app/components/election-detail/election-detail.ts`
- `src/app/components/election-detail/modals/section-detail-modal/section-detail-modal.ts`
- `src/app/components/election-list/election-list.ts`
- `src/app/components/region-list/region-list.ts`

---

## 7. Party Selection Logic Service

**Priority: Low**

**Duplication Found:**
- Default party selection logic based on keywords is duplicated in:
  - `election-detail.ts`
  - `election-list.ts`
  - `region-list.ts`
- Each component has:
  - `DEFAULT_KEYWORDS` constant
  - Logic to filter parties by keywords
  - Logic to create default selection Set

**Task:**
Create a `PartySelectionService` or utility that:
- Centralizes `DEFAULT_KEYWORDS`
- Provides method to get default selected party IDs
- Can be reused across components

**Files to Create:**
- `src/app/utils/party-selection.util.ts` (or `src/app/services/party-selection.service.ts`)

**Files to Refactor:**
- `src/app/components/election-detail/election-detail.ts`
- `src/app/components/election-list/election-list.ts`
- `src/app/components/region-list/region-list.ts`

---

## 8. Historical Chart Data Processing Service

**Priority: Low**

**Duplication Found:**
- Historical chart data processing logic is similar in:
  - `section-detail-modal.ts`: `updateHistoricalCharts()`, `updateHistoricalCandidateCharts()`
  - `election-list.ts`: `updateHistoricalCharts()`
- Common patterns:
  - Date sorting
  - Party keyword matching across elections
  - Data aggregation by date
  - Series building for multiple parties

**Task:**
Create a `HistoricalChartService` that:
- Handles party matching across different election dates
- Aggregates historical data
- Builds chart series for historical trends
- Reduces duplication in historical chart logic

**Files to Create:**
- `src/app/services/historical-chart.service.ts`

**Files to Refactor:**
- `src/app/components/election-detail/modals/section-detail-modal/section-detail-modal.ts`
- `src/app/components/election-list/election-list.ts`

---

## 9. Party Filter Button and Dropdown Component

**Priority: High**

**Duplication Found:**
- Party filter dropdown is implemented in multiple places:
  - `party-filter` component (reusable, but has inline implementations)
  - `election-list.html` - inline party filter dropdown for historical charts
  - `region-list.html` - inline party filter dropdown for charts
- Each implementation has:
  - Button with filter icon
  - Badge showing selected count
  - Dropdown with checkboxes
  - Click outside to close logic
  - Similar styling and structure

**Task:**
Enhance the existing `PartyFilterComponent` or create a more generic `FilterDropdownComponent` that:
- Can be used for party filtering in all contexts
- Supports optional vote counts display
- Handles dropdown positioning and closing
- Provides consistent styling across all uses
- Can be easily reused in election-list and region-list

**Files to Update/Create:**
- `src/app/components/election-detail/party-filter/party-filter.ts` (enhance existing)
- `src/app/components/election-detail/party-filter/party-filter.html` (enhance existing)
- OR create `src/app/components/ui/filter-dropdown/filter-dropdown.ts` (generic version)

**Files to Refactor:**
- `src/app/components/election-list/election-list.html`
- `src/app/components/election-list/election-list.ts`
- `src/app/components/region-list/region-list.html`
- `src/app/components/region-list/region-list.ts`

---

## 10. Comparison Operator Input Component (≤/≥)

**Priority: High**

**Duplication Found:**
- The activity threshold filter with operator toggle appears in:
  - `section-filters.html` - activity threshold with ≤/≥ toggle
  - `election-detail.html` - candidate preference filter with ≤/≥ toggle
- Each implementation has:
  - Toggle button for operator (≤/≥)
  - Number input field
  - Percentage suffix
  - Similar positioning and styling
  - Tooltip explaining the operator

**Task:**
Create a reusable `ComparisonOperatorInputComponent` that:
- Accepts operator type (lte/gte) and value
- Provides toggle button for switching operators
- Handles number input with optional suffix (%, etc.)
- Supports min/max/step attributes
- Emits operator and value changes
- Provides consistent styling and tooltips

**Files to Create:**
- `src/app/components/ui/comparison-operator-input/comparison-operator-input.ts`
- `src/app/components/ui/comparison-operator-input/comparison-operator-input.html`

**Files to Refactor:**
- `src/app/components/election-detail/section-filters/section-filters.html`
- `src/app/components/election-detail/section-filters/section-filters.ts`
- `src/app/components/election-detail/election-detail.html`
- `src/app/components/election-detail/election-detail.ts`

---

## 11. Election/Region Card Component

**Priority: Medium**

**Duplication Found:**
- Card components for elections and regions share similar structure:
  - `election-list.html` - election cards
  - `region-list.html` - region cards
- Both have:
  - Card header with title and description
  - Top parties list with formatting
  - Statistics (activity, voted count)
  - Action button (router link)
  - Similar hover effects and styling
  - Loading state handling

**Task:**
Create a reusable `DataCardComponent` that:
- Accepts title, description, and data object
- Displays top parties list with consistent formatting
- Shows statistics in a consistent format
- Supports action button with router link
- Handles loading states
- Provides consistent hover effects and styling
- Can be customized for different data types

**Files to Create:**
- `src/app/components/ui/data-card/data-card.ts`
- `src/app/components/ui/data-card/data-card.html`
- `src/app/components/ui/data-card/data-card.scss` (if needed)

**Files to Refactor:**
- `src/app/components/election-list/election-list.html`
- `src/app/components/region-list/region-list.html`

---

## 12. Statistics Card Component

**Priority: Medium**

**Duplication Found:**
- Statistics cards appear in multiple places with identical structure:
  - `election-detail.html` - stat cards for activity, electors, votes, etc.
  - `region-list.html` - stat cards for activity, electors, votes, etc.
  - `section-detail-modal.html` - section statistics card
- Each card has:
  - Header with label (uppercase, tracking-wider)
  - Content with value (H4 typography)
  - Optional tooltip with comparisons
  - Consistent styling (border-primary/20, bg-primary/5)
  - Dark mode support

**Task:**
Create a reusable `StatCardComponent` that:
- Accepts label, value, and optional tooltip data
- Supports different value types (number, percentage, custom)
- Handles tooltip with comparison data
- Provides consistent styling
- Supports dark mode
- Can display simple values or complex content (like "votes by type")

**Files to Create:**
- `src/app/components/ui/stat-card/stat-card.ts`
- `src/app/components/ui/stat-card/stat-card.html`
- `src/app/components/ui/stat-card/stat-card.scss` (if needed)

**Files to Refactor:**
- `src/app/components/election-detail/election-detail.html`
- `src/app/components/region-list/region-list.html`
- `src/app/components/election-detail/modals/section-detail-modal/section-detail-modal.html`

---

## 13. Column Filter Dropdown Component

**Priority: Medium**

**Duplication Found:**
- Column visibility filter appears in:
  - `election-detail.html` - column filter for sections/candidates tables
  - `export-csv-modal.html` - column selection for CSV export
- Both have:
  - Button with icon to toggle dropdown
  - Dropdown with checkboxes for each column
  - Click outside to close logic
  - Similar styling and structure
  - Row count display (in election-detail)

**Task:**
Create a reusable `ColumnFilterComponent` that:
- Accepts array of columns with id and label
- Manages selected column IDs
- Provides dropdown with checkboxes
- Handles click outside to close
- Emits selection changes
- Supports optional row count display
- Provides consistent styling

**Files to Create:**
- `src/app/components/ui/column-filter/column-filter.ts`
- `src/app/components/ui/column-filter/column-filter.html`

**Files to Refactor:**
- `src/app/components/election-detail/election-detail.html`
- `src/app/components/election-detail/election-detail.ts`
- `src/app/components/election-detail/modals/export-csv-modal/export-csv-modal.html`
- `src/app/components/election-detail/modals/export-csv-modal/export-csv-modal.ts`

---

## 14. Risk Filter Dropdown Component

**Priority: Medium**

**Duplication Found:**
- Risk filter dropdown appears in:
  - `section-filters.html` - risk filter with type (any/none) and categories
  - `election-detail.html` - candidate risk filter (similar structure)
- Both have:
  - Button with label showing current selection
  - Dropdown with radio buttons for type (any/none/all)
  - Checkboxes for risk categories (R1, R2, R3, etc.)
  - Clear filter option
  - Similar styling and structure
  - Destructive color scheme

**Task:**
Create a reusable `RiskFilterComponent` that:
- Handles risk filter type (any/none/null)
- Manages selected risk categories
- Provides dropdown with radio buttons and checkboxes
- Supports clear filter functionality
- Emits filter changes
- Provides consistent styling with destructive theme
- Can be used for both section and candidate risk filtering

**Files to Create:**
- `src/app/components/ui/risk-filter/risk-filter.ts`
- `src/app/components/ui/risk-filter/risk-filter.html`

**Files to Refactor:**
- `src/app/components/election-detail/section-filters/section-filters.html`
- `src/app/components/election-detail/section-filters/section-filters.ts`
- `src/app/components/election-detail/election-detail.html`
- `src/app/components/election-detail/election-detail.ts`

---

## 15. Risk Analysis Summary Component

**Priority: Medium**

**Duplication Found:**
- Risk analysis summary section appears in:
  - `section-detail-modal.html` - risk analysis card with indicators and unique risks
- The structure includes:
  - Warning icon and header with risk score
  - List of risk indicators with severity badges
  - Display of unique risks
  - Destructive color scheme
  - Similar formatting for risk codes and messages

**Task:**
Create a reusable `RiskAnalysisSummaryComponent` that:
- Accepts risk score, risk indicators, and unique risks
- Displays risk indicators with severity-based styling
- Shows unique risks if present
- Provides consistent warning styling
- Can be reused in other contexts where risk summary is needed

**Files to Create:**
- `src/app/components/ui/risk-analysis-summary/risk-analysis-summary.ts`
- `src/app/components/ui/risk-analysis-summary/risk-analysis-summary.html`
- `src/app/components/ui/risk-analysis-summary/risk-analysis-summary.scss` (if needed)

**Files to Refactor:**
- `src/app/components/election-detail/modals/section-detail-modal/section-detail-modal.html`
- `src/app/components/election-detail/modals/section-detail-modal/section-detail-modal.ts`

---

## 16. Search Input with Icon Component

**Priority: Low**

**Duplication Found:**
- Search input fields appear in multiple places:
  - `section-filters.html` - search input for sections
  - `election-detail.html` - search input for candidates
  - `region-list.html` - search input with icon for regions
- The region-list version has:
  - Search icon on the left
  - Input field with placeholder
  - Similar styling classes
  - Filter application on change

**Task:**
Create a reusable `SearchInputComponent` that:
- Provides search icon (optional)
- Handles input with debouncing (optional)
- Emits search term changes
- Supports placeholder customization
- Provides consistent styling
- Can be used across all search contexts

**Files to Create:**
- `src/app/components/ui/search-input/search-input.ts`
- `src/app/components/ui/search-input/search-input.html`

**Files to Refactor:**
- `src/app/components/election-detail/section-filters/section-filters.html`
- `src/app/components/election-detail/election-detail.html`
- `src/app/components/region-list/region-list.html`

---

## Implementation Priority

1. **High Priority** (Immediate impact on maintainability):
   - ✅ Base Modal Component - **COMPLETED**
   - ✅ Sortable Table Header Component - **COMPLETED**
   - ✅ Risk Badge Component - **COMPLETED**
   - ✅ Party Filter Button and Dropdown Component - **COMPLETED**
   - ✅ Comparison Operator Input Component (≤/≥) - **COMPLETED**

2. **Medium Priority** (Significant code reduction):
   - ⏳ Table Sorting Service/Utility - **PENDING**
   - ✅ Utility Functions Module - **COMPLETED**
   - ⏳ Chart Configuration Service - **PENDING**
   - ⏳ Election/Region Card Component - **PENDING**
   - ⏳ Statistics Card Component - **PENDING**
   - ⏳ Column Filter Dropdown Component - **PENDING**
   - ⏳ Risk Filter Dropdown Component - **PENDING**
   - ⏳ Risk Analysis Summary Component - **PENDING**

3. **Low Priority** (Nice to have, but less critical):
   - ⏳ Party Selection Logic Service - **PENDING**
   - ⏳ Historical Chart Data Processing Service - **PENDING**
   - ⏳ Search Input with Icon Component - **PENDING**

### Refactoring Status:
- ✅ Candidate Detail Modal - **REFACTORED** to use BaseModalComponent and RiskBadgeComponent
- ✅ Section Detail Modal - **REFACTORED** to use BaseModalComponent and SortableTableHeaderComponent
- ✅ Protocol Error Modal - **REFACTORED** to use BaseModalComponent and SortableTableHeaderComponent
- ✅ Export CSV Modal - **REFACTORED** to use BaseModalComponent
- ✅ Election List - **REFACTORED** to use PartyFilterComponent
- ✅ Region List - **REFACTORED** to use PartyFilterComponent

---

## Notes

- All new components should be standalone Angular components
- Follow existing patterns (signals, effects, etc.)
- Maintain backward compatibility during refactoring
- Test each component/service after creation
- Update imports across the codebase when refactoring
