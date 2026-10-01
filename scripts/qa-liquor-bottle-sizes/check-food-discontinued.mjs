// Discontinued items on the food walk (tprs 0196): the actual CountFood
// component with synthetic stock. Build first: node serve.mjs --food-voice --build-only
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

const bundle = await readFile(new URL('./dist/food-fixture.js',import.meta.url),'utf8');
const pause = () => new Promise(resolve => setTimeout(resolve,20));
const until = async (predicate, what = 'Food UI condition') => {
  for (let i=0;i<150;i++) { if (predicate()) return; await pause(); }
  throw new Error(`${what} timed out`);
};

let passed = 0;
async function run(name, test, query = 'discontinued') {
  const dom = new JSDOM('<!doctype html><div id="root"></div>',{
    url:`http://localhost/?${query}`,runScripts:'outside-only',pretendToBeVisual:true,
  });
  dom.window.Response = Response;
  dom.window.scrollTo = () => {};
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  try {
    dom.window.eval(bundle);
    const doc = dom.window.document;
    await until(() => doc.querySelector('.lq-fc-row'), 'First shelf');
    const qa = dom.window.foodQa;
    const rowNames = () => [...doc.querySelectorAll('.lq-fc-grid > .lq-fc-row .lq-fc-row-name, .lq-fc-grid > .lq-fc-row-gone')]
      .map(el => el.getAttribute('title') ?? el.textContent);
    const button = text => [...doc.querySelectorAll('button')].find(b => b.textContent.trim() === text);
    const input = (label, value) => {
      const el = [...doc.querySelectorAll('input')].find(e => e.getAttribute('aria-label') === label);
      assert.ok(el, `Missing input: ${label}`);
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(el,value);
      el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
      el.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
    };
    await test({doc, qa, rowNames, button, input});
    passed += 1;
    console.log(`PASS ${name}`);
  } finally {
    dom.window.close();
  }
}

await run('a discontinued item sits last, under its own heading, naming what replaced it', async ({doc, rowNames}) => {
  const names = rowNames();
  assert.equal(names.at(-1), 'Beef Patty, 2oz', 'the leftover row comes last');
  assert.ok(names.indexOf('Beef Patty, 3.5oz') < names.indexOf('Beef Patty, 2oz'));
  const heading = doc.querySelector('.lq-fc-leftovers-head');
  assert.ok(heading, 'the leftovers heading renders');
  assert.match(heading.textContent, /Discontinued, count leftovers/);
  assert.equal(heading.nextElementSibling?.querySelector('.lq-fc-row-name')?.getAttribute('title'), 'Beef Patty, 2oz');
  assert.match(doc.querySelector('.lq-fc-row-leftover')?.textContent ?? '', /Now: Beef Patty, 3\.5oz/);
});

await run('it is not owed: the shelf progress leaves it out', async ({doc}) => {
  const carried = doc.querySelectorAll('.lq-fc-row:not(.lq-fc-row-leftover):not(.lq-fc-row-gone)').length;
  assert.match(doc.querySelector('.lq-fc-zonemeta').textContent, new RegExp(`0 of ${carried} counted`));
});

await run('"None left" takes it off the walk, and Undo puts it back', async ({doc, qa, button}) => {
  button('None left').click();
  await until(() => doc.querySelector('.lq-fc-row-gone'), 'None-left confirmation');
  const archive = qa.calls.filter(c => c.path.endsWith('/skus/patty2/active'));
  assert.equal(JSON.stringify(archive.map(c => [c.method, c.body])), JSON.stringify([['PATCH', {active:false}]]));
  assert.match(doc.querySelector('.lq-fc-row-gone').textContent, /Beef Patty, 2oz: none left, off the walk/);
  button('Undo').click();
  await until(() => !doc.querySelector('.lq-fc-row-gone'), 'Undo');
  assert.equal(JSON.stringify(qa.calls.filter(c => c.path.endsWith('/skus/patty2/active')).at(-1).body), JSON.stringify({active:true}));
  assert.ok(doc.querySelector('.lq-fc-row-leftover'), 'the row is back to count');
});

await run('with leftovers counted, "None left" is not offered', async ({input, button}) => {
  assert.ok(button('None left'));
  input('Beef Patty, 2oz: loose packs', '3');
  await pause();
  assert.equal(button('None left'), undefined);
});

await run('a walk with nothing discontinued looks exactly as before', async ({doc}) => {
  assert.equal(doc.querySelector('.lq-fc-leftovers-head'), null);
  assert.equal(doc.querySelector('.lq-fc-row-leftover'), null);
}, 'definitions');

console.log(`${passed}/5 discontinued scenarios passed`);
