import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {browser} from '../qa-cogs-mobile/cdp.mjs';
const base = fileURLToPath(new URL('./dist/', import.meta.url)), output = join(base, 'food-questions-shots');
const js = await readFile(join(base, 'food-questions-fixture.js')), css = await readFile(join(base, 'food-questions-fixture.css'));
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><style>body{margin:0;background:#0e0a1f;color:#fff;font-family:Arial,sans-serif}</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>';
const server = createServer((req, res) => {const path = new URL(req.url, 'http://localhost').pathname; res.setHeader('Content-Type', path === '/fixture.js' ? 'text/javascript' : path === '/fixture.css' ? 'text/css' : 'text/html'); res.end(path === '/fixture.js' ? js : path === '/fixture.css' ? css : html);});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`, b = await browser(), batch = '10000000-0000-4000-8000-000000000001';
let passed = 0;
const text = () => b.evaluate('document.body.textContent.replace(/\\s+/g," ")');
const button = name => b.evaluate(`(() => {const e=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(name)});return e?{disabled:e.disabled}:null})()`);
async function click(name) {const found = await button(name); assert.ok(found, name); assert.ok(!found.disabled, `${name} disabled`); await b.evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(name)}).click()`);}
async function type(id, value) {await b.evaluate(`(() => {const e=document.getElementById(${JSON.stringify(id)});if(!e)throw Error('Missing input');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`); await b.until(`document.getElementById(${JSON.stringify(id)}).value===${JSON.stringify(value)}`);}
const waitText = value => b.until(`document.body.textContent.includes(${JSON.stringify(value)})`);
const calls = () => b.evaluate('window.fqQa.calls');
async function run(name, query, test) {
  await b.send('Page.navigate', {url: origin}); await b.until('window.fqQa'); await b.evaluate('sessionStorage.clear()');
  const params = new URLSearchParams(query); if (!params.has('batch')) params.set('batch', batch); if (!params.has('view')) params.set('view', 'foodquestions');
  await b.send('Page.navigate', {url: `${origin}/?${params}`});
  await b.until('document.querySelector("[aria-label=\\"Recipe question\\"]") || document.querySelector("[aria-label=\\"Recipe editor\\"]") || document.body.textContent.includes("Enter your PIN") || document.body.textContent.includes("No emailed batches yet") || document.body.textContent.includes("Your login expired") || document.body.textContent.includes("This batch is no longer available")');
  await b.evaluate(`document.querySelectorAll('.lq-fq-review').forEach(d=>d.open=true)`);
  await test(); console.log(`PASS ${name}`); passed++;
}
await mkdir(output, {recursive: true});
try {
  await run('exact email batch survives PIN login and refresh', 'auth=0', async () => {
    assert.match(await b.evaluate('location.search'), new RegExp(`batch=${batch}`));
    for (const key of ['1', '2', '3', '4']) await click(key); await click('Enter'); await waitText('Cluckin Twisted');
    assert.equal((await calls()).find(c => c.path.includes('/batches/')).path.split('/').at(-1), batch);
    await b.send('Page.reload'); await waitText('Cluckin Twisted'); assert.match(await b.evaluate('location.search'), new RegExp(`batch=${batch}`));
  });
  await run('exact operations question survives PIN login and opens its manager review', 'auth=0&admin=1&mode=review&question=20000000-0000-4000-8000-000000000001', async () => {
    for (const key of ['1', '2', '3', '4']) await click(key); await click('Enter'); await waitText('Linked recipe question');
    assert.equal((await calls()).filter(c => c.path.includes('/batches/')).length, 0); assert.ok(await b.evaluate('document.querySelector(".lq-fq-review").open'));
    assert.match(await b.evaluate('location.search'), /question=20000000-0000-4000-8000-000000000001/); assert.equal(await b.evaluate('document.getElementById("food-question-answer").value'), 'One spicy chicken fillet, 6 oz fries, 1 oz hot honey.');
    await b.send('Page.reload'); await waitText('Linked recipe question'); assert.equal(await b.evaluate('document.querySelector("[aria-label=\\"Recipe question\\"]").dataset.questionId'), '20000000-0000-4000-8000-000000000001');
  });
  await run('one of five questions and plain answer saves without catalog writes', '', async () => {
    assert.equal(await b.evaluate('document.querySelectorAll("[aria-label=\\"Recipe question\\"]").length'), 1); assert.match(await text(), /1 of 5/);
    await type('food-question-answer', 'One Legend patty, 6 oz fries and 1 oz hot honey.'); await click('Save answer'); await waitText('Saved for recipe review.');
    const writes = (await calls()).filter(c => c.method !== 'GET'); assert.equal(writes.length, 1); assert.ok(writes[0].path.endsWith('/answer')); assert.equal(writes[0].body.revision, 'revision-0-1');
    assert.equal(await b.evaluate('window.fqQa.questions[0].status'), 'answered');
  });
  for (const answer of ['No', '1', '32']) await run(`short factual answer ${JSON.stringify(answer)} saves exactly and remains awaiting review`, 'sample=clarification', async () => {
    await type('food-question-answer', answer); await click('Save answer'); await waitText('Saved for recipe review.');
    const writes = (await calls()).filter(c => c.method === 'PUT'); assert.equal(writes.length, 1); assert.equal(writes[0].body.answer, answer);
    assert.equal(await b.evaluate('window.fqQa.questions[0].answer'), answer); assert.equal(await b.evaluate('window.fqQa.questions[0].status'), 'answered');
    await click('All questions'); await waitText('Open 5 questions'); await b.evaluate(`document.querySelector('.lq-fq-batch').click()`); await waitText('Saved · awaiting recipe review');
    assert.equal(await b.evaluate('document.getElementById("food-question-answer").value'), answer); assert.equal((await calls()).filter(c => c.method === 'PUT').length, 1);
  });
  await run('blank and whitespace-only factual answers cannot save', 'sample=clarification', async () => {
    assert.ok((await button('Save answer')).disabled); await type('food-question-answer', ' \n\t '); assert.ok((await button('Save answer')).disabled);
    await b.evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Save answer').click()`);
    assert.equal((await calls()).filter(c => c.method === 'PUT').length, 0); assert.equal(await b.evaluate('window.fqQa.questions[0].status'), 'unanswered');
  });
  await run('skip, return and reload keep unsaved text without sending it', '', async () => {
    await type('food-question-answer', 'Unsaved portion note.'); await click('Skip for now →'); await waitText('Option:'); await click('Previous'); await waitText('Cluckin Twisted');
    assert.equal(await b.evaluate('document.getElementById("food-question-answer").value'), 'Unsaved portion note.');
    await b.send('Page.reload'); await waitText('Cluckin Twisted'); assert.equal(await b.evaluate('document.getElementById("food-question-answer").value'), 'Unsaved portion note.'); assert.equal((await calls()).filter(c => c.method !== 'GET').length, 0);
  });
  await run('home return restores local draft and exact question batch', '', async () => {
    await type('food-question-answer', 'Keep this draft when I return home.'); await click('All questions'); await waitText('Open 5 questions'); await click('Home'); await waitText('Hi, John.');
    await b.evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('My recipe questions')).click()`); await waitText('Open 5 questions'); await b.evaluate(`document.querySelector('.lq-fq-batch').click()`); await waitText('Cluckin Twisted');
    assert.equal(await b.evaluate('document.getElementById("food-question-answer").value'), 'Keep this draft when I return home.');
  });
  await run('option answer has a concrete side-cup example', '', async () => {
    await click('Skip for now →'); await waitText('What does this option add or remove?'); assert.match(await text(), /BBQ sauce in a 2 oz cup on the side/); await type('food-question-answer', 'BBQ is a 2 oz cup on the side.'); await click('Save answer'); await waitText('Saved for recipe review.');
  });
  await run('network failure retains text and requires readback before retry', 'mode=network', async () => {
    await type('food-question-answer', 'One chicken patty.'); await click('Save answer'); await waitText('Could not confirm the save.'); assert.equal(await b.evaluate('document.getElementById("food-question-answer").value'), 'One chicken patty.'); assert.ok((await button('Save answer')).disabled);
    await click('Check saved answer'); await waitText('Your draft is ready to save.'); await click('Save answer'); await waitText('Saved for recipe review.');
  });
  await run('lost response after commit confirms saved answer without a duplicate write', 'mode=lost-response', async () => {
    await type('food-question-answer', 'One patty and six ounces of fries.'); await click('Save answer'); await waitText('Could not confirm the save.'); await click('Check saved answer'); await waitText('Your answer is safely recorded.'); assert.equal((await calls()).filter(c => c.method === 'PUT').length, 1);
  });
  await run('stale answer cannot overwrite another person until explicit replacement', 'mode=conflict', async () => {
    await type('food-question-answer', 'My measured chicken portion.'); await click('Save answer'); await waitText('This question changed.'); await click('Check saved answer'); await waitText('A newer answer is on file');
    assert.equal(await b.evaluate('document.getElementById("food-question-answer").value'), 'My measured chicken portion.'); assert.match(await text(), /Another manager confirmed two tenders/); assert.ok((await button('Save updated answer')).disabled);
    await click('Keep my text to replace it'); await click('Save updated answer'); await waitText('Saved for recipe review.'); assert.equal((await calls()).filter(c => c.method === 'PUT')[1].body.revision, 'other-admin-revision');
  });
  await run('a resolved recipe shows read-only state rather than requesting another answer', 'mode=resolved', async () => {
    assert.match(await text(), /No answer is needed/); assert.equal(await b.evaluate('document.getElementById("food-question-answer")'), null); assert.equal(await button('Save answer'), null);
  });
  await run('staff answering never sees manager mutation controls', 'mode=answered', async () => {
    assert.equal(await b.evaluate('document.querySelector(".lq-fq-review")'), null); assert.match(await text(), /awaiting recipe review/);
  });
  await run('manager resolves only after the exact recipe is valid', 'admin=1&mode=review-conflict', async () => {
    assert.equal(await b.evaluate('document.querySelector(".lq-fq-editor-link").getAttribute("href")'), '/cogs/?view=foodrecipes&key=gotab%3A100');
    await type('food-question-review', 'Checked measured kitchen portion.'); await click('Recipe updated · resolve'); await waitText('Save a valid recipe before resolving');
    assert.equal(await b.evaluate('window.fqQa.questions[0].status'), 'answered'); await click('Check saved answer'); await b.evaluate('window.fqQa.setRecipeValid()'); await click('Recipe updated · resolve'); await waitText('Recipe reviewed and question resolved.');
  });
  await run('manager specific follow-up retains product identity and becomes its next prompt', 'admin=1&mode=review', async () => {
    await type('food-question-review', 'Is that one 4.5 oz Legend patty?'); await click('Ask this follow-up'); await waitText('Please clarify: Is that one 4.5 oz Legend patty?'); assert.equal(await b.evaluate('window.fqQa.questions[0].key'), 'gotab:100'); assert.equal(await b.evaluate('window.fqQa.questions[0].answer'), null);
  });
  await run('resolved question can be reopened for one specific fact despite an existing recipe', 'admin=1&mode=resolved', async () => {
    assert.equal(await button('Recipe updated · resolve'), null); await type('food-question-review', 'Is that a full snack pack or one brownie bite?'); await click('Ask this follow-up'); await waitText('Please clarify: Is that a full snack pack or one brownie bite?');
    assert.equal(await b.evaluate('window.fqQa.questions[0].status'), 'unanswered'); assert.equal(await b.evaluate('window.fqQa.questions[0].currentRecipeId'), 'recipe-chicken'); assert.match(await text(), /Answer just the question above/); assert.doesNotMatch(await text(), /Include sides and dipping sauces/);
  });
  await run('manager review cannot discard a dirty answer draft', 'admin=1&mode=review', async () => {
    await type('food-question-answer', 'Unsaved corrected patty amount.'); await type('food-question-review', 'Checked the plate.');
    assert.ok((await button('Recipe updated · resolve')).disabled); assert.ok((await button('Ask this follow-up')).disabled); assert.equal((await calls()).filter(c => c.method === 'POST').length, 0);
    assert.match(await text(), /Save your edited answer or discard your edits/); await click('Discard answer edits'); assert.equal(await b.evaluate('document.getElementById("food-question-answer").value'), 'One spicy chicken fillet, 6 oz fries, 1 oz hot honey.'); await click('Recipe updated · resolve'); await waitText('question resolved.');
  });
  await run('curated missing-recipe error stays distinct from revision conflict', 'admin=1&mode=error-field', async () => {
    await type('food-question-review', 'Reviewed the quantities.'); await click('Recipe updated · resolve'); await waitText('Save the exact dish or option recipe first.'); assert.doesNotMatch(await text(), /This question changed/);
  });
  await run('clarification asks only the specific operating fact and allows an unsure answer', 'mode=followup', async () => {
    assert.match(await text(), /Do five brownies mean individual bites or full snack packs/); assert.match(await text(), /Your answer/); assert.doesNotMatch(await text(), /Ingredients and amounts for one order|Include sides and dipping sauces/);
    await type('food-question-answer', 'I am not sure; the package label is missing.'); await click('Save answer'); await waitText('Saved for recipe review.'); assert.equal(await b.evaluate('window.fqQa.questions[0].status'), 'answered');
  });
  await run('manager sees queued unasked questions before the scheduled batch', 'admin=1&mode=queued&batch=', async () => {
    await click('View 1 queued kitchen question'); await waitText('Do five brownies mean individual bites or full snack packs'); assert.match(await text(), /Queued kitchen questions/); assert.equal((await calls()).filter(c => c.method !== 'GET').length, 0);
  });
  await run('a manager queues one targeted question from a selected recipe without typing IDs', 'admin=1&view=foodrecipes&recipe=recipe-chicken&batch=', async () => {
    await b.evaluate(`document.querySelector('[aria-label="Ask the kitchen one question"]').open=true`);
    const typeLabel = async (label, value) => {await b.evaluate(`(() => {const e=document.querySelector('[aria-label="${label}"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);};
    await typeLabel('Kitchen question', 'Which exact chicken fillet do we currently use?'); await typeLabel('Kitchen question reason', 'Confirm whether the proposed Legend replacement was adopted.'); await click('Queue this question'); await waitText('Kitchen question queued.');
    const call = (await calls()).find(c => c.method === 'POST'); assert.equal(call.body.productKey, '100'); assert.equal(call.body.productName, 'Cluckin Twisted'); assert.equal(call.body.namespace, 'gotab'); assert.equal(call.body.prompt, 'Which exact chicken fillet do we currently use?'); assert.equal((await calls()).filter(c => c.path.includes('/food-recipes') && c.method !== 'GET').length, 0);
  });
  await run('expired question-queue save preserves prompt, reason and recipe through PIN', 'admin=1&view=foodrecipes&recipe=recipe-chicken&batch=&mode=queue-expired', async () => {
    await b.evaluate(`document.querySelector('[aria-label="Ask the kitchen one question"]').open=true`);
    const typeLabel = async (label, value) => {await b.evaluate(`(() => {const e=document.querySelector('[aria-label="${label}"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);};
    await typeLabel('Kitchen question', 'Which exact fillet do we use now?'); await typeLabel('Kitchen question reason', 'Confirm the proposed Legend replacement.'); await click('Queue this question'); await waitText('Your login expired.'); await click('Log in again'); await waitText('Enter your PIN');
    for (const key of ['1', '2', '3', '4']) await click(key); await click('Enter'); await b.until('document.querySelector("[aria-label=\\"Recipe editor\\"]")');
    await b.evaluate(`document.querySelector('[aria-label="Ask the kitchen one question"]').open=true`);
    assert.equal(await b.evaluate('document.querySelector("[aria-label=\\"Kitchen question\\"]").value'), 'Which exact fillet do we use now?'); assert.equal(await b.evaluate('document.querySelector("[aria-label=\\"Kitchen question reason\\"]").value'), 'Confirm the proposed Legend replacement.'); await click('Queue this question'); await waitText('Kitchen question queued.');
    assert.equal((await calls()).filter(c => c.method === 'POST' && c.path.endsWith('/food-questions'))[1].body.productKey, '100');
  });
  await run('a newer selected recipe beats the old URL key after question-queue PIN recovery', 'admin=1&view=foodrecipes&key=gotab%3A99&batch=&mode=queue-expired', async () => {
    await click('Cluckin Twisted'); await b.evaluate(`document.querySelector('[aria-label="Ask the kitchen one question"]').open=true`);
    const typeLabel = async (label, value) => {await b.evaluate(`(() => {const e=document.querySelector('[aria-label="${label}"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);};
    await typeLabel('Kitchen question', 'Does Cluckin use the Legend patty?'); await typeLabel('Kitchen question reason', 'Confirm a proposed change.'); await click('Queue this question'); await waitText('Your login expired.'); await click('Log in again'); await waitText('Enter your PIN'); for (const key of ['1', '2', '3', '4']) await click(key); await click('Enter'); await b.until('document.querySelector("[aria-label=\\"Ask the kitchen one question\\"]")');
    assert.equal(await b.evaluate('document.querySelector("[aria-label=\\"Recipe editor\\"] h2").textContent'), 'Cluckin Twisted'); assert.equal(await b.evaluate('document.querySelector("[aria-label=\\"Kitchen question\\"]").value'), 'Does Cluckin use the Legend patty?'); assert.match(await b.evaluate('location.search'), /recipe=recipe-chicken/);
  });
  await run('a new batch destination beats the original question link after PIN recovery', 'admin=1&mode=review&question=20000000-0000-4000-8000-000000000001', async () => {
    await click('All questions'); await waitText('Open 5 questions'); await b.evaluate(`document.querySelector('.lq-fq-batch').click()`); await waitText('1 of 5'); await type('food-question-answer', 'Updated portion for the batch.'); await b.evaluate('window.fqQa.expireAuth()'); await click('Save updated answer'); await waitText('Your login expired.'); await click('Log in again'); await waitText('Enter your PIN'); for (const key of ['1', '2', '3', '4']) await click(key); await click('Enter'); await waitText('1 of 5'); assert.match(await b.evaluate('location.search'), new RegExp(`batch=${batch}`)); assert.doesNotMatch(await b.evaluate('location.search'), /question=/); assert.equal(await b.evaluate('document.getElementById("food-question-answer").value'), 'Updated portion for the batch.');
  });
  await run('staff recipe reader cannot queue questions for other people', 'view=foodrecipes&recipe=recipe-chicken&batch=', async () => {
    assert.equal(await b.evaluate('document.querySelector("[aria-label=\\"Ask the kitchen one question\\"]")'), null);
  });
  await run('expired batch read offers PIN recovery and preserves the exact destination', 'mode=get-expired', async () => {
    await click('Log in again'); await waitText('Enter your PIN'); for (const key of ['1', '2', '3', '4']) await click(key); await click('Enter'); await waitText('Cluckin Twisted'); assert.match(await b.evaluate('location.search'), new RegExp(`batch=${batch}`));
  });
  await run('expired manager review offers PIN recovery and retains the saved answer', 'admin=1&mode=review-expired', async () => {
    await type('food-question-review', 'Verified the plate.'); await click('Recipe updated · resolve'); await waitText('Your login expired.'); await click('Log in again'); await waitText('Enter your PIN'); for (const key of ['1', '2', '3', '4']) await click(key); await click('Enter'); await waitText('Cluckin Twisted'); assert.match(await text(), /One spicy chicken fillet/); assert.match(await b.evaluate('location.search'), new RegExp(`batch=${batch}`));
  });
  await run('expired uncertain-write readback retains the local draft through PIN', 'mode=network', async () => {
    await type('food-question-answer', 'My draft before the uncertain save.'); await click('Save answer'); await waitText('Could not confirm the save.'); await b.evaluate('window.fqQa.expireAuth()'); await click('Check saved answer'); await waitText('Your login expired.'); await click('Log in again'); await waitText('Enter your PIN'); for (const key of ['1', '2', '3', '4']) await click(key); await click('Enter'); await waitText('Cluckin Twisted'); assert.equal(await b.evaluate('document.getElementById("food-question-answer").value'), 'My draft before the uncertain save.');
  });
  await run('expired login keeps draft and explains recovery', 'mode=expired', async () => {
    await type('food-question-answer', 'An answer kept after session expiry.'); await click('Save answer'); await waitText('Your login expired.'); assert.equal(await b.evaluate('document.getElementById("food-question-answer").value'), 'An answer kept after session expiry.');
    await click('Log in again'); await waitText('Enter your PIN'); for (const key of ['1', '2', '3', '4']) await click(key); await click('Enter'); await waitText('Cluckin Twisted');
    assert.equal(await b.evaluate('document.getElementById("food-question-answer").value'), 'An answer kept after session expiry.'); assert.match(await b.evaluate('location.search'), new RegExp(`batch=${batch}`));
  });
  await run('invalid batch is explicit and cannot silently open another batch', 'batch=not-a-valid-batch', async () => {
    assert.match(await text(), /This batch is no longer available/); assert.equal(await b.evaluate('document.querySelector("[aria-label=\\"Recipe question\\"]")'), null);
    assert.equal((await calls()).filter(c => c.path.includes('/batches/')).length, 1);
  });
  await run('empty queue shows the next schedule without inventing questions', 'batch=&mode=empty', async () => {
    assert.match(await text(), /Monday and Friday at 1pm/); assert.equal(await button('Save answer'), null); assert.equal((await calls()).filter(c => c.method !== 'GET').length, 0);
  });
  await run('auto-recipe: saving builds the recipe for that exact saved answer and shows it', 'auto=1', async () => {
    assert.match(await text(), /Saving sets the recipe from your answer\. Jon gets a copy and can adjust it\./);
    await type('food-question-answer', '(2) of the biscuits, same we use for fried donuts, wrapped around 2 chocolate chip cookies');
    await click('Save answer'); await waitText("Saved, and it's the recipe now. Jon gets a copy.");
    const writes = (await calls()).filter(c => c.method !== 'GET');
    assert.deepEqual(writes.map(c => c.path.split('/').at(-1)), ['answer', 'build']); assert.equal(writes[1].body.revision, 'saved-1');
    assert.match(await text(), /In the recipe/); assert.match(await text(), /Your answer is the recipe now:/); assert.match(await text(), /2 each Biscuit, Buttermilk, Dough/);
    assert.equal(await b.evaluate('document.getElementById("food-question-answer")'), null);
  });
  await run('auto-recipe: an unmatched part writes nothing and says what Jon will finish', 'auto=1&build=unmatched', async () => {
    await type('food-question-answer', '2 cookies wrapped in dough, powdered sugar on top'); await click('Save answer');
    await waitText('Jon will finish this one'); assert.match(await text(), /“powdered sugar on top”: no powdered sugar on the list, and no amount/);
    assert.match(await text(), /Saved · Jon is finishing the recipe/); assert.match(await text(), /Part of it couldn't be matched to what we buy/);
    assert.equal(await b.evaluate('document.getElementById("food-question-answer").value'), '2 cookies wrapped in dough, powdered sugar on top');
    assert.ok(!(await button('Save updated answer')).disabled);
  });
  await run('auto-recipe: a build that cannot finish leaves the answer saved for the server to build', 'auto=1&build=down', async () => {
    await type('food-question-answer', '2 biscuits, 2 cookies'); await click('Save answer'); await waitText('The recipe will be built from your answer in a few minutes.');
    assert.equal(await b.evaluate('window.fqQa.questions[0].status'), 'answered'); assert.equal((await calls()).filter(c => c.method === 'POST').length, 1);
    assert.match(await text(), /Saved · building the recipe/);
  });
  for (const [name, width, height, mobile] of [['phone-360', 360, 800, true], ['phone-412', 412, 915, true], ['desktop', 1280, 950, false]]) {
    await b.send('Emulation.setDeviceMetricsOverride', {width, height, mobile, deviceScaleFactor: 1});
    await run(`${name} accessible question and saved/error screens`, 'sample=clarification', async () => {
      const metrics = await b.evaluate(`({width:innerWidth,scroll:document.documentElement.scrollWidth,small:[...document.querySelectorAll('.lq-fq button,.lq-fq a')].filter(e=>e.getBoundingClientRect().height>0&&e.getBoundingClientRect().height<44).map(e=>e.textContent),input:getComputedStyle(document.querySelector('textarea')).fontSize})`);
      assert.ok(metrics.scroll <= metrics.width + 1, `${name} overflow`); assert.deepEqual(metrics.small, []); assert.equal(metrics.input, '16px');
      let screenshot = await b.send('Page.captureScreenshot', {format: 'png'}); await writeFile(join(output, `${name}-question.png`), Buffer.from(screenshot.data, 'base64'));
      await type('food-question-answer', 'I am not sure whether the Legend replacement was adopted. Please check with the line cook.'); await click('Save answer'); await waitText('Saved for recipe review.');
      screenshot = await b.send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: true}); await writeFile(join(output, `${name}-saved.png`), Buffer.from(screenshot.data, 'base64'));
    });
    for (const [state, query, wait] of [['built', 'auto=1', "it's the recipe now"], ['unmatched', 'auto=1&build=unmatched', 'Jon will finish this one']]) {
      await run(`${name} answer ${state} screen`, query, async () => {
        await type('food-question-answer', state === 'built' ? '(2) of the biscuits, same we use for fried donuts, wrapped around 2 chocolate chip cookies' : '2 cookies wrapped in dough, powdered sugar on top');
        await click('Save answer'); await waitText(wait);
        const metrics = await b.evaluate(`({width:innerWidth,scroll:document.documentElement.scrollWidth,small:[...document.querySelectorAll('.lq-fq button,.lq-fq a')].filter(e=>e.getBoundingClientRect().height>0&&e.getBoundingClientRect().height<44).map(e=>e.textContent)})`);
        assert.ok(metrics.scroll <= metrics.width + 1, `${name} ${state} overflow`); assert.deepEqual(metrics.small, []);
        const screenshot = await b.send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: true}); await writeFile(join(output, `${name}-${state}.png`), Buffer.from(screenshot.data, 'base64'));
      });
    }
    await run(`${name} recoverable network error`, 'mode=network&sample=clarification', async () => {
      await type('food-question-answer', 'I will check the current chicken package with the line cook.'); await click('Save answer'); await waitText('Could not confirm the save.');
      const screenshot = await b.send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: true}); await writeFile(join(output, `${name}-error.png`), Buffer.from(screenshot.data, 'base64'));
    });
    await run(`${name} short clarification card`, 'mode=followup', async () => {
      const screenshot = await b.send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: true}); await writeFile(join(output, `${name}-clarification.png`), Buffer.from(screenshot.data, 'base64'));
    });
    await run(`${name} manager queue form`, 'admin=1&view=foodrecipes&recipe=recipe-chicken&batch=', async () => {
      await b.evaluate(`const d=document.querySelector('[aria-label="Ask the kitchen one question"]');d.open=true;d.scrollIntoView({block:'start'});window.scrollBy(0,-85)`);
      const screenshot = await b.send('Page.captureScreenshot', {format: 'png'}); await writeFile(join(output, `${name}-manager-queue.png`), Buffer.from(screenshot.data, 'base64'));
    });
    await run(`${name} manager answer review`, 'admin=1&mode=review&sample=clarification&question=20000000-0000-4000-8000-000000000001', async () => {
      const screenshot = await b.send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: true}); await writeFile(join(output, `${name}-manager-review.png`), Buffer.from(screenshot.data, 'base64'));
    });
  }
  assert.deepEqual(b.blocked, [], 'No external request is allowed during offline QA');
  console.log(`${passed} food question scenarios passed; previews: ${output}`);
} finally {await b.close(); await new Promise(resolve => server.close(resolve));}
