import React from 'react';
import {createRoot} from 'react-dom/client';

const params = new URL(location.href).searchParams, mode = params.get('mode'), admin = params.get('admin') === '1';
const BATCH = '10000000-0000-4000-8000-000000000001', calls = [];
let authed = params.get('auth') !== '0', attempted = 0;
let expireOnce = ['get-expired', 'review-expired', 'queue-expired'].includes(mode);
const specs = [
  ['Cluckin Twisted', null, 'Which chicken fillet do we use now, and how much sauce goes on one order?'],
  ['Kiddo Tenders', 'BBQ sauce', 'How much BBQ sauce is served on the side?'],
  ['Fondue, Anyone?', null, 'How much banana goes on one order, and are the five brownies individual bites or snack packs?'],
  ['Whole Lane Platter', null, 'How much sauce goes on each wing portion?'],
  ['Kiddo Quesadilla', null, 'Which tortilla do we use, and how many pieces per order?'],
];
const questions = specs.map(([productName, optionLabel, prompt], i) => ({
  id: `20000000-0000-4000-8000-00000000000${i + 1}`, key: `gotab:${100 + i}${optionLabel ? '::bbq sauce' : ''}`,
  namespace: 'gotab', productKey: String(100 + i), productName, optionLabel, kind: optionLabel ? 'option' : 'dish', prompt,
  source: 'missing_recipe', qty: 5 + i, status: 'unanswered', answer: null, answeredAt: null, revision: `revision-${i}-1`,
  recipeHref: `/cogs/?view=foodrecipes&key=${encodeURIComponent(`gotab:${100 + i}`)}`, currentRecipeId: null, reviewNote: null,
}));
if (['answered', 'review', 'review-conflict', 'review-expired', 'error-field'].includes(mode)) Object.assign(questions[0], {status: 'answered', answer: 'One spicy chicken fillet, 6 oz fries, 1 oz hot honey.', answeredAt: '2026-10-05T18:05:00Z'});
if (mode === 'resolved') Object.assign(questions[0], {status: 'resolved', currentRecipeId: 'recipe-chicken'});
if (mode === 'followup' || mode === 'queued') Object.assign(questions[0], {source: 'clarification', productName: 'Fondue, Anyone?', productKey: '19179040', key: 'gotab:19179040', recipeHref: '/cogs/?view=foodrecipes&key=gotab%3A19179040', prompt: 'Do five brownies mean individual bites or full snack packs?', reviewNote: 'Old package and recipe differ.'});
if (params.get('sample') === 'clarification') Object.assign(questions[0], {source: 'clarification', prompt: 'Do we currently use the spicy fillet or the Legend patty?'});
let recipeValid = !['review-conflict', 'error-field'].includes(mode);
// tprs 0217: auto=1 is the backend with FOOD_ANSWER_RECIPES_ENABLED; build= picks what the build returns.
const auto = params.get('auto') === '1', buildMode = params.get('build') || 'built';
let builds = 0;
const builtLines = [{name: 'Biscuit, Buttermilk, Dough', amount: '2 each'}, {name: 'Chocolate-Chip Cookies, Individually Wrapped, 1 oz', amount: '2 each'}];
const summary = () => ({id: BATCH, scheduledDate: '2026-10-05', createdAt: '2026-10-05T18:00:00Z', questionCount: questions.length,
  unanswered: questions.filter(q => q.status === 'unanswered').length, answered: questions.filter(q => q.status === 'answered').length, resolved: questions.filter(q => q.status === 'resolved').length});
window.fqQa = {calls, questions, BATCH, otherAnswer: () => Object.assign(questions[0], {answer: 'Another manager confirmed two tenders.', status: 'answered', revision: 'other-admin-revision'}),
  otherResolve: () => Object.assign(questions[0], {status: 'resolved', revision: 'other-resolved', currentRecipeId: 'recipe-chicken'}), expireAuth: () => {authed = false;}, setRecipeValid: () => {recipeValid = true;}};
window.fetch = async (url, options = {}) => {
  const path = new URL(url, location.href).pathname.replace(/\/$/, ''), method = options.method || 'GET', body = options.body ? JSON.parse(options.body) : null;
  calls.push({path, method, body});
  const json = (value, status = 200) => new Response(JSON.stringify(value), {status, headers: {'Content-Type': 'application/json'}});
  const actor = {id: 'staff-john', displayName: 'John Kitchen', roleName: admin ? 'Manager' : 'Staff', permissions: ['bar.read', ...(admin ? ['bar.manage'] : [])]};
  if (path.endsWith('/me')) return authed ? json({actor}) : json({error: 'login_required'}, 401);
  if (path.endsWith('/pin-login')) {authed = true; return json({actor});}
  if (path.endsWith('/logout')) {authed = false; return json({ok: true});}
  if (!authed) return json({error: 'login_required'}, 401);
  if (method === 'GET' && path.endsWith('/food-questions')) return json({batches: ['empty', 'queued'].includes(mode) ? [] : [summary()], pendingReview: questions.filter(q => q.status === 'answered'), queuedQuestions: questions.filter(q => q.source === 'clarification' && q.status === 'unanswered'), canReview: admin, autoRecipe: auto});
  if (method === 'GET' && path.endsWith(`/batches/${BATCH}`)) {
    if (mode === 'get-expired' && expireOnce) {expireOnce = false; authed = false; return json({error: 'login_required'}, 401);}
    return json({batch: summary(), questions, canReview: admin, autoRecipe: auto});
  }
  if (method === 'GET' && path.endsWith('/food-recipes')) return json({recipes: [
    {id: 'recipe-salad', key: 'gotab:99', namespace: 'gotab', productKey: '99', optionLabel: '', labelText: null, kind: 'dish', productName: 'Chicken Salad', name: 'Chicken Salad', basis: 'Previous recipe', note: null, active: true, revision: 'r1', lines: []},
    {id: 'recipe-chicken', key: 'gotab:100', namespace: 'gotab', productKey: '100', optionLabel: '', labelText: null, kind: 'dish', productName: 'Cluckin Twisted', name: 'Cluckin Twisted', basis: 'Previous recipe', note: null, active: true, revision: 'r1', lines: []}], items: [], problems: []});
  if (method === 'POST' && path.endsWith('/food-questions')) {
    if (!admin) return json({error: 'forbidden'}, 403);
    if (mode === 'queue-expired' && expireOnce) {expireOnce = false; authed = false; return json({error: 'login_required'}, 401);}
    const queued = {...questions[0], source: 'clarification', prompt: body.prompt, status: 'unanswered', answer: null}; questions[0] = queued;
    return json({question: queued}, 201);
  }
  const question = questions.find(q => path.includes(q.id));
  if (!question) return json({message: 'No such question batch.'}, 404);
  if (method === 'GET') return json({question, canReview: admin, autoRecipe: auto});
  if (method === 'PUT') {
    attempted++;
    if (mode === 'network' && attempted === 1) throw Error('Simulated dropped connection');
    if (mode === 'expired') {authed = false; return json({error: 'login_required'}, 401);}
    if (mode === 'conflict' && attempted === 1) Object.assign(question, {revision: 'other-admin-revision', status: 'answered', answer: 'Another manager confirmed two tenders.'});
    if (body.revision !== question.revision) return json({error: 'stale_question'}, 409);
    Object.assign(question, {status: 'answered', answer: body.answer, answeredAt: '2026-10-05T18:05:00Z', revision: `saved-${attempted}`});
    if (mode === 'lost-response' && attempted === 1) throw Error('Simulated loss after commit');
    return json({question, autoRecipe: auto});
  }
  if (method === 'POST' && path.endsWith('/build')) {
    builds++;
    if (!auto) return json({error: 'answer_recipes_off', message: 'Saved answers wait for recipe review.'}, 409);
    if (body.revision !== question.revision) return json({status: 'stale', question, message: 'This answer changed. The newest saved answer is shown.'}, 409);
    if (buildMode === 'down') return json({error: 'build_unavailable', message: 'Your answer is saved. The recipe will be built from it in a few minutes.'}, 503);
    if (buildMode === 'unmatched') {
      question.build = {outcome: 'needs_review', kind: 'dish', summary: 'Two cookies; the sugar is not on the list.', createdAt: '2026-10-05T18:06:00Z', current: true,
        lines: builtLines.slice(1), problems: [{said: 'powdered sugar on top', why: 'no powdered sugar on the list, and no amount'}]};
      return json({status: 'needs_review', question, autoRecipe: true});
    }
    Object.assign(question, {status: 'resolved', revision: `built-${builds}`, currentRecipeId: 'recipe-chicken',
      reviewNote: 'Built into the recipe from this answer when it was saved. Jon has a copy.',
      build: {outcome: 'built', kind: 'dish', summary: 'Two cookies wrapped in biscuit dough.', createdAt: '2026-10-05T18:06:00Z', current: true, lines: builtLines, problems: []}});
    return json({status: 'built', question, autoRecipe: true});
  }
  if (method === 'POST' && path.endsWith('/review')) {
    if (!admin) return json({error: 'forbidden'}, 403);
    if (mode === 'review-expired' && expireOnce) {expireOnce = false; authed = false; return json({error: 'login_required'}, 401);}
    if (body.revision !== question.revision) return json({error: 'stale_question'}, 409);
    if (body.action === 'resolve' && !recipeValid) return json(mode === 'error-field' ? {error: 'Save the exact dish or option recipe first. Its ingredient units must be valid.'} : {message: 'Save a valid recipe before resolving this question.'}, 409);
    Object.assign(question, {revision: 'reviewed-revision', reviewNote: body.reason});
    if (body.action === 'resolve') Object.assign(question, {status: 'resolved', currentRecipeId: 'recipe-chicken'});
    else Object.assign(question, {source: 'clarification', status: 'unanswered', answer: null, prompt: `Please clarify: ${body.reason}`});
    return json({question});
  }
  throw Error(`Unexpected mock request ${method} ${path}`);
};
// Capture fixture controls before the app consumes legacy recipe URL params.
import('../../src/components/liquor/LiquorApp.tsx').then(({default: LiquorApp}) => createRoot(document.getElementById('root')).render(<LiquorApp />));
