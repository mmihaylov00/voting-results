# VotesFrontend

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.1.2.

## Election data

The archive contains eight parliamentary elections (2017-2026), both rounds of the 2016 and 2021 presidential elections, and a preliminary snapshot of the 25 October 2026 presidential election. `/governmental` and `/presidential` share the result views, with separate datasets and comparisons. Presidential results show candidate tickets and do not expose parliamentary preference or PP-DB targeting controls.

`src/assets/elections.json` is the catalog. Each entry has a real election `date` (`YYYY.MM.DD`), `name`, and `type` (`governmental` or `presidential`); presidential entries also have `round` (`1` or `2`). Canonical semicolon-delimited tables live in `public/data/<date>/` as `.txt` or `.txt.gz`. The compiler writes versioned summary and full datasets plus `public/data/compiled/manifest.json`.

Import missing elections from SHTABO's Bulgaria manifest:

```bash
npm run import:shtabo -- /path/to/campaign-manager/apps/api/prisma/election-data/BG
```

Existing datasets are preserved. Import validates structure, dates, and paths, but source values still need verification against CIK. The eight historical imports were rebuilt from original CIK archives after incorrect SHTABO protocol mappings were found. Their `SOURCE.md` files record archive hashes, field corrections, and aggregate totals. To reproduce a historical correction with its original ZIP:

```bash
python3 scripts/repair-cik-data.py 2022.10.02 /path/to/export.zip
```

The correction script covers the eight imported historical dates. For a new official export, verify its CIK readme and canonical field mappings before compiling. The preliminary 2026 data comes from the published numerical protocol pages, as described below.

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

### Preliminary CIK page results

The October 2026 snapshot is labelled preliminary throughout the site, with CIK's published update time and national processing percentage. It contains all 12,719 published protocols at 15:00 Sofia time on 26 October (100.00%), including the six sections missing from the earlier 10:00 snapshot. No listed sections remain unprocessed.

To refresh this snapshot before the official export is available:

```bash
uv run --no-project --with curl-cffi python scripts/import-cik-pages.py --cache-dir /tmp/cik-pvr202610-cache
python3 scripts/import_cik_pages_test.py
npm run compile-data -- --date 2026.10.25
npm run verify:data
npm run build
```

The scraper uses two workers, caches raw HTML outside the repository, and validates every candidate total and no-support count against all 32 regional result pages and the national page. Protocol totals are cross-checked against the numerical RIK protocols. It refuses publication if the national snapshot changes during extraction, and it cannot overwrite an election marked final. Published percentages, source counts, unprocessed section IDs and unmatched geography IDs are preserved in `public/data/2026.10.25/source-results.json`.

The `--date` compiler mode loads history of the selected election type, replaces only that date's compiled files, and preserves existing manifest entries. Preliminary snapshots are excluded from compiler and section-tooltip comparison baselines. Refreshing the import and rebuilding the app keeps the source badge and data together. No recurring refresh is scheduled. Replace this snapshot with a verified official export and clear its `provisional` metadata when finalizing, then run a full compilation to refresh all historical comparisons.

The site retains its existing share denominator (signed-in voters); CIK's percentages use valid candidate votes plus no-support votes. Both raw counts and CIK's published percentages are retained. Physical section coordinates are unavailable, and 193 domestic sections have no unambiguous match in the existing settlement catalog; their results remain available in tables. See the election's `SOURCE.md` for field definitions and original protocol discrepancies.

## Maps and analysis

Summary cards span the full row above the workspace. At widths of 1024px and above, result pages align their content tabs on the left with the map on the right. Smaller screens switch between content and the map. History and Comparison are separate tabs; a sole available content tab does not need a selector. Map indicators are selected in the map toolbar, independently of the content tabs. The selector includes winners, summary, preferences, turnout, risks, invalid ballots, no-support ballots, voting method, winner margin, selected-party support, support changes and the parliamentary threshold. Indicator and party changes reuse the loaded scope; maps retain geographic search and level controls. PNG and fullscreen icon buttons sit at the map's top right above its initially expanded legend.

Presidential ticket labels show the first candidate's full name while keeping the original ticket for matching. Rumen Radev and Iliyana Yotova use the Progressive Bulgaria palette, Anastas Gerdzhikov and Tsetska Tsacheva the GERB palette, Mustafa Karadayi the DPS palette, Andrey Gyurov the PP palette, Kostadin Kostadinov the Vazrazhdane palette, Ivelin Mihaylov the Velichie palette, and Radostin Vasilev the MECh palette in both themes. Categorical legends put assigned party colors first, followed by unassigned gray entries and then “Други” in a separate neutral shade, preserving order within each group.

Map selections and section filters share one scope with the totals, charts, and historical comparison. Clear the selected place to return to the wider scope. Map search jumps to a region, municipality, settlement, neighborhood, or section; comparison rows can focus the corresponding map location.

Data refreshes follow the selected scope. A single-election summary request loads only that date and shares pending requests between consumers; the archive loads every displayed date. Local filters, sorting, columns, comparison sides, and coalition selections reuse loaded data. History and comparison panels initialize on first use and retain their charts between tabs. Changing a baseline refreshes the comparison, while a history metric changes only its chart. Background analysis loads do not cover the rest of the page with a loading overlay, and export metadata does not redraw map layers. Result-page trend tooltips and risk comparisons still require history for the selected election type.

Loading indicators belong to the view that requested the data; the shared election service does not broadcast page loading state. Archive cards, section details and candidate history keep their own loading state, so modal downloads leave the page behind them unchanged. Detailed profile loading uses a text-free progress bar based on completed election archives.

Result tables use continuous virtual scrolling: only visible rows and a small buffer are rendered, while filtering, sorting, totals, maps and CSV exports use the complete matching dataset. A Web Worker decompresses and parses election files, transferring numeric columns without copying their buffers; browsers without worker support use the local parser. Section objects are built in batches that yield to the browser. Historical vote maps, candidate-risk details and comparison arrays are read from the compact data when needed, keeping the full archive accessible without retaining expanded details for every section. Candidate comparisons scan each historical election once per scope and cancel obsolete work when the scope changes. Map area and section preferences are calculated only for the preference metric, and completing archive loading avoids repeating the default section filter and sort.

Section maps create and insert markers in batches of at most 100, yielding after approximately 8 ms so table scrolling and map controls can run between batches. New renders and destruction cancel obsolete batches; pending section searches finish when their marker arrives. Section tooltip content is generated when opened, and the initial map bounds are set before batching so later completion does not override an interaction.

History and comparison use elections of the same type and presidential round. Party identities use conservative curated aliases, and section history requires matching region, section code, and settlement. Missing or ambiguous matches are shown as unavailable. Historical coverage is displayed beside the timeline. Change maps require complete matched coverage for each displayed area and show support changes in percentage points.

Comparison tables share the same value cells, leader highlights, and centered differences with arrows toward the higher side. Historical tables group votes, share and turnout as current value, difference and baseline value, retaining place selection, sorting, pagination and CSV export.

Turnout uses voters divided by electorate. Party support, invalid ballots, and no-support ballots use voters as the denominator. Machine share uses machine plus paper votes. Winner margin uses the electorate and is labelled separately. Map legends show fixed numeric thresholds, and PNG exports include context, units, and OpenStreetMap attribution. The timeline also supports PNG export; comparison CSV includes the current and baseline dates and absolute/percentage-point changes.

Neighborhood boundaries in `public/maps/neighborhoods.geojson` come from Shtabo's OpenStreetMap-derived Bulgaria dataset. They provide partial, approximate coverage, not official electoral boundaries. Geometry is simplified to approximately one meter and coordinates rounded to five decimal places. Sections with coordinates are assigned to the smallest containing polygon, respecting polygon holes; uncovered sections remain available in the other map views. Co-located section markers are separated for selection without changing stored coordinates.

## Navigation and investigation tools

Party and presidential candidate names open a shared profile across the election archive. **Обобщение** always shows every unambiguously matched participation, while **Избори** opens an individual result. Geography, sections, risks and parliamentary preferences share an all-election/single-election scope; rows retain their election labels and never sum votes across dates. Presidential profiles match the first candidate's full name and retain the running mate for each participation. Historical changes keep rounds separate and require matched sections, with complete section coverage for geographic aggregates. Missing identities, assessments and geographic matches remain unavailable. Profiles load summaries first and fetch detailed elections only when needed; profile code is deferred until opening.

Preference candidate details reuse the same **Обобщение**, **Избори**, **География**, **Секции** and **Рискове** profile. History matches full names and curated party identities, allowing changed ballot numbers and districts without merging other-party namesakes. Preference shares use party votes in the candidate's districts; per-list ranks remain separate when a person appears in multiple districts. Candidate-specific and common section risks stay distinct; list-level signals are shown separately from section exposure, and section drilldowns open original source data. Archive scans show local progress and yield between batches; changing profile tabs reuses the matched data. Sparse archives cannot distinguish an entirely missing person from a registered candidate with zero preferences, so missing participation is not shown as zero.

The home screen links to the parliamentary archive, presidential archive and **Партии и кандидати** directory. `/governmental/contestants` and `/presidential/contestants` list all archived parties/coalitions and presidential candidates as searchable cards, including historical-only participants. All directory tabs default to **Всички избори**. The election filter includes participants in the selected election and displays that election's result while preserving archive participation counts. Cards reuse profile images and previews and open the existing details. Identities are combined only when unambiguous; latest participation and votes determine the order. Party and presidential browsing loads summary data only.

The directory's **Преференции** tab uses the same card layout, with election and party filters and candidate search. **Само водачи на листата** keeps people who lead at least one list in the displayed election. It scans parliamentary elections once, retaining candidate summaries rather than full section arrays. A person's district results within one election are combined using the same full-name and curated party identities as their profile; ambiguous same-district names remain separate. All-election cards show the latest participation, and shares use the combined party-vote denominator across that person's districts. Election and party changes reuse the archive index without refetching. All three directories reuse the section table's measured virtual scrolling for responsive card rows, with no pagination and only a bounded window mounted. Switching between parliamentary profiles and preferences retains both views' controls and results.

Profile headers include local logos and portraits for every party, coalition or presidential candidate that reached the national top five in an archived election, including preliminary snapshots. `src/assets/contestant-images.json` records image identities, sources, authors and license status; profile images link to their sources with author and license credits in the link title. Images that fail to load leave a text header. [Image sources](public/images/contestants/SOURCES.md) record the source details and logo substitutions. `node --test scripts/contestant-images.test.js` verifies local assets and top-five coverage against the compiled archive; add new qualifying identities when extending the catalog.

Names that open profiles show an avatar, identity and results preview on hover or keyboard focus, with a prompt to open the details. Party and presidential previews use national results for the indicated election and matched archive participation counts; preference previews use the currently loaded scope. Summaries load only after an actual hover or focus, and missing images use initials. The preview remains readable while hovered and dismisses on Escape, click, blur or viewport changes.

Every profile, detail, export, protocol-error and methodology dialog has an **Отвори като страница** icon at the top right. Expanded views keep the shared navigation header, use ordinary page scrolling, and have a URL with `dialog` identifying the view. **Свий до прозорец** restores the same view as a modal without closing it or resetting its controls; `dialogMode=modal` preserves this presentation on refresh. Detail URLs retain the selected section, grouped place or candidate and the result filters. They support refresh and browser Back/Forward; the shared header provides the back button. Following a section or candidate keeps the current page or modal presentation.

Section and preference-candidate details separate results/sections, statistics, history and risks into tabs in both dialogs and expanded pages. Table filters, sorting and columns are retained between tabs; charts mount on their first visit and remain mounted afterward. Section risk history is shown in the risks tab alongside the current signals.

The shared header keeps breadcrumb dropdowns for election type, date and region. Navigation lives in the page tabs below the summary statistics. **Сравнение** combines election-to-election analysis and party/candidate comparisons. **Повтарящи се рискове** follows it on national and regional pages; Geography, polling agencies and **Мандати и коалиции** are available only at national parliamentary scope. Tools load on first opening and stay mounted between tab changes. Existing tool URLs redirect to the corresponding page tab and preserve their selection and regional scope. The below-threshold metric is available in the map indicator selector. Comparisons and simulator selections are stored in the URL. On result pages, **Сподели изгледа** captures the current filters, selected place and party, map level and metric, visible columns, sorting, historical metric and baseline into a link. **Сподели секцията** also opens the selected individual section on arrival. Selected section IDs are compacted into ranges; malformed or oversized state is ignored. The existing browser password prompt still applies to shared links.

Recurring risks count assessed signals in the selected election and earlier elections of the same type and presidential round. Missing assessments and unmatched sections are shown separately from assessed zero. The overview fetches elections sequentially and retains compact section snapshots without candidate detail. It lists sections flagged in at least two comparable elections; section details include the full risk timeline. These are screening signals, not findings of violations.

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
