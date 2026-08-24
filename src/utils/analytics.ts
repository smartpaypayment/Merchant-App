/**
 * Analytics instrumentation for the events listed in App-PRD Section 14.
 *
 * Intentionally vendor-neutral: `track` fans out to registered sinks, and no
 * sink is installed by default beyond a dev-mode console logger. Wiring Firebase
 * Analytics / Clevertap later means calling `registerAnalyticsSink` once at
 * startup — no call sites change.
 *
 * Event names are a closed union so a typo becomes a compile error rather than a
 * silently-missing metric.
 */

export type AnalyticsEvent =
  | 'app_open'
  | 'login_success'
  | 'kyc_step_complete'
  | 'kyc_submitted'
  | 'qr_generated'
  | 'payment_received'
  | 'payment_link_created'
  | 'refund_initiated'
  | 'settlement_viewed'
  | 'report_exported'
  | 'support_ticket_raised';

export type AnalyticsProps = Record<string, string | number | boolean | undefined>;

type AnalyticsSink = (event: AnalyticsEvent, props?: AnalyticsProps) => void;

const sinks = new Set<AnalyticsSink>();

export function registerAnalyticsSink(sink: AnalyticsSink): () => void {
  sinks.add(sink);
  return () => sinks.delete(sink);
}

/**
 * Records an event.
 *
 * Never throws: a broken analytics sink must not be able to take down a payment
 * flow, so every sink is invoked inside its own try/catch.
 */
export function track(event: AnalyticsEvent, props?: AnalyticsProps): void {
  if (__DEV__ && sinks.size === 0) {
    // eslint-disable-next-line no-console
    console.log(`[analytics] ${event}`, props ?? {});
    return;
  }

  for (const sink of sinks) {
    try {
      sink(event, props);
    } catch {
      /* Analytics failures are always non-fatal. */
    }
  }
}

/**
 * Money in analytics props is reported in **paise**, consistent with Section 8.
 * Named explicitly so a dashboard query is never ambiguous about the unit.
 */
export const paiseProp = (paise: number): number => Math.round(paise);
