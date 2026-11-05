export function createCollector(env) {
    const { commentCaptureFs, commentCaptureCrypto, commentCaptureDir, commentCaptures, onObserve, authorIdsNeeded } = env;
    return {
        snapshot: async (tab) => await tab.playwright.evaluate(() => {
            const modal = [...document.querySelectorAll("[role=\"dialog\"]")].find(e => e.getBoundingClientRect().width > 0 && [...e.querySelectorAll("h2")].some(h => /['’]s Post$/.test(h.textContent?.trim() || "")));
            const heading = (location.pathname.startsWith("/reel/") || location.pathname.startsWith("/photo")) ? [...document.querySelectorAll("h2")].find(e => e.textContent?.trim() === "Comments") : null;
            const scope = heading?.parentElement || modal;
            if (!scope)
                return {
                    error: "No open comment thread",
                    comments: []
                };
            const rectVisible = e => e.getClientRects().length && getComputedStyle(e).visibility !== "hidden";
            const cards = [...scope.querySelectorAll("[role=\"article\"][aria-label^=\"Comment by\"],[role=\"article\"][aria-label^=\"Reply by\"]")].filter(rectVisible);
            const walk = n => n.nodeType === 3 ? n.nodeValue : n.nodeType !== 1 ? "" : n.tagName === "IMG" ? (n.getAttribute("alt") || "") : n.tagName === "BR" ? "\n" : [...n.childNodes].map(walk).join(n.tagName === "DIV" ? "\n" : "");
            const comments = cards.flatMap(el => {
                const link = [...el.querySelectorAll("a[href*=\"comment_id\"]")].find(a => {
                    if (a.closest("[role=\"article\"]") !== el || a.closest('[dir="auto"]'))
                        return false;
                    const u = new URL(a.getAttribute("href"), location.href);
                    return u.protocol === 'https:' && !u.username && !u.password && !u.port
                        && ['www.facebook.com', 'facebook.com'].includes(u.hostname)
                        && /^\d+$/.test(u.searchParams.get("reply_comment_id") || u.searchParams.get("comment_id") || "");
                });
                if (!link)
                    return [];
                const u = new URL(link.getAttribute("href"), location.href), parent = u.searchParams.get("reply_comment_id") ? u.searchParams.get("comment_id") : null, id = u.searchParams.get("reply_comment_id") || u.searchParams.get("comment_id"), canonical = new URL(u.origin + u.pathname);
                for (const key of ["story_fbid", "id", "fbid", "v"]) {
                    if (u.searchParams.has(key))
                        canonical.searchParams.set(key, u.searchParams.get(key));
                }
                canonical.searchParams.set("comment_id", u.searchParams.get("comment_id"));
                if (parent)
                    canonical.searchParams.set("reply_comment_id", id);
                const nodes = [...el.querySelectorAll("[dir=\"auto\"]")].filter(n => n.closest("[role=\"article\"]") === el && !n.closest("a") && !n.closest("[role=\"button\"]") && !(() => {
                    let a = n.parentElement;
                    while (a && a !== el) {
                        const labels = [...a.querySelectorAll("[role=\"button\"],button")].map(b => b.textContent?.trim());
                        if (labels.includes("See why") && labels.includes("See post anyway"))
                            return true;
                        a = a.parentElement;
                    }
                    return false;
                })()), bodies = nodes.filter(n => !nodes.some(o => o !== n && o.contains(n)));
                return [{
                        id,
                        parentId: parent,
                        url: canonical.href,
                        text: bodies.map(walk).join("\n").trim(),
                        textComplete: ![...el.querySelectorAll("[role=\"button\"],button")].some(b => b.closest("[role=\"article\"]") === el && b.textContent?.trim() === "See more"),
                        publishedAtRaw: link.getAttribute("aria-label") || link.textContent?.trim() || null
                    }];
            });
            let scroller = cards[0]?.parentElement || scope;
            while (scroller && !(scroller.clientHeight > 250 && scroller.scrollHeight > scroller.clientHeight + 5 && /auto|scroll/.test(getComputedStyle(scroller).overflowY)))
                scroller = scroller.parentElement;
            scroller = scroller || scope;
            const r = scroller.getBoundingClientRect();
            const buttons = [...scope.querySelectorAll("[role=\"button\"],button")].filter(rectVisible).map(e => {
                const range = document.createRange();
                range.selectNodeContents(e);
                const textRects = [...range.getClientRects()].filter(r => r.width > 0 && r.height > 0);
                const rect = e.getBoundingClientRect(), point = e.textContent?.trim() === "See more" ? (textRects.at(-1) || rect) : rect;
                const hit = document.elementFromPoint(point.x + point.width / 2, point.y + point.height / 2);
                return {
                    element: e,
                    hit: !!hit && (hit === e || e.contains(hit)),
                    text: e.textContent?.trim() || "",
                    r: e.getBoundingClientRect(),
                    textRect: textRects.at(-1),
                    disabled: e.getAttribute("aria-disabled") === "true" || e.disabled
                };
            });
            const expansions = buttons.filter(b => !b.disabled && (/^View.*(?:repl|comments)/i.test(b.text) || b.text === "See more"));
            const visible = expansions.filter(b => b.hit && b.r.y >= r.y + 8 && b.r.bottom <= Math.min(r.bottom, innerHeight) - 8);
            const viewportCenter = r.y + Math.min(r.height, innerHeight - r.y) * 0.45;
            const nearest = expansions.slice().sort((a, b) => Math.abs(a.r.y + a.r.height / 2 - viewportCenter) - Math.abs(b.r.y + b.r.height / 2 - viewportCenter))[0];
            const targetDelta = nearest ? nearest.r.y + nearest.r.height / 2 - viewportCenter : 0;
            const scrollTarget = nearest ? {
                direction: targetDelta < 0 ? "up" : "down",
                pages: Math.max(0.5, Math.min(4, Math.abs(targetDelta) / innerHeight))
            } : null;
            const chosen = visible.find(b => b.text === "See more") || visible.find(b => /repl/i.test(b.text)) || visible[0] || nearest;
            const buttonPath = [];
            for (let element = chosen?.element; element && element !== scope; element = element.parentElement) {
                const siblings = [...element.parentElement.children].filter(sibling => sibling.tagName === element.tagName);
                buttonPath.unshift(element.tagName.toLowerCase() + ':nth-of-type(' + (siblings.indexOf(element) + 1) + ')');
            }
            const ordering = buttons.find(b => /^(Most relevant|All comments|Newest)/.test(b.text));
            const allCounterButtons = [...(modal ? modal : document).querySelectorAll("[role=\"button\"],button")].filter(e => rectVisible(e) && (modal || e.getBoundingClientRect().y >= 0 && e.getBoundingClientRect().bottom <= innerHeight));
            const label = allCounterButtons.map(e => e.getAttribute("aria-label") || "").find(s => /^Comment on .*post,\s*\d[\d,\s]* comments$/.test(s) || /^Comment,\s*\d[\d,\s]* comments$/.test(s));
            const m = label?.match(/,\s*(\d[\d,\s]*) comments$/);
            return {
                comments,
                reportedCount: m ? Number(m[1].replace(/[,\s]/g, "")) : null,
                ordering: ordering ? {
                    text: ordering.text,
                    x: ordering.r.x + ordering.r.width / 2,
                    y: ordering.r.y + ordering.r.height / 2
                } : null,
                ui: {
                    top: scroller.scrollTop,
                    max: Math.max(0, scroller.scrollHeight - scroller.clientHeight),
                    center: [r.x + 60, r.y + Math.min(r.height, innerHeight - r.y) * 0.4],
                    pending: expansions.length,
                    scrollTarget,
                    kind: heading ? "reel" : "post",
                    menuOpen: [...document.querySelectorAll('[role="menu"]')].some(element => rectVisible(element)
                        && element.textContent?.includes('Hide comment') && element.textContent?.includes('Report comment')),
                    linkPreviewOpen: [...document.querySelectorAll('[aria-label="Close link preview"]')].some(rectVisible),
                    button: chosen ? {
                        text: chosen.text,
                        selector: buttonPath.join(' > '),
                        sameNameIndex: buttons.filter(b => b.text === chosen.text).indexOf(chosen),
                        sameNameCount: buttons.filter(b => b.text === chosen.text).length,
                        x: (chosen.text === "See more" && chosen.textRect ? chosen.textRect.x + chosen.textRect.width / 2 : chosen.r.x + chosen.r.width / 2),
                        y: (chosen.text === "See more" && chosen.textRect ? chosen.textRect.y + chosen.textRect.height / 2 : chosen.r.y + chosen.r.height / 2)
                    } : null
                }
            };
        }, undefined, {
            timeoutMs: 15000
        }),
        async observe(tab) {
            return await tab.playwright.evaluate(() => {
                const visible = e => e.getClientRects().length && e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility !== "hidden";
                const h = [...document.querySelectorAll("h2")].find(e => visible(e) && e.textContent?.trim() === "Comments");
                const modal = [...document.querySelectorAll("[role=\"dialog\"]")].find(e => visible(e) && [...e.querySelectorAll("h2")].some(h => /['’]s Post$/.test(h.textContent?.trim() || "")));
                const scope = h?.parentElement || modal;
                const headings = [...document.querySelectorAll("h1,h2,h3,[role=\"alert\"]")].filter(visible).map(e => e.textContent?.trim() || "");
                const disabled = scope ? [...scope.querySelectorAll("[role=\"button\"][aria-disabled=\"true\"],button:disabled")].filter(visible).map(e => "button \"" + (e.getAttribute("aria-label") || e.textContent?.trim() || "") + "\" [disabled]") : [];
                const ordering = scope ? [...scope.querySelectorAll("[role=\"button\"],button")].filter(visible).map(e => e.textContent?.trim()).find(t => /^(All comments|Most relevant|Newest)/.test(t || "")) : null;
                return JSON.stringify({
                    url: location.href,
                    title: document.title,
                    headings,
                    ordering
                }) + "\n" + disabled.join("\n");
            }, undefined, {
                timeoutMs: 10000
            });
        },
        async controls(tab) {
            const selector = await tab.playwright.evaluate(() => {
                const visible = e => e.getClientRects().length && e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility !== "hidden";
                const modal = [...document.querySelectorAll("[role=\"dialog\"]")].find(e => visible(e) && [...e.querySelectorAll("h2")].some(h => /['’]s Post$/.test(h.textContent?.trim() || "")));
                const h = (location.pathname.startsWith("/reel/") || location.pathname.startsWith("/photo")) ? [...document.querySelectorAll("h2")].find(e => visible(e) && e.textContent?.trim() === "Comments") : null;
                let e = h?.parentElement || modal;
                if (!e)
                    return null;
                const parts = [];
                while (e && e !== document.documentElement) {
                    if (e.id) {
                        parts.unshift("#" + CSS.escape(e.id));
                        break;
                    }
                    const p = e.parentElement;
                    if (!p)
                        break;
                    const siblings = [...p.children].filter(n => n.tagName === e.tagName);
                    parts.unshift(e.tagName.toLowerCase() + ":nth-of-type(" + (siblings.indexOf(e) + 1) + ")");
                    e = p;
                }
                return parts.join(" > ");
            });
            if (!selector)
                throw new Error("Active comment UI scope is not visible");
            return tab.playwright.locator(selector);
        },
        async merge(tab, post, observation = null) {
            const found = (observation ?? await this.snapshot(tab)).comments;
            const needed = onObserve ? authorIdsNeeded?.(post.postId, found) ?? null : [];
            const authors = onObserve && (needed === null || needed.length)
                ? await tab.playwright.evaluate(readVisibleAuthors, needed === null ? undefined : { commentIds: needed }) : [];
            const map = new Map(post.comments.map(c => [c.id, c]));
            for (const c of found) {
                const previous = map.get(c.id);
                if (previous?.textComplete && !c.textComplete)
                    continue;
                const sourceUrl = new URL(post.postUrl);
                sourceUrl.searchParams.set('comment_id', c.parentId ?? c.id);
                if (c.parentId) sourceUrl.searchParams.set('reply_comment_id', c.id);
                map.set(c.id, {
                    ...c,
                    url: sourceUrl.href,
                    capturedAt: new Date().toISOString(),
                    textSha256: commentCaptureCrypto.createHash("sha256").update(c.text).digest("hex")
                });
            }
            post.comments = [...map.values()];
            post.checkedAt = new Date().toISOString();
            commentCaptures.capturedAt = post.checkedAt;
            const temp = commentCaptureDir + "/captures.next.json";
            await commentCaptureFs.writeFile(temp, JSON.stringify(commentCaptures, null, 2));
            await commentCaptureFs.rename(temp, commentCaptureDir + "/captures.json");
            if (onObserve) {
                const foundIds = new Set(found.map(comment => comment.id));
                await onObserve({ postId: post.postId,
                    comments: found.map(comment => ({ id: comment.id, parentId: comment.parentId })),
                    authors: authors.filter(author => foundIds.has(author.commentId)) });
            }
            return {
                postId: post.postId,
                captured: post.comments.length,
                topLevel: post.comments.filter(c => !c.parentId).length,
                replies: post.comments.filter(c => c.parentId).length,
                incomplete: post.comments.filter(c => !c.textComplete).length
            };
        },
        async step(tab, post, direction = "down", observation = null) {
            let s = observation || await this.snapshot(tab);
            if (s.error) return { error: s.error };
            await this.merge(tab, post, s);
            if (s.ui.menuOpen) {
                await tab.playwright.locator('[role="menu"]').filter({ visible: true }).first().press("Escape", { timeoutMs: 10000 });
                await this.observe(tab);
                s = await this.snapshot(tab);
            }
            if (s.ui?.linkPreviewOpen) {
                await tab.playwright.locator('[aria-label="Close link preview"]').filter({ visible: true }).first().click({ timeoutMs: 10000 });
                await this.observe(tab);
                s = await this.snapshot(tab);
            }
            if (s.error)
                return {
                    error: s.error
                };
            const ui = s.ui, controls = await this.controls(tab);
            let action;
            if (ui.button) {
                action = ui.button.text;
                const text = ui.button.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const targets = controls.locator(ui.button.selector || '[role="button"],button').filter({
                    hasText: new RegExp('^\\s*' + text + '\\s*$')
                }).filter({
                    visible: true
                });
                const count = await targets.count();
                const expected = ui.button.selector ? 1 : ui.button.sameNameCount;
                if (count !== expected)
                    return {
                        error: "DOM expansion list changed; refresh before expanding",
                        expected,
                        observed: count
                    };
                await targets.nth(ui.button.selector ? 0 : ui.button.sameNameIndex).click({ timeoutMs: 10000 });
            }
            else if (s.comments.length) {
                action = "focus final comment link and End";
                const id = s.comments.at(-1).id;
                if (!/^\d+$/.test(id)) return { error: 'Final comment ID is not grounded in the thread' };
                await controls.locator('a[href*="comment_id=' + id + '"]').last().press("End", { timeoutMs: 10000 });
            }
            else {
                action = "End on comment ordering";
                const sort = controls.locator("[role=\"button\"][aria-haspopup=\"menu\"]").filter({
                    hasText: /^(Most relevant|All comments|Newest)\s*$/
                }).first();
                await sort.press("End", { timeoutMs: 10000 });
            }
            let state = await this.observe(tab);
            if (/temporarily blocked|You're Temporarily Blocked|try again later/i.test(state))
                return {
                    blocked: true
                };
            let loadingTimedOut = false;
            if (/button "View[^\n]*Loading[^\n]*\[disabled\]/.test(state)) {
                try {
                    await tab.playwright.getByRole("button", {
                        name: /^View .*Loading/
                    }).first().waitFor({
                        state: "hidden",
                        timeoutMs: 7000
                    });
                    state = await this.observe(tab);
                }
                catch (error) {
                    loadingTimedOut = true;
                }
            }
            return {
                action,
                beforeTop: ui.top,
                beforeMax: ui.max,
                pending: ui.pending,
                loadingTimedOut,
                ...await this.merge(tab, post)
            };
        }
    };
}
export function ccInstallSnapshotFix(tools) {
    const original = tools.snapshot;
    tools.snapshot = async function (tab) {
        const s = await original(tab);
        if (s.error)
            return s;
        const info = await tab.playwright.evaluate(() => {
            const modal = [...document.querySelectorAll("[role=\"dialog\"]")].find(e => e.getBoundingClientRect().width > 0);
            const h = (location.pathname.startsWith("/reel/") || location.pathname.startsWith("/photo")) ? [...document.querySelectorAll("h2")].find(e => e.textContent?.trim() === "Comments") : null;
            const scope = modal || h?.parentElement;
            const els = [...(modal || document).querySelectorAll("[role=\"button\"],button")].filter(e => e.getClientRects().length && (modal || (e.getBoundingClientRect().y >= 0 && e.getBoundingClientRect().bottom <= innerHeight)));
            const label = els.map(e => e.getAttribute("aria-label") || "").find(t => /^Comment(?: on .*post)?,\s*\d[\d,\s]* comments?$/.test(t));
            const m = label?.match(/,\s*(\d[\d,\s]*) comments?$/);
            const pending = scope ? [...scope.querySelectorAll("[role=\"button\"],button,[role=\"progressbar\"],[role=\"status\"],[aria-label=\"Loading...\"],[aria-label=\"Loading\"]")].filter(e => e.getClientRects().length && ((e.getAttribute("aria-disabled") === "true" || e.disabled) && /^View.*(?:comments|repl)/i.test(e.textContent || "") || e.getAttribute("role") === "progressbar" || (e.getAttribute("role") === "status" && /^Loading/.test(e.textContent?.trim() || "")) || /^Loading/.test(e.getAttribute("aria-label") || ""))).length : 0;
            return {
                reported: m ? Number(m[1].replace(/[,\s]/g, "")) : null,
                pending
            };
        });
        if (s.reportedCount === null)
            s.reportedCount = info.reported;
        s.ui.pending += info.pending;
        return s;
    };
    return tools;
}

/** Read only rendered bylines. Display names select the byline, never link accounts. */
export function readVisibleAuthors(input) {
    const rootDocument = input && typeof input.querySelectorAll === 'function' ? input : document;
    const wanted = Array.isArray(input?.commentIds) ? new Set(input.commentIds) : null;
    const visible = element => element.getClientRects().length && element.getBoundingClientRect().width > 0;
    const modal = [...rootDocument.querySelectorAll('[role="dialog"]')].find(element => visible(element)
        && [...element.querySelectorAll('h2')].some(heading => /['’]s Post$/.test(heading.textContent?.trim() || '')));
    const heading = /^\/(reel|photo)/.test(rootDocument.location.pathname)
        ? [...rootDocument.querySelectorAll('h2')].find(element => visible(element) && element.textContent?.trim() === 'Comments') : null;
    const scope = heading?.parentElement || modal;
    if (!scope) return [];
    const reserved = new Set(['posts', 'reel', 'watch', 'photo', 'photos', 'groups', 'pages', 'share',
        'login', 'help', 'settings', 'marketplace', 'stories', 'gaming', 'events', 'friends',
        'profile.php', 'photo.php', 'story.php', 'hashtag', 'search']);
    function identity(href) {
        try {
            const url = new URL(href, rootDocument.location.href);
            if (url.protocol !== 'https:' || url.username || url.password || url.port
                || !['www.facebook.com', 'facebook.com'].includes(url.hostname)) return null;
            if (url.pathname === '/profile.php' && /^[1-9]\d{4,39}$/.test(url.searchParams.get('id') || '')) {
                return 'uid:' + url.searchParams.get('id');
            }
            const parts = url.pathname.split('/').filter(Boolean);
            if (parts.length === 3 && parts[0] === 'people' && /^[1-9]\d{4,39}$/.test(parts[2])) return 'uid:' + parts[2];
            if (parts.length === 1 && /^[a-z0-9](?:[a-z0-9.]{0,98}[a-z0-9])?$/i.test(parts[0]) && !reserved.has(parts[0].toLowerCase())) {
                return /^[1-9]\d{4,39}$/.test(parts[0]) ? 'uid:' + parts[0] : 'handle:' + parts[0].toLowerCase();
            }
        } catch { return null; }
        return null;
    }
    return [...scope.querySelectorAll('[role="article"][aria-label^="Comment by"],[role="article"][aria-label^="Reply by"]')]
        .filter(visible).flatMap(card => {
            const anchors = [...card.querySelectorAll('a[href]')].filter(anchor => anchor.closest('[role="article"]') === card);
            const ids = new Set(anchors.flatMap(anchor => {
                try {
                    if (anchor.closest('[dir="auto"]')) return [];
                    const url = new URL(anchor.getAttribute('href'), rootDocument.location.href);
                    if (url.protocol !== 'https:' || url.username || url.password || url.port
                        || !['www.facebook.com', 'facebook.com'].includes(url.hostname)) return [];
                    const id = url.searchParams.get('reply_comment_id') || url.searchParams.get('comment_id');
                    return /^\d{1,40}$/.test(id || '') ? [id] : [];
                } catch { return []; }
            }));
            if (ids.size !== 1) return [];
            if (wanted && !wanted.has([...ids][0])) return [];
            const body = [...card.querySelectorAll('[dir="auto"]')].find(element =>
                element.closest('[role="article"]') === card && !element.closest('a,[role="button"]'));
            const documentOrder = [...card.querySelectorAll('*')];
            const label = card.getAttribute('aria-label') || '';
            const byline = anchors.find(anchor => {
                const text = anchor.textContent?.trim() || '';
                return text && (label.startsWith('Comment by ' + text) || label.startsWith('Reply by ' + text))
                    && (!body || documentOrder.indexOf(anchor) < documentOrder.indexOf(body))
                    && identity(anchor.getAttribute('href')) !== null;
            });
            return [{ commentId: [...ids][0], identity: byline ? identity(byline.getAttribute('href')) : null }];
        });
}
