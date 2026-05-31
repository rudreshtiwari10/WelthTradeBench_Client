/**
 * Broker store — polls Upstox positions/funds/orders every 5 s when live.
 * In paper/mock mode all arrays are empty and components fall back to
 * positionsStore (localStorage paper trades).
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
  BrokerFunds,
  BrokerPosition,
  BrokerOrder,
  PlaceOrderParams,
  PlaceOrderResult,
} from '../data/brokerService';

// ─── State shape ──────────────────────────────────────────────────────────

interface BrokerState {
  /** "upstox" when authenticated + credentials present, "paper" otherwise. */
  source: 'upstox' | 'paper';
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
  sandbox: false,
  funds: null,
  positions: [],
  orders: [],
  loading: false,
  error: null,
  lastUpdated: 0,

  // ── init: check auth, then start polling if live ─────────────────────
  async init() {
    try {
      const status = await fetchBrokerStatus();
      set({ source: status.mode === 'upstox' ? 'upstox' : 'paper', sandbox: status.sandbox });
      if (status.mode === 'upstox') {
        await get().refresh();
        get().startPolling();
      }
    } catch {
      // network error during init — stay in paper mode
    }
  },

  // ── refresh: fetch all three in parallel ─────────────────────────────
  async refresh() {
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      const [fundsRes, posRes, ordRes] = await Promise.all([
        fetchBrokerFunds(),
        fetchBrokerPositions(),
        fetchBrokerOrders(),
      ]);
      set({
        source: fundsRes.source === 'upstox' ? 'upstox' : 'paper',
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

  // ── place order ───────────────────────────────────────────────────────
  async placeOrder(params) {
    const result = await placeBrokerOrder(params);
    // Refresh after a short delay so Upstox updates the position
    setTimeout(() => get().refresh(), 1500);
    return result;
  },

  // ── cancel order ──────────────────────────────────────────────────────
  async cancelOrder(orderId) {
    try {
      await cancelBrokerOrder(orderId);
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
      if (useBrokerStore.getState().source === 'upstox') {
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
