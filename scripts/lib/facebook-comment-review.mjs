import { commentOrdering, restrictedCommentView } from './facebook-comment-driver.mjs';

export function createReviewer(env) {
    return {
        ...env,
        async save() {
            this.qa.updatedAt = new Date().toISOString();
            const progress = {
                updatedAt: this.qa.updatedAt,
                donePostIds: this.qa.posts.filter(post => post.reviewComplete).map(post => post.postId),
                currentQueueIndex: this.index, currentPostId: this.queue[this.index] || null,
                currentOrdering: this.stage, totalPosts: this.queue.length,
            };
            for (const [name, data] of [['traversal-qa', this.qa],
                ['review-state', { queue: this.queue, index: this.index, stage: this.stage }],
                ['completion-progress', progress]]) {
                await this.fs.writeFile(`${this.dir}/${name}.next.json`, JSON.stringify(data, null, 2));
                await this.fs.rename(`${this.dir}/${name}.next.json`, `${this.dir}/${name}.json`);
            }
        },
        async step(maxSteps = 24) {
            if (this.index >= this.queue.length) return { finished: true };
            const id = this.queue[this.index];
            const source = this.source.posts.find(post => post.id === id);
            if (!source) { await this.save(); return { postId: id, error: 'Queued post is missing from the source catalog' }; }
            let q = this.qa.posts.find(post => post.postId === id);
            if (q?.needsOrderRecheck) this.stage = q.allTerminal ? 'newest' : 'all';
            this.driver.targetOrdering = this.stage;
            let result;
            try { result = await this.driver.collect(source, maxSteps); }
            catch (error) {
                await this.save();
                return { postId: id, error: 'Collection slice failed', detail: String(error?.message || error).slice(0, 500) };
            }
            const post = this.captures.posts.find(post => post.postId === id);
            if (result.blocked || result.error || !post) {
                await this.save();
                return post ? result : { ...result, error: result.error || 'Collection did not return a captured post' };
            }
            if (result.terminal !== true) {
                await this.save();
                return { ...result, reviewed: this.index, stage: this.stage };
            }
            if (result.emptyViewConflictVerified === true && !(post.comments.length === 0
                && Number.isSafeInteger(post.reportedCount) && post.reportedCount > 0 && post.status === 'partial')) {
                await this.save();
                return { ...result, terminal: false, error: 'Empty-view conflict proof does not match the captured post' };
            }
            q ||= { postId: id };
            if (!this.qa.posts.includes(q)) this.qa.posts.push(q);
            if (result.unavailableVerified === true) {
                q.unavailableVerified = true;
                q.emptyThreadVerified = false;
                q.emptyViewConflictVerified = false;
            } else if (result.emptyThreadVerified === true && post.comments.length === 0
                && (post.reportedCount === null || post.reportedCount === 0) && post.status === 'complete') {
                q.emptyThreadVerified = true;
                q.unavailableVerified = false;
                q.emptyViewConflictVerified = false;
            } else if (result.emptyViewConflictVerified === true && post.comments.length === 0
                && Number.isSafeInteger(post.reportedCount) && post.reportedCount > 0 && post.status === 'partial') {
                q.emptyViewConflictVerified = true;
                q.emptyThreadVerified = false;
                q.unavailableVerified = false;
                delete q.allTerminal;
                delete q.newestTerminal;
                delete q.orderProof;
            } else {
                q.emptyThreadVerified = false;
                q.unavailableVerified = false;
                q.emptyViewConflictVerified = false;
                let observed;
                try {
                    const view = await this.tools.observe(this.driver.tab);
                    if (restrictedCommentView(view)) {
                        await this.save();
                        return { ...result, blocked: true, terminal: false };
                    }
                    observed = await this.tools.snapshot(this.driver.tab);
                } catch (error) {
                    await this.save();
                    return { ...result, terminal: false, error: 'Terminal comment ordering could not be read',
                        detail: String(error?.message || error).slice(0, 500) };
                }
                const confirmed = !observed.error && commentOrdering(observed.ordering?.text) === this.stage;
                q.orderProof = { ...(q.orderProof || {}), [this.stage]: {
                    label: observed.ordering?.text || null, checkedAt: new Date().toISOString(),
                    reportedCount: observed.reportedCount ?? null, captured: post.comments.length,
                } };
                q[`${this.stage}Terminal`] = confirmed;
                if (!confirmed) {
                    post.status = 'partial';
                    post.notes = ['Крайният ред на коментарите не беше потвърден; проверката остава незавършена.'];
                    await this.driver.save();
                    await this.save();
                    return { ...result, status: post.status, terminal: false,
                        error: observed.error || 'Terminal ordering does not match the selected order' };
                }
                if (this.stage === 'newest' && !q.allTerminal) {
                    this.stage = 'all';
                    await this.save();
                    return { ...result, terminal: false, error: 'All comments ordering proof is missing; check that order first' };
                }
            }
            q.reported = post.reportedCount;
            q.captured = post.comments.length;
            q.checkedAt = post.checkedAt;
            if (this.stage === 'all' && post.status === 'partial' && !q.unavailableVerified && !q.emptyViewConflictVerified) {
                this.stage = 'newest';
            } else {
                if (this.stage === 'newest' && !q.emptyViewConflictVerified) {
                    post.notes = post.status === 'partial'
                        ? ['Проверени са „Всички коментари“ и „Най-нови“; показаният брояч е '
                            + (post.reportedCount ?? 'недостъпен') + ', а достъпните коментари са ' + post.comments.length + '.']
                        : ['Проверени са „Всички коментари“ и „Най-нови“.'];
                    await this.driver.save();
                }
                q.needsOrderRecheck = false;
                q.actualEndingOrdering = post.ordering;
                q.reviewComplete = true;
                this.index++;
                this.stage = 'all';
            }
            await this.save();
            return { ...result, reviewed: this.index, nextStage: this.stage };
        },
    };
}
