export const prerender = false;

import type { APIRoute } from 'astro';
import liveHoursFile from '../../data/live-hours.json';
import {
  todayKey,
  previousDay,
  nowMinutesCentral,
  isOpenNow,
  type DayKey,
  type DayWindow,
} from '../../data/hours';

// Public hours endpoint. Returns the daily-committed Google Places snapshot
// (see /api/cron/rebuild — cron writes src/data/live-hours.json each morning)
// PLUS computed `now` block so external consumers don't have to re-implement
// the Central-time / past-midnight close logic.
//
// Primary consumer: Roy's Retell pre-call webhook (n8n). Reading this lets
// Roy know whether the venue is open right now without making its own Google
// Places API call — keeps the Places spend on the website's existing daily
// budget (~$0.62/mo) instead of incurring per-call cost on every inbound
// phone call.
//
// No auth. Public business hours.

interface LiveDayHours {
  label: string;
  closed: boolean;
  openMinutes: number;
  closeMinutes: number;
  openLabel: string;
  closeLabel: string;
}

type LiveHours = Record<DayKey, LiveDayHours>;

interface CachedSnapshot {
  fetchedAt?: string;
  hours?: LiveHours;
  rating?: number;
  reviewCount?: number;
}

function toWindow(day: LiveDayHours | undefined): DayWindow | null {
  if (!day || day.closed) return null;
  return {
    openMinutes: day.openMinutes,
    closeMinutes: day.closeMinutes,
    openLabel: day.openLabel,
    closeLabel: day.closeLabel,
  };
}

export const GET: APIRoute = async () => {
  const snap = liveHoursFile as CachedSnapshot;
  const hours = snap.hours ?? null;

  const today = todayKey();
  const yesterday = previousDay(today);
  const nowMin = nowMinutesCentral();

  let isOpen = false;
  let todayLabel = '';
  let todayOpenLabel = '';
  let todayCloseLabel = '';

  if (hours) {
    const todayLive = hours[today];
    const yesterdayLive = hours[yesterday];
    isOpen = isOpenNow(toWindow(todayLive), toWindow(yesterdayLive), nowMin);
    todayLabel = todayLive?.label ?? '';
    todayOpenLabel = todayLive?.openLabel ?? '';
    todayCloseLabel = todayLive?.closeLabel ?? '';
  }

  const body = {
    fetchedAt: snap.fetchedAt ?? null,
    hours,
    now: {
      is_open: isOpen,
      today,
      today_label: todayLabel,
      today_open_label: todayOpenLabel,
      today_close_label: todayCloseLabel,
      minutes_central: nowMin,
    },
  };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      // 60s edge cache — fresh enough that is_open transitions don't lag
      // meaningfully, but spares the Vercel function on repeat hits.
      'Cache-Control': 'public, max-age=60, s-maxage=60',
      // Keep search engines out of this. It's a machine-readable doorway
      // for Roy's pre-call webhook, not a page anyone should land on.
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
    },
  });
};
