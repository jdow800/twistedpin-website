// The /cogs landing page with the real Home component and liquor.css. ?role=manager|admin
// picks the person (John V is a manager: bar.count + bar.read; admins add bar.manage);
// ?waiting=N is how many delivered recipe questions are still unanswered.
import React from 'react';
import {createRoot} from 'react-dom/client';
import Home from 'qa:home';
import 'qa:home-css';

const params = new URL(location.href).searchParams;
const admin = params.get('role') === 'admin';
const waiting = Number(params.get('waiting') ?? '3');
window.fetch = async (url) => {
  const path = new URL(url, location.href).pathname.replace(/\/$/, '');
  const json = (value, status = 200) => new Response(JSON.stringify(value), {status, headers: {'Content-Type': 'application/json'}});
  if (path.endsWith('/food-questions')) return json({batches: [{id: 'b1', scheduledDate: '2026-10-05', createdAt: '2026-10-05T18:00:00Z',
    questionCount: 5, unanswered: waiting, answered: 5 - waiting, resolved: 0}], pendingReview: [], queuedQuestions: [], canReview: admin, autoRecipe: true});
  return json({error: 'unexpected ' + path}, 404);
};
const actor = admin
  ? {id: 'admin', displayName: 'Jon Dow', roleName: 'admin', permissions: ['bar.count', 'bar.manage', 'bar.read']}
  : {id: 'manager', displayName: 'John V', roleName: 'manager', permissions: ['bar.count', 'bar.read']};
createRoot(document.getElementById('root')).render(
  <div className="lq-app">
    <header className="lq-header"><span className="lq-brand">Twisted Pin · COGS</span><button type="button" className="lq-logout">Log out</button></header>
    <main className="lq-main"><Home actor={actor} onGo={dest => { document.body.dataset.went = dest; }} /></main>
  </div>);
