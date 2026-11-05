const nativeCount = value => Number.isSafeInteger(value) && value >= 0;
export const commentOrdering = label => typeof label === 'string'
    ? label.startsWith('All comments') ? 'all' : label.startsWith('Newest') ? 'newest'
        : label.startsWith('Most relevant') ? 'most-relevant' : null : null;
export const restrictedCommentView = text => /temporarily blocked|try again later|security check|check you are human|confirm you.re (?:not a robot|human)|unusual activity|automated (?:behavior|behaviour)|\/checkpoint(?:\/|\?)|log in to continue/i.test(String(text));
const unavailableCommentView = text => /this content isn.t available|this (?:post|page|video) (?:is no longer|isn.t) available|the link you followed may be broken/i.test(String(text));
const fingerprint = comments => JSON.stringify(comments.map(comment =>
    [comment.id, comment.parentId, comment.text, comment.textComplete]).sort((a, b) => a[0].localeCompare(b[0])));

/** Completion requires a current native counter and complete, connected captured records. */
export function completeCommentObservation(post, snapshot, ordering = 'all') {
    if (snapshot.error || !nativeCount(snapshot.reportedCount) || snapshot.reportedCount !== post.reportedCount
        || commentOrdering(snapshot.ordering?.text) !== ordering || post.ordering !== ordering
        || !snapshot.ui || !Number.isFinite(snapshot.ui.top) || !Number.isFinite(snapshot.ui.max)
        || snapshot.ui.top < snapshot.ui.max - 2 || snapshot.ui.pending !== 0
        || post.comments.length !== snapshot.reportedCount) return false;
    const records = new Map(post.comments.map(comment => [comment.id, comment]));
    return records.size === post.comments.length && post.comments.every(comment => comment.textComplete === true
        && (comment.parentId === null || comment.parentId !== comment.id && records.has(comment.parentId)));
}

function terminalNote(post, snapshot) {
    if (!nativeCount(snapshot.reportedCount)) return 'Обходени са видимите коментари, но Facebook не показа нативен брояч.';
    if (post.comments.some(comment => comment.textComplete !== true)) return 'Обходени са видимите коментари, но част от събраните текстове остават неразгънати.';
    const ids = new Set(post.comments.map(comment => comment.id));
    if (post.comments.some(comment => comment.parentId !== null && !ids.has(comment.parentId))) return 'Обходени са видимите коментари, но липсва част от родителските коментари.';
    return 'Обходените видими коментари не съвпадат с целия показан брояч.';
}

export function createDriver(env) { const driver = { ...env, async nativeOrdering(desired) { let s = await this.tools.snapshot(this.tab); if (s.error)
        return { error: s.error }; if (s.ordering?.text.startsWith(desired))
        return { s }; const controls = await this.tools.controls(this.tab); const menu = this.tab.playwright.locator('[role="menu"][aria-label="Comment Ordering"]').filter({ visible: true }); if (!(await menu.count())) {
        await controls.getByRole('button', { name: /^(Most relevant|All comments|Newest)/ }).filter({ visible: true }).first().press('Enter');
        await this.tools.observe(this.tab);
    } if (!(await menu.count())) {
        try {
            await menu.waitFor({ state: 'visible', timeoutMs: 7000 });
        }
        catch (error) {
            await this.tools.observe(this.tab);
            if (!(await menu.count()))
                return { error: 'Comment ordering menu did not open' };
        }
    } await menu.getByRole('menuitem', { name: new RegExp('^' + desired) }).press('Enter'); await this.tools.observe(this.tab); s = await this.tools.snapshot(this.tab); if (!s.ordering?.text.startsWith(desired))
        return { error: 'Selected comment ordering is not confirmed' }; return { s }; }, async save() { this.captures.capturedAt = new Date().toISOString(); await this.fs.writeFile(this.dir + '/captures.agent-next.json', JSON.stringify(this.captures, null, 2)); await this.fs.rename(this.dir + '/captures.agent-next.json', this.dir + '/captures.json'); }, async begin(source) { const targetOrdering = this.targetOrdering || 'all', desiredOrdering = { all: 'All comments', newest: 'Newest', 'most-relevant': 'Most relevant' }[targetOrdering]; let post = this.captures.posts.find(p => p.postId === source.id); if (!post) {
        post = { postId: source.id, postUrl: source.url, checkedAt: new Date().toISOString(), status: 'partial', ordering: null, reportedCount: null, notes: [], comments: [] };
        this.captures.posts.push(post);
    } if ((await this.tab.url()).replace(/\/$/, '') !== source.url.replace(/\/$/, '')) {
        await this.tab.goto(source.url);
        await this.tools.observe(this.tab);
    } let ax; if (source.url.includes('/reel/') && (await this.tools.snapshot(this.tab)).error) {
        try {
            await this.tab.playwright.getByRole('button', { name: /^Comment(?:,|$)/ }).filter({ visible: true }).first().waitFor({ state: 'visible', timeoutMs: 7000 });
            const b = await this.tab.playwright.evaluate(() => [...document.querySelectorAll('[role="button"],button')].map(e => ({ label: e.getAttribute('aria-label') || '', r: e.getBoundingClientRect() })).find(b => /^Comment(?:,|$)/.test(b.label) && b.r.width > 0 && b.r.y >= 0 && b.r.bottom <= innerHeight));
            if (b) {
                await this.tab.playwright.getByRole('button', { name: b.label, exact: true }).filter({ visible: true }).first().click();
                await this.tools.observe(this.tab);
            }
        }
        catch (error) {
            await this.tools.observe(this.tab);
        }
    } try {
        const existing = await this.tools.snapshot(this.tab);
        if (!existing.error && existing.comments.length > 0 && existing.ordering?.text.startsWith(desiredOrdering)) {
            post.ordering = targetOrdering;
            if (nativeCount(existing.reportedCount)) post.reportedCount = existing.reportedCount;
            post.status = 'partial';
            post.notes = [];
            await this.tools.merge(this.tab, post);
            return { post };
        }
        if (!existing.error && existing.comments.length > 0 && existing.ordering) {
            const selected = await this.nativeOrdering(desiredOrdering);
            if (selected.error) {
                post.status = 'partial';
                post.ordering = null;
                post.notes = ['Редът на коментарите се проверява повторно.'];
                await this.save();
                return { post, error: selected.error };
            }
            post.ordering = targetOrdering;
            if (nativeCount(selected.s.reportedCount)) post.reportedCount = selected.s.reportedCount;
            post.status = 'partial';
            post.notes = [];
            await this.tools.merge(this.tab, post);
            return { post };
        }
        const thread = (source.url.includes('/reel/') || source.url.includes('/photo')) ? this.tab.playwright.locator('div:has(> h2)').filter({ has: this.tab.playwright.getByRole('heading', { name: 'Comments', exact: true }) }).first() : this.tab.playwright.locator('[role="dialog"]').filter({ visible: true }).filter({ has: this.tab.playwright.getByRole('heading', { name: /['’]s Post$/ }) }).first();
        const sort = thread.getByRole('button', { name: /^(Most relevant|All comments|Newest)/ }).filter({ visible: true }).first();
        await sort.waitFor({ state: 'visible', timeoutMs: 7000 });
        if (!(await sort.textContent() || '').trim().startsWith(desiredOrdering)) {
            const beforeSort = await this.tools.snapshot(this.tab);
            if (beforeSort.ui?.top > 0) {
                await sort.press('Home');
                await this.tools.observe(this.tab);
            }
            if (!(await this.tab.playwright.getByRole('menu', { name: 'Comment Ordering' }).filter({ visible: true }).count())) {
                await sort.press('Enter');
                const sortState = await this.tools.observe(this.tab);
                if (!(await this.tab.playwright.getByRole('menu', { name: 'Comment Ordering' }).filter({ visible: true }).count()) && /The focused UI element is \d+ pop up button \(collapsed\) (Most relevant|All comments|Newest)/.test(sortState)) {
                    await sort.press('Enter');
                    await this.tools.observe(this.tab);
                }
            }
            const orderingMenu = this.tab.playwright.getByRole('menu', { name: 'Comment Ordering' });
            try {
                await orderingMenu.waitFor({ state: 'visible', timeoutMs: 7000 });
            }
            catch (error) {
                await this.tools.observe(this.tab);
                if (!(await orderingMenu.filter({ visible: true }).count()))
                    throw error;
            }
            await orderingMenu.getByText(desiredOrdering, { exact: true }).click();
            await this.tools.observe(this.tab);
        }
        await thread.getByRole('button', { name: new RegExp('^' + desiredOrdering) }).filter({ visible: true }).first().waitFor({ state: 'visible', timeoutMs: 7000 });
        const confirmedOrdering = (await this.tools.snapshot(this.tab)).ordering;
        if (!confirmedOrdering?.text.startsWith(desiredOrdering))
            return { post, error: 'Comment ordering was not confirmed' };
        post.ordering = targetOrdering;
        if ((await this.tools.snapshot(this.tab)).comments.length === 0) {
            try {
                await this.tab.playwright.locator('[role="article"][aria-label^="Comment by"],[role="article"][aria-label^="Reply by"]').first().waitFor({ state: 'visible', timeoutMs: 7000 });
            }
            catch (error) { }
            await this.tools.observe(this.tab);
        }
    }
    catch (error) {
        ax = await this.tools.observe(this.tab);
        if (restrictedCommentView(ax)) return { post, blocked: true };
        const readEmpty = () => this.tab.playwright.evaluate(() => { const modal = [...document.querySelectorAll('[role="dialog"]')].find(e => e.getBoundingClientRect().width > 0); const heading = (location.pathname.startsWith('/reel/') || location.pathname.startsWith('/photo')) ? [...document.querySelectorAll('h2')].find(e => e.textContent?.trim() === 'Comments') : null; const scope = modal || heading?.parentElement; return !!scope && [...scope.querySelectorAll('h2,h3,[role="heading"]')].some(e => e.textContent?.trim() === 'No comments yet'); });
        const firstEmpty = await readEmpty();
        if (firstEmpty) await this.tools.observe(this.tab);
        const empty = firstEmpty && await readEmpty();
        if (empty && post.comments.length > 0) {
            try {
                await this.tab.playwright.locator('[role="article"][aria-label^="Comment by"],[role="article"][aria-label^="Reply by"]').first().waitFor({ state: 'visible', timeoutMs: 7000 });
            }
            catch (error) { }
            await this.tools.observe(this.tab);
            const reappeared = await this.tools.snapshot(this.tab);
            if (reappeared.comments.length > 0) {
                post.status = 'partial';
                post.ordering = null;
                post.notes = ['Коментарите се заредиха след първоначално празния изглед; редът се проверява повторно.'];
                await this.save();
                return { post, error: 'Comments appeared after initial empty view; confirm ordering again' };
            }
        }
        if (empty) {
            const emptySnapshot = await this.tools.snapshot(this.tab);
            if (emptySnapshot.error || emptySnapshot.comments.length || emptySnapshot.ui?.pending !== 0) {
                return { post, error: 'Empty view is not stable after loading' };
            }
            const current = emptySnapshot.reportedCount;
            post.status = current > 0 || current === null && post.reportedCount > 0 || post.comments.length > 0 ? 'partial' : 'complete';
            if (nativeCount(current)) post.reportedCount = current;
            post.ordering = null;
            post.notes = current > 0 ? ['Facebook показва ' + current + ' коментара, но видимият изглед посочва, че още няма коментари.'] : post.comments.length > 0 ? ['При повторната проверка Facebook посочи, че още няма коментари. Запазени са по-рано извлечените коментари.'] : [];
            post.checkedAt = new Date().toISOString();
            await this.save();
            if (!post.comments.length && nativeCount(current) && current > 0
                && Number.isFinite(emptySnapshot.ui.top) && Number.isFinite(emptySnapshot.ui.max)
                && emptySnapshot.ui.top >= emptySnapshot.ui.max - 2) {
                return { post, emptyViewConflictVerified: true, terminal: true };
            }
            return post.status === 'complete'
                ? { post, zero: true, emptyThreadVerified: true, terminal: true }
                : { post, error: 'Empty view conflicts with the native counter or previously captured comments' };
        }
        if (restrictedCommentView(ax))
            return { post, blocked: true };
        const snap = await this.tools.snapshot(this.tab);
        if (snap.error) {
            post.status = !post.comments.length && unavailableCommentView(ax) ? 'unavailable' : 'partial';
            post.notes = [unavailableCommentView(ax) ? 'Facebook изрично посочи, че публикацията не е достъпна.'
                : 'Нишката не беше потвърдена след изчакване; събраните коментари са запазени.'];
            post.checkedAt = new Date().toISOString();
            await this.save();
            return unavailableCommentView(ax) ? { post, unavailable: true, unavailableVerified: true, terminal: true }
                : { post, error: 'Comment thread was not confirmed after loading', detail: String(error?.message || error) };
        }
        post.ordering = snap.ordering?.text.startsWith('All comments') ? 'all' : snap.ordering?.text.startsWith('Newest') ? 'newest' : snap.ordering?.text.startsWith('Most relevant') ? 'most-relevant' : null;
        post.status = 'partial';
        post.notes = ['Редът на коментарите не беше потвърден; проверката продължава.'];
        await this.save();
        return { post, error: 'Could not confirm comment ordering', detail: String(error?.message || error) };
    } const snap = await this.tools.snapshot(this.tab); if (snap.error)
        return { post, error: snap.error }; if (nativeCount(snap.reportedCount)) post.reportedCount = snap.reportedCount; post.status = 'partial'; post.notes = []; await this.tools.merge(this.tab, post); return { post }; }, async collect(source, maxSteps = 24) { const began = Date.now(); const init = await this.begin(source); if (restrictedCommentView(await this.tools.observe(this.tab))) init.blocked = true; if (init.zero || init.unavailable || init.emptyViewConflictVerified || init.blocked || init.error) {
        if (init.blocked || init.error) {
            init.post.status = 'partial';
            if (init.blocked) init.post.notes = ['Проверката е спряна поради ограничение или проверка от Facebook.'];
            await this.save();
        }
        return { postId: source.id, status: init.post.status, captured: init.post.comments.length, reported: init.post.reportedCount,
            blocked: init.blocked, error: init.error, detail: init.detail, unavailable: init.unavailable,
            terminal: !init.blocked && !init.error && init.terminal === true,
            emptyViewConflictVerified: !init.blocked && init.emptyViewConflictVerified === true,
            emptyThreadVerified: init.emptyThreadVerified === true,
            unavailableVerified: init.unavailableVerified === true };
    } const post = init.post; let terminal = false; const stabilityId = source.id + '|' + (this.targetOrdering || 'all'); this.terminalStability = this.terminalStability || {}; const priorStability = this.terminalStability[stabilityId] || {}; let direction = 'down', stable = priorStability.stable || 0, previous = priorStability.previous || '', mappingRetries = 0; for (let i = 0; i < maxSteps && Date.now() - began < 18000; i++) {
        const s = await this.tools.snapshot(this.tab);
        const view = await this.tools.observe(this.tab);
        if (restrictedCommentView(view)) {
            post.status = 'partial'; post.notes = ['Проверката е спряна поради ограничение или проверка от Facebook.'];
            await this.save();
            return { postId: source.id, blocked: true, status: post.status, captured: post.comments.length, terminal: false };
        }
        if (s.error) {
            await this.save();
            return { postId: source.id, error: s.error, status: 'partial', captured: post.comments.length, terminal: false };
        }
        if (nativeCount(s.reportedCount)) post.reportedCount = s.reportedCount;
        const actualOrdering = s.ordering?.text.startsWith('All comments') ? 'all' : s.ordering?.text.startsWith('Newest') ? 'newest' : s.ordering?.text.startsWith('Most relevant') ? 'most-relevant' : null;
        if (actualOrdering !== (this.targetOrdering || 'all')) {
            post.ordering = actualOrdering;
            post.status = 'partial';
            await this.save();
            return { postId: source.id, error: 'Comment ordering changed during traversal', status: post.status, captured: post.comments.length };
        }
        post.ordering = actualOrdering;
        const key = post.comments.length + '|' + s.reportedCount + '|' + (s.ui.top >= s.ui.max - 2 ? 'bottom' : Math.round(s.ui.top)) + '|' + s.ui.pending + '|' + fingerprint(s.comments);
        stable = key === previous ? stable + 1 : 0;
        previous = key;
        this.terminalStability[stabilityId] = { stable, previous };
        const bottom = s.ui.top >= s.ui.max - 2, top = s.ui.top < 2;
        if (completeCommentObservation(post, s, this.targetOrdering || 'all')) {
            if (restrictedCommentView(await this.tools.observe(this.tab))) {
                post.status = 'partial'; post.notes = ['Проверката е спряна поради ограничение или проверка от Facebook.'];
                await this.save();
                return { postId: source.id, blocked: true, status: post.status, captured: post.comments.length, terminal: false };
            }
            const c = await this.tools.snapshot(this.tab);
            if (completeCommentObservation(post, c, this.targetOrdering || 'all') && fingerprint(s.comments) === fingerprint(c.comments)) {
                const before = fingerprint(post.comments);
                await this.tools.merge(this.tab, post);
                if (before === fingerprint(post.comments)) {
                    terminal = true;
                    post.status = 'complete';
                    post.notes = [];
                    break;
                }
            }
        }
        direction = 'down';
        if (bottom && s.ui.pending === 0 && stable >= 3) {
            post.status = 'partial';
            post.notes = [terminalNote(post, s)];
            terminal = true;
            break;
        }
        if (bottom && s.ui.pending === 0) {
            await this.tools.observe(this.tab);
            await this.tools.merge(this.tab, post);
            continue;
        }
        const r = await this.tools.step(this.tab, post, direction, s);
        if (r.blocked) {
            post.status = 'partial'; post.notes = ['Проверката е спряна поради ограничение или проверка от Facebook.'];
            await this.save();
            return { postId: source.id, blocked: true, status: post.status, captured: post.comments.length, terminal: false };
        }
        if (!r.error)
            mappingRetries = 0;
        if (r.error === 'DOM expansion list changed; refresh before expanding' && mappingRetries < 2) {
            mappingRetries++;
            await this.tools.observe(this.tab);
            continue;
        }
        if (r.error) {
            await this.save();
            return { postId: source.id, error: r.error, expected: r.expected, observed: r.observed, status: post.status, captured: post.comments.length };
        }
        if (r.loadingTimedOut)
            break;
    } post.checkedAt = new Date().toISOString(); await this.save(); return { postId: source.id, status: post.status, captured: post.comments.length, reported: post.reportedCount, terminal }; } };
    const collectSlice = driver.collect;
    driver.collect = async function (source, maxSteps = 24) {
        try { return await collectSlice.call(this, source, maxSteps); }
        catch (error) {
            const post = this.captures.posts.find(post => post.postId === source.id);
            let view = '';
            try { view = await this.tools.observe(this.tab); } catch { /* Browser control can be unavailable during a timeout. */ }
            if (post) {
                post.status = 'partial'; post.checkedAt = new Date().toISOString();
                post.notes = [restrictedCommentView(view) ? 'Проверката е спряна поради ограничение или проверка от Facebook.'
                    : 'Управлението на браузъра прекъсна; събраните коментари са запазени за продължаване.'];
                await this.save();
            }
            return { postId: source.id, status: 'partial', captured: post?.comments.length || 0, terminal: false,
                blocked: restrictedCommentView(view), error: restrictedCommentView(view) ? undefined : 'Browser collection action failed',
                detail: String(error?.message || error).slice(0, 500) };
        }
    };
    return driver;
}
