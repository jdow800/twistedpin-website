import type { APIRoute } from 'astro';
import { visitDateRequest } from '../../lib/visit-date';

export const prerender = false;

// Retell URL must include the trailing slash: /api/visit-date/.
// This route reads a bundled public projection only. No network, identity,
// bookings, inventory, logs of caller arguments, or externally supplied clock.
export const GET: APIRoute = ({ request }) => visitDateRequest(request);
export const POST: APIRoute = ({ request }) => visitDateRequest(request);
