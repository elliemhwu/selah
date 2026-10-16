import type { AccountType } from '@selah/shared-types';
import { ACCOUNT_TYPES } from '@selah/shared-types';

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  cash: $localize`:@@accountType.cash:Cash`,
  bank: $localize`:@@accountType.bank:Bank`,
  credit_card: $localize`:@@accountType.creditCard:Credit card`,
  stored_value: $localize`:@@accountType.storedValue:Stored value`,
  gift_card: $localize`:@@accountType.giftCard:Gift card`,
};

export const ACCOUNT_TYPE_OPTIONS = ACCOUNT_TYPES.map((type) => ({ type, label: ACCOUNT_TYPE_LABELS[type] }));
