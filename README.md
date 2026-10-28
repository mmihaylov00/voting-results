# VotesFrontend

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.1.2.

## Election data

The archive contains eight parliamentary elections (2017-2026), both rounds of the 2016 and 2021 presidential elections, and official results for the 25 October 2026 presidential election. `/governmental` and `/presidential` share the result views, with separate datasets and comparisons. Presidential results show candidate tickets and do not expose parliamentary preference or PP-DB targeting controls.

`src/assets/elections.json` is the catalog. Each entry has a real election `date` (`YYYY.MM.DD`), `name`, and `type` (`governmental` or `presidential`); presidential entries also have `round` (`1` or `2`). Canonical semicolon-delimited tables live in `public/data/<date>/` as `.txt` or `.txt.gz`. The compiler writes versioned summary and full datasets plus `public/data/compiled/manifest.json`.

Import missing elections from SHTABO's Bulgaria manifest:

```bash
npm run import:shtabo -- /path/to/campaign-manager/apps/api/prisma/election-data/BG
```

Existing datasets are preserved. Import validates structure, dates, and paths, but source values still need verification against CIK. The eight historical imports were rebuilt from original CIK archives after incorrect SHTABO protocol mappings were found. Their `SOURCE.md` files record archive hashes, field corrections, and aggregate totals. To reproduce a historical correction with its original ZIP:

```bash
python3 scripts/repair-cik-data.py 2022.10.02 /path/to/export.zip
```

The correction script covers the eight imported historical dates and the official October 2026 export. For a new official export, verify its CIK readme and canonical field mappings before compiling.

```bash
npm run test:data
python3 scripts/repair_cik_data_test.py
npm run compile-data
npm run verify:data
npm test -- --watch=false
npm run build
```

The verifier checks every compiled election against its canonical source, including section metrics, region totals, candidate names, compression formats, and election-type isolation. Risk baselines use only earlier elections of the same type and presidential round, with party and preference identities matched by names rather than ballot numbers. Ordinary comparison displays also include newer elections.

Published source inconsistencies are retained: April 2021 no-support components sum to 47,760 versus the CIK headline 47,749, and the 2016 runoff components sum to 155,412 versus headline 155,411. Details remain in the relevant `SOURCE.md` files.

Review notes: detail comparisons still load the full history of the selected election type, which can use substantial memory on mobile. Section history matches section IDs; changed addresses or boundaries can limit comparisons. The existing password prompt runs entirely in the browser and stores the entered password in local storage; static data URLs remain publicly accessible. Use hosting-level authentication if access must be restricted.

The existing April 2026 national party catalog omits Smolyan's independent ballot 25 (`ИК Тодор Тодоров Батков`), which is defined in `local_candidates.txt`. Its 2,093 votes remain intact, but result labels can fall back to the ballot number. The data verifier accepts region-only ballots only when a local candidate definition exists.

### Official October 2026 results

The October 2026 dataset uses the [official CIK export](https://results.cik.bg/pvr202610/opendata/export.zip), approved by [Decision 416-ПВР of 27 October 2026](https://www.cik.bg/bg/decisions/416/2026-10-27). It replaces the earlier page-derived snapshot, removes its preliminary metadata and source-results file, and includes all 12,719 sections. Official EKATTE identifiers replace inferred geography; 12,380 sections have published coordinates and 339 do not.

To reproduce the import with the official archive:

```bash
python3 scripts/repair-cik-data.py 2026.10.25 /path/to/export.zip
python3 scripts/repair_cik_data_test.py
npm run compile-data
npm run verify:data
npm run build
```

The importer validates the new protocol layouts and paper/machine vote components before replacing the dataset and catalog together. Candidate and no-support totals were checked against all 32 final regional result pages and the national page; protocol metrics were checked against the final national protocol. The archive hash, field mappings and published inconsistencies are recorded in [the election's SOURCE.md](public/data/2026.10.25/SOURCE.md).

Finalizing a snapshot requires a full compilation so it becomes available in historical comparisons throughout the archive. The `--date` compiler mode is available for later data-only corrections, preserving other manifest entries. The earlier `scripts/import-cik-pages.py` scraper is retained for provenance and refuses to overwrite a final election. No recurring refresh is scheduled.

The site retains its existing share denominator (signed-in voters); CIK's percentages use valid candidate votes plus no-support votes. Published inconsistencies are preserved: October 2026 candidate rows sum to 1,454,357 versus the CIK protocol headline 1,454,359, and candidate plus no-support rows sum to 1,521,710 versus the headline valid-vote total 1,521,723. The site uses the individual candidate vote rows.

## Maps and analysis

Summary cards span the full row above the workspace. At widths of 1024px and above, result pages align their content tabs on the left with the map on the right. Icon-only arrows on the divider between the list and map let either side fill the available width without resetting its filters, scroll position or map view. Panel widths transition over 280ms with a short fade; reduced-motion preferences disable the animation. Smaller screens switch between content and the map. History and Comparison are separate tabs; a sole available content tab does not need a selector. Map indicators are selected in the map toolbar, independently of the content tabs. The selector includes winners, summary, preferences, turnout, risks, invalid ballots, no-support ballots, voting method, winner margin, selected-party support, support changes and the parliamentary threshold. Indicator and party changes reuse the loaded scope; maps retain geographic search and level controls. PNG and fullscreen icon buttons sit at the map's top right above its initially expanded legend.

Presidential ticket labels show the first candidate's full name while keeping the original ticket for matching. Rumen Radev and Iliyana Yotova use the Progressive Bulgaria palette, Anastas Gerdzhikov and Tsetska Tsacheva the GERB palette, Mustafa Karadayi the DPS palette, Andrey Gyurov the PP palette, Kostadin Kostadinov the Vazrazhdane palette, Ivelin Mihaylov the Velichie palette, and Radostin Vasilev the MECh palette in both themes. Categorical legends put assigned party colors first, followed by unassigned gray entries and then “Други” in a separate neutral shade, preserving order within each group.

Map selections and section filters share one scope with the totals, charts, and historical comparison. Clear the selected place to return to the wider scope. Map search jumps to a region, municipality, settlement, neighborhood, or section; comparison rows can focus the corresponding map location.

Data refreshes follow the selected scope. A single-election summary request loads only that date and shares pending requests between consumers; the archive loads every displayed date. Local filters, sorting, columns, comparison sides, and coalition selections reuse loaded data. History and comparison panels initialize on first use and retain their charts between tabs. Changing a baseline refreshes the comparison, while a history metric changes only its chart. Background analysis loads do not cover the rest of the page with a loading overlay, and export metadata does not redraw map layers. Result-page trend tooltips and risk comparisons still require history for the selected election type.

Loading indicators belong to the view that requested the data; the shared election service does not broadcast page loading state. Archive cards, section details and candidate history keep their own loading state, so modal downloads leave the page behind them unchanged. All loaders use the same text-free progress bar, smoothly advancing between reported milestones or estimating progress when a total is unavailable. Bars reach 100% only when loading ends and briefly show completion before disappearing. Reduced-motion preferences disable the fill transition.

Result tables use continuous virtual scrolling: only visible rows and a small buffer are rendered, while filtering, sorting, totals, maps and CSV exports use the complete matching dataset. A Web Worker decompresses and parses election files, transferring numeric columns without copying their buffers; browsers without worker support use the local parser. Section objects are built in batches that yield to the browser. Historical vote maps, candidate-risk details and comparison arrays are read from the compact data when needed, keeping the full archive accessible without retaining expanded details for every section. Candidate comparisons scan each historical election once per scope and cancel obsolete work when the scope changes. Map area and section preferences are calculated only for the preference metric, and completing archive loading avoids repeating the default section filter and sort.

Section maps create and insert markers in batches of at most 100, yielding after approximately 8 ms so table scrolling and map controls can run between batches. New renders and destruction cancel obsolete batches; pending section searches finish when their marker arrives. Section tooltip content is generated when opened, and the initial map bounds are set before batching so later completion does not override an interaction.

History and comparison use elections of the same type and presidential round. Party identities use conservative curated aliases, and section history requires matching region, section code, and settlement. Missing or ambiguous matches are shown as unavailable. Historical coverage is displayed beside the timeline. Change maps require complete matched coverage for each displayed area and show support changes in percentage points.

Comparison tables share the same value cells, leader highlights, and centered differences with arrows toward the higher side. Historical tables group votes, share and turnout as current value, difference and baseline value, retaining place selection, sorting and CSV export. All formerly paginated tables, including recurring risks and profile geography, sections and preferences, use bounded virtual scrolling with sticky headers. Filters and sorting reset the row window; totals and exports retain the full matching dataset.

Turnout uses voters divided by electorate. Party support, invalid ballots, and no-support ballots use voters as the denominator. Machine share uses machine plus paper votes. Winner margin uses the electorate and is labelled separately. Map legends show fixed numeric thresholds, and PNG exports include context, units, and OpenStreetMap attribution. The timeline also supports PNG export; comparison CSV includes the current and baseline dates and absolute/percentage-point changes.

CSV exports share the outlined **Експорт CSV** button and table-download icon. Every export opens a column-selection modal before downloading; section and candidate exports also offer party selection. The file keeps the current scope, search and ordering, and includes only the chosen columns and parties. Cancellation does not download a file. Empty or loading datasets disable export, and download failures show the same retryable message; the column-selection dialog stays open on failure. All CSV files use comma-separated quoted cells, CRLF, a UTF-8 BOM for Bulgarian text, and spreadsheet-formula escaping. The same download helper cleans up temporary links and object URLs. Exports include every matching row, irrespective of the visible scroll window.

Tables share local search and sortable data headers, including geography, polling, mandates, risk history and profile summaries. Sort headers work with click, Enter and Space and expose their direction to assistive technology. New table controls preserve source order until a column is selected, sort numeric values numerically and keep unavailable values last in either direction. Search and sorting reuse loaded rows, reset virtual windows, and leave chart and coalition totals unchanged. Comparison CSV exports follow the table's current search and ordering.

Neighborhood boundaries in `public/maps/neighborhoods.geojson` come from Shtabo's OpenStreetMap-derived Bulgaria dataset. They provide partial, approximate coverage, not official electoral boundaries. Geometry is simplified to approximately one meter and coordinates rounded to five decimal places. Sections with coordinates are assigned to the smallest containing polygon, respecting polygon holes; uncovered sections remain available in the other map views. Co-located section markers are separated for selection without changing stored coordinates.

## Navigation and investigation tools

Party and presidential candidate names open a shared profile across the election archive. **Обобщение** always shows every unambiguously matched participation, while **Избори** opens an individual result. Geography, sections, risks and parliamentary preferences share an all-election/single-election scope; rows retain their election labels and never sum votes across dates. Presidential profiles match the first candidate's full name and retain the running mate for each participation. Historical changes keep rounds separate and require matched sections, with complete section coverage for geographic aggregates. Missing identities, assessments and geographic matches remain unavailable. Profiles load summaries first and fetch detailed elections only when needed; profile code is deferred until opening.

Preference candidate details reuse the same **Обобщение**, **Избори**, **География**, **Секции** and **Рискове** profile. History matches full names and curated party identities, allowing changed ballot numbers and districts without merging other-party namesakes. Preference shares use party votes in the candidate's districts; per-list ranks remain separate when a person appears in multiple districts. Candidate-specific and common section risks stay distinct; list-level risk indicators are shown separately from section exposure, and section drilldowns open original source data. Archive scans show local progress and yield between batches; changing profile tabs reuses the matched data. Sparse archives cannot distinguish an entirely missing person from a registered candidate with zero preferences, so missing participation is not shown as zero.

The home screen links to the parliamentary archive, presidential archive and **Партии и кандидати** directory. `/governmental/contestants` and `/presidential/contestants` list all archived parties/coalitions and presidential candidates as searchable cards, including historical-only participants. All directory tabs default to **Всички избори**. The election filter includes participants in the selected election and displays that election's result while preserving archive participation counts. Cards reuse profile images and previews and open the existing details. Identities are combined only when unambiguous; latest participation and votes determine the order. Party and presidential browsing loads summary data only.

The directory's **Преференции** tab uses the same card layout, with election and party filters and candidate search. **Само водачи на листата** keeps people who lead at least one list in the displayed election. It scans parliamentary elections once, retaining candidate summaries rather than full section arrays. A person's district results within one election are combined using the same full-name and curated party identities as their profile; ambiguous same-district names remain separate. All-election cards show the latest participation, and shares use the combined party-vote denominator across that person's districts. Election and party changes reuse the archive index without refetching. All three directories reuse the section table's measured virtual scrolling for responsive card rows, with no pagination and only a bounded window mounted. Switching between parliamentary profiles and preferences retains both views' controls and results.

Profile headers include local logos and portraits for every party, coalition or presidential candidate that reached the national top five in an archived election, including preliminary snapshots. `src/assets/contestant-images.json` records image identities, sources, authors and license status; profile images link to their sources with author and license credits in the link title. Images that fail to load leave a text header. [Image sources](public/images/contestants/SOURCES.md) record the source details and logo substitutions. `node --test scripts/contestant-images.test.js` verifies local assets and top-five coverage against the compiled archive; add new qualifying identities when extending the catalog.

Names that open profiles show an avatar, identity and results preview on hover or keyboard focus, with a prompt to open the details. Party and presidential previews use national results for the indicated election and matched archive participation counts; preference previews use the currently loaded scope. Summaries load only after an actual hover or focus, and missing images use initials. The preview remains readable while hovered and dismisses on Escape, click, blur or viewport changes.

Every profile, detail, export, protocol-error and methodology dialog has an **Отвори като страница** icon at the top right. Expanded views keep the shared navigation header, use ordinary page scrolling, and have a URL with `dialog` identifying the view. **Свий до прозорец** restores the same view as a modal without closing it or resetting its controls; `dialogMode=modal` preserves this presentation on refresh. Detail URLs retain the selected section, grouped place or candidate and the result filters. They support refresh and browser Back/Forward; the shared header provides the back button. Following a section or candidate keeps the current page or modal presentation.

Section and preference-candidate details separate results/sections, statistics, history and risks into tabs in both dialogs and expanded pages. Table filters, sorting and columns are retained between tabs; charts mount on their first visit and remain mounted afterward. Section risk history is shown in the risks tab alongside the current risk indicators.

The shared header keeps breadcrumb dropdowns for election type, date and region. Navigation lives in the page tabs below the summary statistics. **Сравнение** combines election-to-election analysis and party/candidate comparisons. **Повтарящи се рискове** follows it on national and regional pages; Geography, polling agencies and **Мандати и коалиции** are available only at national parliamentary scope. Tools load on first opening and stay mounted between tab changes. Existing tool URLs redirect to the corresponding page tab and preserve their selection and regional scope. The below-threshold metric is available in the map indicator selector. Comparisons and simulator selections are stored in the URL. On result pages, **Сподели изгледа** captures the current filters, selected place and party, map level and metric, visible columns, sorting, historical metric and baseline into a link. **Сподели секцията** also opens the selected individual section on arrival. Selected section IDs are compacted into ranges; malformed or oversized state is ignored. The existing browser password prompt still applies to shared links.

Below the desktop breakpoint, the header breadcrumbs and all tab rows scroll horizontally. Main page tabs stick below the compact header, with **Списък** and **Карта** together in that row. Map legends sit below domestic and abroad maps; desktop legends remain overlaid. The preliminary-results header notice is hidden on mobile, and the simulator keeps its threshold and reset controls together.

Recurring risks count assessed risk indicators in the selected election and earlier elections of the same type and presidential round. Missing assessments and unmatched sections are shown separately from assessed zero. The overview fetches elections sequentially and retains compact section snapshots without candidate detail. It lists sections flagged in at least two comparable elections; section details include the full risk timeline. CSV export follows the selected region, table search and sorting, including every matching section with its assessment counts, current status and historical indicator codes. These indicators are calculated from election statistics, not submitted reports or findings of violations. The Bulgarian interface and CSV exports use **рискови индикатори** for these assessments.

Risk codes share badges with explanations on hover, keyboard focus and tap, including recurring risks, section history and profile tables. Explanations use the same code definitions throughout the app and include observed values when available. Historical code summaries show neutral badges and general definitions without inventing measurements or severity. Tooltips wrap to the viewport, render inside native dialogs when needed, and dismiss with Escape before closing the dialog.

The map appears only alongside the national list or regional section list; other tabs use the full content width. Map data stays mounted while tabs change, and selecting a comparison place opens the list and focuses the map. Election-to-election tables group votes, share and turnout with the baseline on the left and current results on the right; signed changes remain current minus baseline.

Head-to-head comparisons use one selected election and optional regional scope. Parliamentary comparisons have separate **Между партии** and **Между кандидати** tabs alongside **Между избори**; switching between party and candidate comparisons reuses the loaded data. Presidential comparisons offer election and presidential-candidate tabs. Existing comparison URLs retain their selected view. Candidate identities retain their region, party, ballot number and name. Shares distinguish party votes, total preferences and valid list votes.

The parliamentary below-threshold map uses the national 4% qualification, including votes abroad, and displays each area's share of valid list votes for parties below that threshold. Independent/local ballots count in the national threshold denominator but not as below-threshold parties. No-support, invalid votes and the synthetic `0` aggregate are excluded.

The **Мандати и коалиции** page has **Мандати** and **Симулатор** tabs that share loaded election data. The active tab, threshold and coalition are kept in the URL; switching tabs preserves simulator settings, and the reset icon clears the threshold and coalition. Existing simulator URLs open the simulator tab. The mandates tab shows a semicircle with one dot per seat, party totals and shares of the 240 seats. It uses verified CIK mandates where available and otherwise labels its calculation at the standard 4% threshold. The seat simulator uses national Hare-Niemeyer allocation of 240 seats, an adjustable threshold and selected-party coalition totals against a 121-seat majority. It does not model independent mandates or district allocation. Verified official mandates are currently available for April 2026, linked to CIK Decision 4807-НС. Other elections show simulated mandates only. Party eligibility currently uses the national party catalog; unnamed local ballots are excluded from national party allocation.

The parliamentary **География** view has separate tabs for the ten largest domestic electoral districts, vote origins and demographic correlations by municipality. Panels load on first visit and remain mounted when switching tabs. Demographic indicators stay grouped by category, with ages in ascending order; alternating row backgrounds and party/value tooltips support reading across the plot. **Социологически агенции** has separate accuracy and poll/results tabs. The results table defaults to all agencies, with optional single-agency selection, ordinary percentage columns and highlights for the closest estimate per party, including ties. Its footer shows each agency's MAE and coverage, highlighting the lowest MAE. Missing estimates remain unavailable. Original publications, sample sizes, adjusted shares, original published shares and the number of parties compared are preserved. Demographic categories and agency selections reuse loaded data. The polling agency is stored in the URL. Context snapshots are refreshed with `npm run import:context` and validated before any existing file is replaced. Sources, caveats and the duplicate-row correction are documented in [public/data/context/SOURCES.md](public/data/context/SOURCES.md) and in each view's information dialog.

**Откъде дойдоха гласовете**, within Geography, shows estimated incoming vote flows for all parties by default, with a proportional flow diagram and one horizontal 100% stacked bar per destination party. Connection and segment tooltips show the source, destination, election dates, estimated votes and share on hover or keyboard focus. Source colours and segment order stay consistent across bars, and expandable ranked lists provide exact values on small screens. Its dropdown can isolate one party or restore all parties. It loads independently from the other sections; changing the party or theme reuses the same local matrix. These are ecological estimates from Наясно's matched-section model, including non-voters and changes to the electoral rolls. Counts, coverage, omitted-flow effects and imperfect balancing are identified explicitly. Percentages use the displayed incoming flows for each destination, rather than presenting model totals as official national vote counts.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
