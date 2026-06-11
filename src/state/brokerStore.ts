/**
 * Broker store — multi-broker (Upstox + Zerodha/Kite).
 *
 * Polls the ACTIVE broker's positions/funds/orders every 5 s when live.
 * In paper/mock mode all arrays are empty and components fall back to
 * positionsStore (localStorage paper trades). The active broker is persisted
 * to localStorage so a reload keeps the user's choice.
 */
import { create } from 'zustand';
import {
  fetchBrokerFunds,
  fetchBrokerPositions,
  fetchBrokerOrders,
  fetchBrokerStatus,
  placeBrokerOrder,
  cancelBrokerOrder,
} from '../data/brokerService';
import type {
  Broker,
  BrokerAuthInfo,
  BrokerFunds,
  BrokerPosition,
  BrokerOrder,
  PlaceOrderParams,
  PlaceOrderResult,
} from '../data/brokerService';

// ─── Active-broker persistence ────────────────────────────────────────────

const ACTIVE_KEY = 'welthwest:activeBroker';
const loadActiveBroker = (): Broker =>
  (localStorage.getItem(ACTIVE_KEY) === 'kite' ? 'kite' : 'upstox');

const DEFAULT_AUTH: Record<Broker, BrokerAuthInfo> = {
  upstox: { authenticated: false, credentialsPresent: false, sandbox: false },
  kite: { authenticated: false, credentialsPresent: false, sandbox: false },
};

// ─── State shape ──────────────────────────────────────────────────────────

interface BrokerState {
  /** "upstox" | "kite" when authenticated, "paper" otherwise. */
  source: 'upstox' | 'kite' | 'paper';
  activeBroker: Broker;
  auth: Record<Broker, BrokerAuthInfo>;
  sandbox: boolean;
  funds: BrokerFunds | null;
  positions: BrokerPosition[];
  orders: BrokerOrder[];
  loading: boolean;
  error: string | null;
  lastUpdated: number;          // Date.now() of last successful refresh

  // Actions
  init: () => Promise<void>;
  refresh: () => Promise<void>;
  setActiveBroker: (b: Broker) => void;
  placeOrder: (p: PlaceOrderParams) => Promise<PlaceOrderResult>;
  cancelOrder: (orderId: string) => Promise<boolean>;
  startPolling: () => void;
  stopPolling: () => void;
}

// ─── Polling timer (module-level, survives re-renders) ────────────────────

let _pollTimer: ReturnType<typeof setInterval> | null = null;

// ─── Store ────────────────────────────────────────────────────────────────

export const useBrokerStore = create<BrokerState>((set, get) => ({
  source: 'paper',
  activeBroker: loadActiveBroker(),
  auth: DEFAULT_AUTH,
  sandbox: false,
  funds: null,
  positions: [],
  orders: [],
  loading: false,
  error: null,
  lastUpdated: 0,

  // ── init: check auth for all brokers, then poll the active one if live ──
  async init() {
    try {
      const status = await fetchBrokerStatus();
      const auth = status.brokers ?? DEFAULT_AUTH;
      const active = get().activeBroker;
      const activeAuthed = auth[active]?.authenticated ?? false;
      set({
        auth,
        source: activeAuthed ? active : 'paper',
        sandbox: auth[active]?.sandbox ?? false,
      });
      if (activeAuthed) {
        await get().refresh();
        get().startPolling();
      }
    } catch {
      // network error during init — stay in paper mode
    }
  },

  // ── refresh: fetch all three for the active broker in parallel ──────────
  async refresh() {
    if (get().loading) return;
    const broker = get().activeBroker;
    set({ loading: true, error: null });
    try {
      const [fundsRes, posRes, ordRes] = await Promise.all([
        fetchBrokerFunds(broker),
        fetchBrokerPositions(broker),
        fetchBrokerOrders(broker),
      ]);
      const live = fundsRes.source === 'upstox' || fundsRes.source === 'kite';
      set({
        source: live ? (fundsRes.source as 'upstox' | 'kite') : 'paper',
        sandbox: fundsRes.sandbox,
        funds: fundsRes,
        positions: posRes.positions,
        orders: ordRes.orders,
        lastUpdated: Date.now(),
        loading: false,
      });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : 'Refresh failed' });
    }
  },

  // ── switch active broker: persist, clear stale data, refresh if authed ──
  setActiveBroker(b) {
    if (get().activeBroker === b) return;
    localStorage.setItem(ACTIVE_KEY, b);
    const authed = get().auth[b]?.authenticated ?? false;
    set({
      activeBroker: b,
      source: authed ? b : 'paper',
      sandbox: get().auth[b]?.sandbox ?? false,
      // clear the panel until the new account's data lands
      funds: null,
      positions: [],
      orders: [],
    });
    if (authed) {
      get().refresh();
      get().startPolling();
    }
  },

  // ── place order (routed to the active broker) ───────────────────────────
  async placeOrder(params) {
    const result = await placeBrokerOrder({ broker: get().activeBroker, ...params });
    // Refresh after a short delay so the broker updates the position
    setTimeout(() => get().refresh(), 1500);
    return result;
  },

  // ── cancel order ──────────────────────────────────────────────────────
  async cancelOrder(orderId) {
    try {
      await cancelBrokerOrder(orderId, get().activeBroker);
      setTimeout(() => get().refresh(), 1000);
      return true;
    } catch {
      return false;
    }
  },

  // ── polling ───────────────────────────────────────────────────────────
  startPolling() {
    if (_pollTimer !== null) return;
    _pollTimer = setInterval(() => {
      if (useBrokerStore.getState().source !== 'paper') {
        useBrokerStore.getState().refresh();
      }
    }, 5000);
  },

  stopPolling() {
    if (_pollTimer !== null) {
      clearInterval(_pollTimer);
      _pollTimer = null;
    }
  },
}));
