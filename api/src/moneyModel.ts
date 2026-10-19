import { one } from './db';

/**
 * Admin switches for how Sokoni Hub earns from vendors (QC item 2).
 *  - commission_enabled:   take a % of each vendor's product sales (rate set in billing settings)
 *  - subscription_enabled: vendors pay monthly plans, and plan limits apply
 * Only one mode is active at a time: commission mode turns plan limits off, and subscription
 * mode charges no commission. Admins switch between them from the billing settings page, so no
 * code change is needed.
 */
export interface MoneyModel {
  commission_enabled: boolean;
  subscription_enabled: boolean;
}

export async function moneyModel(): Promise<MoneyModel> {
  const row = await one<{ value: any }>(`select value from system_settings where key = 'money_model'`);
  const v = row?.value || {};
  // Exactly one mode is always active. Commission wins only when it is explicitly on;
  // otherwise subscription mode applies (the default, and the fallback for any other state).
  const commission = v.commission_enabled === true;
  return { commission_enabled: commission, subscription_enabled: !commission };
}
